import React, { useState, useEffect } from 'react';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    getRedirectResult,
    signInWithPopup,
    signInWithRedirect,
    updateProfile,
    sendEmailVerification,
    updatePassword,
    sendPasswordResetEmail,
    linkWithCredential,
    EmailAuthProvider,
    reauthenticateWithCredential
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { AuthContext } from './AuthContext.js';
import { onSnapshot } from 'firebase/firestore';
import { getTrialEndsAt, TRIAL_DAYS } from '../utils/trial';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const shouldUseRedirectForGoogleAuth = () => {
    if (typeof window === 'undefined') return false;
    const userAgent = window.navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    return isIOS || isStandalone;
};

const toDate = (value) => {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const hasActiveAdminProOverride = (userData, now = new Date()) => {
    const override = userData?.adminProOverride;
    if (!override?.active) return false;

    const expiresAt = toDate(override.expiresAt);
    return !expiresAt || now < expiresAt;
};

const shouldExtendTrialToThirtyDays = (userData, now = new Date()) => {
    if (!userData) return false;
    if (hasActiveAdminProOverride(userData)) return false;
    if (userData.isPro === true || userData.isPro === undefined || userData.isPro === null) return false;
    if (userData.paypalSubscriptionId) return false;

    const createdAt = toDate(userData.createdAt);
    if (!createdAt) return false;

    const thirtyDayTrialEndsAt = getTrialEndsAt(createdAt);
    if (thirtyDayTrialEndsAt <= now) return false;

    const currentTrialEndsAt = toDate(userData.trialEndsAt);
    return !currentTrialEndsAt || currentTrialEndsAt < thirtyDayTrialEndsAt;
};

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [userDataLoading, setUserDataLoading] = useState(true);
    const [loading, setLoading] = useState(true);
    const [statusCheckedAt, setStatusCheckedAt] = useState(() => new Date());

    useEffect(() => {
        const intervalId = window.setInterval(() => setStatusCheckedAt(new Date()), 60 * 1000);
        return () => window.clearInterval(intervalId);
    }, []);

    /**
     * Crea el documento de perfil en Firestore SOLO si no existe ya.
     * Esto protege los datos de usuarios existentes de ser sobrescritos.
     */
    async function ensureUserProfile(user, extraData = {}) {
        if (!db) return;
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
            const now = new Date();
            const trialEndsAt = getTrialEndsAt(now);

            await setDoc(userRef, {
                uid: user.uid,
                email: user.email,
                name: extraData.name || user.displayName || '',
                photoURL: user.photoURL || null,
                createdAt: now,
                emergencyFundGoal: 10000,
                isPro: false,
                trialEndsAt: trialEndsAt,
                ...extraData,
            });
            return;
        }

        const userData = snap.data();
        if (shouldExtendTrialToThirtyDays(userData)) {
            const createdAt = toDate(userData.createdAt);
            await setDoc(userRef, {
                trialEndsAt: getTrialEndsAt(createdAt),
            }, { merge: true });
        }
    }

    // Registro con correo y contraseña
    async function signup(email, password, name) {
        if (!auth || !db) throw new Error("Firebase no está configurado (falta .env.local).");

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Establecer displayName en Firebase Auth
        await updateProfile(user, { displayName: name });

        // Enviar correo de verificación automáticamente
        const actionCodeSettings = {
            url: window.location.origin + '/auth/action',
            handleCodeInApp: false
        };
        // No esperamos (await) a que termine para no bloquear el registro si falla el correo
        sendEmailVerification(user, actionCodeSettings).catch(err => {
            console.error("Error enviando correo de verificación automático:", err);
        });

        // Crear documento del usuario solo si no existe
        await ensureUserProfile(user, { name });

        return userCredential;
    }

    // Inicio de sesión con correo y contraseña
    function login(email, password) {
        if (!auth) return Promise.reject(new Error("Firebase no está configurado (falta .env.local)."));
        return signInWithEmailAndPassword(auth, email, password);
    }

    function resetPassword(email) {
        if (!auth) return Promise.reject(new Error("Firebase no está configurado (falta .env.local)."));
        return sendPasswordResetEmail(auth, email, {
            url: window.location.origin + '/onboarding',
            handleCodeInApp: false,
        });
    }

    // Inicio de sesión / registro con Google
    async function loginWithGoogle() {
        if (!auth || !db) throw new Error("Firebase no está configurado (falta .env.local).");

        if (shouldUseRedirectForGoogleAuth()) {
            await signInWithRedirect(auth, googleProvider);
            return null;
        }

        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        // Crear perfil solo si es la primera vez (no sobrescribe datos existentes)
        await ensureUserProfile(user, {
            name: user.displayName || '',
            photoURL: user.photoURL || null,
        });

        return result;
    }

    function logout() {
        return signOut(auth);
    }

    useEffect(() => {
        if (!auth) {
            console.warn("Autenticación no inicializada. Posible falta de variables de entorno.");
            Promise.resolve().then(() => setLoading(false));
            return;
        }

        getRedirectResult(auth).then(async (result) => {
            if (!result?.user) return;
            await ensureUserProfile(result.user, {
                name: result.user.displayName || '',
                photoURL: result.user.photoURL || null,
            });
        }).catch((error) => {
            console.error('Error completando login con Google redirect:', error);
        });

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setUserDataLoading(Boolean(user));
            setCurrentUser(user);
            if (user) {
                try {
                    await ensureUserProfile(user);
                } catch (e) {
                    console.error('Error asegurando perfil de usuario:', e);
                }
            } else {
                setUserData(null);
            }
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!currentUser || !db) return;

        let isActive = true;
        let receivedServerSnapshot = false;
        let cachedUserData = null;

        // Si IndexedDB tiene datos en caché, los mostramos rápido como respaldo.
        // Esto evita pantalla en blanco en Safari iOS donde la conexión puede ser lenta.
        const quickCacheFallbackTimer = window.setTimeout(() => {
            if (!isActive || receivedServerSnapshot) return;
            if (cachedUserData) {
                console.info('Mostrando perfil desde caché local mientras se espera al servidor.');
                setUserData(cachedUserData);
                setUserDataLoading(false);
            }
        }, 1500);

        // Fallback final: si después de 4s el servidor no responde,
        // usamos lo que tengamos (caché o null) para no dejar al usuario bloqueado.
        const cacheFallbackTimer = window.setTimeout(() => {
            if (!isActive || receivedServerSnapshot) return;
            console.warn('Usando perfil local porque Firestore no respondió a tiempo.');
            setUserData(cachedUserData);
            setUserDataLoading(false);
        }, 4000);

        const unsub = onSnapshot(
            doc(db, 'users', currentUser.uid),
            { includeMetadataChanges: true },
            (docSnap) => {
                const nextUserData = docSnap.exists() ? docSnap.data() : null;

                if (docSnap.metadata.fromCache && !receivedServerSnapshot) {
                    cachedUserData = nextUserData;
                    return;
                }

                receivedServerSnapshot = true;
                window.clearTimeout(quickCacheFallbackTimer);
                window.clearTimeout(cacheFallbackTimer);
                setUserData(nextUserData);
                setStatusCheckedAt(new Date());
                setUserDataLoading(false);
            },
            (error) => {
                window.clearTimeout(quickCacheFallbackTimer);
                window.clearTimeout(cacheFallbackTimer);
                console.error('Error cargando perfil de usuario:', error);
                setUserData(cachedUserData);
                setUserDataLoading(false);
            },
        );

        return () => {
            isActive = false;
            window.clearTimeout(quickCacheFallbackTimer);
            window.clearTimeout(cacheFallbackTimer);
            unsub();
        };
    }, [currentUser]);

    // ── isProUser: Incluye override admin, usuarios pagados, grandfathered y TRIAL ──
    const isProUser = React.useMemo(() => {
        if (!userData) return false;
        if (hasActiveAdminProOverride(userData, statusCheckedAt)) return true;
        // 1. Grandfathering
        if (userData.isPro === undefined || userData.isPro === null) return true;
        // 2. Explícitamente Pro (pagó)
        if (userData.isPro === true) {
            // 2a. Si canceló, verificar grace period
            if (userData.cancelAtPeriodEnd === true && userData.currentPeriodEnd) {
                const periodEnd = toDate(userData.currentPeriodEnd);
                if (statusCheckedAt >= periodEnd) return false;
            }
            return true;
        }
        // 3. Trial (30 días) otorga acceso PRO
        if (userData.trialEndsAt) {
            const ends = toDate(userData.trialEndsAt);
            if (statusCheckedAt < ends) return true;
        }
        return false;
    }, [userData, statusCheckedAt]);

    // Indica si el usuario está en periodo de prueba (informativo para banners)
    const isTrialUser = React.useMemo(() => {
        if (!userData) return false;
        if (hasActiveAdminProOverride(userData, statusCheckedAt)) return false;
        if (userData.isPro === true || userData.isPro === undefined || userData.isPro === null) return false;
        if (userData.trialEndsAt) {
            const ends = toDate(userData.trialEndsAt);
            if (statusCheckedAt < ends) return true;
        }
        return false;
    }, [userData, statusCheckedAt]);

    // ── Estado unificado ──
    const userStatus = React.useMemo(() => {
        if (userDataLoading) return 'LOADING';
        if (isTrialUser) return 'TRIAL';
        if (isProUser) return 'PRO';
        return 'EXPIRED'; // EXPIRED cuando se acaba el trial y no ha pagado
    }, [isProUser, isTrialUser, userDataLoading]);

    // ── Días restantes de trial (informativo) ──
    const trialDaysLeft = React.useMemo(() => {
        if (!isTrialUser || !userData?.trialEndsAt) return 0;
        const ends = toDate(userData.trialEndsAt);
        if (!ends) return 0;
        const ms = ends.getTime() - statusCheckedAt.getTime();
        return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
    }, [isTrialUser, userData, statusCheckedAt]);

    const value = {
        currentUser,
        userData,
        userDataLoading,
        isProUser,
        isTrialUser,
        userStatus,
        trialDaysLeft,
        trialDays: TRIAL_DAYS,
        signup,
        login,
        resetPassword,
        loginWithGoogle,
        logout,
        updateProfile,
        sendEmailVerification,
        updatePassword,
        linkWithCredential,
        EmailAuthProvider,
        reauthenticateWithCredential
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

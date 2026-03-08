import React, { useState, useEffect } from 'react';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile,
    sendEmailVerification,
    updatePassword,
    EmailAuthProvider,
    reauthenticateWithCredential
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { AuthContext } from './AuthContext.js';
import { onSnapshot } from 'firebase/firestore';

const googleProvider = new GoogleAuthProvider();

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);

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
            const trialDays = 7;
            const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

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

    // Inicio de sesión / registro con Google
    async function loginWithGoogle() {
        if (!auth || !db) throw new Error("Firebase no está configurado (falta .env.local).");

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

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);
            if (user) {
                try {
                    await ensureUserProfile(user);
                } catch (e) {
                    console.error('Error asegurando perfil de usuario:', e);
                }
            }
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!currentUser || !db) {
            setUserData(null);
            return;
        }

        const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
            if (docSnap.exists()) {
                setUserData(docSnap.data());
            } else {
                setUserData(null);
            }
        });

        return () => unsub();
    }, [currentUser]);

    // ── isProUser: Incluye usuarios pagados, grandfathered y TRIAL ──
    const isProUser = React.useMemo(() => {
        if (!userData) return false;
        // 1. Grandfathering
        if (userData.isPro === undefined || userData.isPro === null) return true;
        // 2. Explícitamente Pro (pagó)
        if (userData.isPro === true) {
            // 2a. Si canceló, verificar grace period
            if (userData.cancelAtPeriodEnd === true && userData.currentPeriodEnd) {
                const periodEnd = userData.currentPeriodEnd.toDate
                    ? userData.currentPeriodEnd.toDate()
                    : new Date(userData.currentPeriodEnd);
                if (new Date() >= periodEnd) return false;
            }
            return true;
        }
        // 3. Trial (7 días) otorga acceso PRO
        if (userData.trialEndsAt) {
            const ends = userData.trialEndsAt.toDate ? userData.trialEndsAt.toDate() : new Date(userData.trialEndsAt);
            if (new Date() < ends) return true;
        }
        return false;
    }, [userData]);

    // Indica si el usuario está en periodo de prueba (informativo para banners)
    const isTrialUser = React.useMemo(() => {
        if (!userData) return false;
        if (userData.isPro === true || userData.isPro === undefined || userData.isPro === null) return false;
        if (userData.trialEndsAt) {
            const ends = userData.trialEndsAt.toDate ? userData.trialEndsAt.toDate() : new Date(userData.trialEndsAt);
            if (new Date() < ends) return true;
        }
        return false;
    }, [userData]);

    // ── Estado unificado ──
    const userStatus = React.useMemo(() => {
        if (isTrialUser) return 'TRIAL';
        if (isProUser) return 'PRO';
        return 'EXPIRED'; // EXPIRED cuando se acaba el trial y no ha pagado
    }, [isProUser, isTrialUser]);

    // ── Días restantes de trial (informativo) ──
    const trialDaysLeft = React.useMemo(() => {
        if (!isTrialUser || !userData?.trialEndsAt) return 0;
        const ends = userData.trialEndsAt.toDate
            ? userData.trialEndsAt.toDate()
            : new Date(userData.trialEndsAt);
        const ms = ends.getTime() - Date.now();
        return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
    }, [isTrialUser, userData]);

    const value = {
        currentUser,
        userData,
        isProUser,
        isTrialUser,
        userStatus,
        trialDaysLeft,
        signup,
        login,
        loginWithGoogle,
        logout,
        updateProfile,
        sendEmailVerification,
        updatePassword,
        EmailAuthProvider,
        reauthenticateWithCredential
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

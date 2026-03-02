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

    const isProUser = React.useMemo(() => {
        if (!userData) return false;
        // 1. Grandfathering: si isPro no existe, es Pro (usuario antiguo)
        if (userData.isPro === undefined || userData.isPro === null) return true;
        // 2. Explícitamente Pro
        if (userData.isPro === true) {
            // 2a. Si canceló, verificar grace period
            if (userData.cancelAtPeriodEnd === true && userData.currentPeriodEnd) {
                const periodEnd = userData.currentPeriodEnd.toDate
                    ? userData.currentPeriodEnd.toDate()
                    : new Date(userData.currentPeriodEnd);
                // Si ya pasó la fecha de fin del periodo, revocar acceso
                if (new Date() >= periodEnd) return false;
            }
            return true;
        }
        // 3. Periodo de Trial (7 días)
        if (userData.trialEndsAt) {
            const ends = userData.trialEndsAt.toDate ? userData.trialEndsAt.toDate() : new Date(userData.trialEndsAt);
            if (new Date() < ends) return true;
        }
        return false;
    }, [userData]);

    // Indica si el usuario está en periodo de prueba activo (NO debe ver badge PRO)
    const isTrialUser = React.useMemo(() => {
        if (!userData) return false;
        // Si es PRO pagado o grandfathered, no es trial
        if (userData.isPro === true || userData.isPro === undefined || userData.isPro === null) return false;
        // Es trial si isPro === false y trialEndsAt aún no ha pasado
        if (userData.trialEndsAt) {
            const ends = userData.trialEndsAt.toDate ? userData.trialEndsAt.toDate() : new Date(userData.trialEndsAt);
            if (new Date() < ends) return true;
        }
        return false;
    }, [userData]);

    // ── Derived: unified status string ──
    const userStatus = React.useMemo(() => {
        if (isProUser && !isTrialUser) return 'PRO';
        if (isTrialUser) return 'TRIAL';
        return 'EXPIRED';
    }, [isProUser, isTrialUser]);

    // ── Derived: days left in trial (0 if not in trial) ──
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

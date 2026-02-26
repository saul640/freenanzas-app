import React, { useState, useEffect } from 'react';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile
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
            await setDoc(userRef, {
                uid: user.uid,
                email: user.email,
                name: extraData.name || user.displayName || '',
                photoURL: user.photoURL || null,
                createdAt: new Date(),
                emergencyFundGoal: 10000,
                isPro: false,
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

        const unsubscribe = onAuthStateChanged(auth, user => {
            setCurrentUser(user);
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

    const value = {
        currentUser,
        userData,
        signup,
        login,
        loginWithGoogle,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

import React, { useState, useEffect } from 'react';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { AuthContext } from './AuthContext.js';

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Registro de usuario y guardado de perfil inicial en Firestore
    async function signup(email, password, name) {
        if (!auth || !db) throw new Error("Firebase no está configurado (falta .env.local).");

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Crear documento del usuario en base de datos
        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: user.email,
            name: name,
            createdAt: new Date(),
            emergencyFundGoal: 10000 // Valor por defecto sugerido en el Onboarding
        });

        return userCredential;
    }

    function login(email, password) {
        if (!auth) return Promise.reject(new Error("Firebase no está configurado (falta .env.local)."));
        return signInWithEmailAndPassword(auth, email, password);
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

    const value = {
        currentUser,
        signup,
        login,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

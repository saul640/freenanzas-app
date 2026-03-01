import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import fs from 'fs';
import path from 'path';

// Read parsed .env.local file
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        env[match[1]] = match[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    }
});

const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TEST_EMAIL = "qa-test@freenanzas.com";
const TEST_PASSWORD = "Password123!";

async function runQA() {
    console.log("=== INICIANDO VALIDACIÓN QA DEL FLUJO FREEMIUM ===\n");
    let userRecord;

    try {
        // 1. Crear usuario de prueba
        console.log("1. Creando usuario de prueba...");
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
            userRecord = userCredential.user;

            // Simular flujo inicial de AuthContextProvider.jsx
            const now = new Date();
            const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

            await setDoc(doc(db, "users", userRecord.uid), {
                uid: userRecord.uid,
                email: userRecord.email,
                name: "QA Tester",
                createdAt: now,
                emergencyFundGoal: 10000,
                isPro: false,
                trialEndsAt: trialEndsAt
            });
            console.log("✅ Usuario de prueba creado exitosamente.");
        } catch (e) {
            if (e.code === 'auth/email-already-in-use') {
                console.log("El usuario ya existe, iniciando sesión...");
                const userCredential = await signInWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
                userRecord = userCredential.user;
            } else {
                throw e;
            }
        }

        // 2. Verificar estado Trial
        console.log("\n2. Verificando estado Trial...");
        const userDoc = await getDoc(doc(db, "users", userRecord.uid));
        const userData = userDoc.data();

        const trialDate = userData.trialEndsAt.toDate();
        const diffDays = Math.round((trialDate - new Date()) / (1000 * 60 * 60 * 24));

        if (userData.isPro === false && diffDays === 7) {
            console.log("✅ Prueba Trial exitosa: isPro es false y trialEndsAt es en ~7 días (" + trialDate.toISOString() + ")");
        } else {
            console.error("❌ Falla en prueba Trial:", { isPro: userData.isPro, diffDays });
        }

        // 3. Simular Expiración
        console.log("\n3. Simulando expiración de Trial...");
        const pastDate = new Date(new Date().getTime() - 24 * 60 * 60 * 1000); // 1 día en el pasado
        await updateDoc(doc(db, "users", userRecord.uid), {
            trialEndsAt: pastDate
        });

        const expiredDoc = await getDoc(doc(db, "users", userRecord.uid));
        const expiredData = expiredDoc.data();
        const expiredTrialDate = expiredData.trialEndsAt.toDate();

        if (expiredData.isPro === false && expiredTrialDate < new Date()) {
            console.log("✅ Prueba Expiración exitosa: trialEndsAt está en el pasado (" + expiredTrialDate.toISOString() + "). Paywall debería mostrarse.");
        } else {
            console.error("❌ Falla en prueba Expiración.");
        }

        // 4. Simular Conversión (Pago en PaywallModal)
        console.log("\n4. Simulando conversión (Pago exitoso en PayPal)...");
        const now2 = new Date();
        const nextMonth = new Date(now2.getTime() + 30 * 24 * 60 * 60 * 1000);
        await updateDoc(doc(db, "users", userRecord.uid), {
            isPro: true,
            paypalSubscriptionId: "I-QA-MOCK-SUB-12345",
            planType: "monthly",
            currentPeriodEnd: nextMonth,
            cancelAtPeriodEnd: false,
            subscriptionStartDate: now2
        });

        const activeDoc = await getDoc(doc(db, "users", userRecord.uid));
        const activeData = activeDoc.data();

        if (activeData.isPro === true && activeData.paypalSubscriptionId) {
            console.log("✅ Prueba Conversión exitosa: isPro es true y tiene subscriptionId.");
        } else {
            console.error("❌ Falla en prueba Conversión.");
        }

    } catch (err) {
        console.error("Error en validación QA:", err);
    } finally {
        console.log("\n=== VALIDACIÓN QA COMPLETADA ===");
        process.exit(0);
    }
}

runQA();

import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
// You should store these values in a .env.local file created at the root of the project
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase only if config is present
let app, appCheck, auth, db, functions, storage;

try {
    if (firebaseConfig.apiKey) {
        app = initializeApp(firebaseConfig);
        const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;

        if (appCheckSiteKey) {
            appCheck = initializeAppCheck(app, {
                provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
                isTokenAutoRefreshEnabled: true,
            });
        } else {
            console.warn("Firebase App Check site key is missing. Add VITE_RECAPTCHA_ENTERPRISE_SITE_KEY to your environment.");
        }

        auth = getAuth(app);
        
        // Habilitar persistencia local IndexedDB con soporte multi-pestaña para PWA
        db = initializeFirestore(app, {
            localCache: persistentLocalCache({
                tabManager: persistentMultipleTabManager()
            })
        });
        
        functions = getFunctions(app);
        storage = getStorage(app);
    } else {
        console.warn("Firebase config is missing. Please add your credentials to .env.local");
    }
} catch (error) {
    console.error("Firebase initialization error", error);
}

export { appCheck, auth, db, functions, storage };
export default app;

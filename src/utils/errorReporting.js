import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

const APP_ID = 'finanzas_boveda_dual_v2';

export const reportErrorToAdmin = async (errorData) => {
    try {
        const userId = auth?.currentUser ? auth.currentUser.uid : 'unauthenticated';
        const errorLogsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'errorLogs');

        await addDoc(errorLogsRef, {
            timestamp: serverTimestamp(),
            errorType: errorData.errorType || 'Unknown',
            userId: userId,
            errorMessage: errorData.errorMessage || 'No message provided',
            component: errorData.component || 'Unknown',
            userAgent: navigator?.userAgent || 'Unknown',
            url: window?.location?.href || 'Unknown'
        });
        
        console.info("El equipo técnico ha sido notificado automáticamente sobre el error en " + errorData.component);
    } catch (e) {
        console.error("Failed to log error to admin:", e);
    }
};

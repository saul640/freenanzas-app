import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

const APP_ID = 'finanzas_boveda_dual_v2';

export const notifyAdminError = async (errorDetail) => {
    try {
        const userId = auth?.currentUser ? auth.currentUser.uid : 'unauthenticated';
        const errorLogsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'systemErrors');

        await addDoc(errorLogsRef, {
            timestamp: serverTimestamp(),
            errorType: errorDetail.errorType || 'Unknown',
            userId: userId,
            adminEmail: 'admin@freenanzas-app.web.app',
            message: errorDetail.message || 'No message provided',
            context: errorDetail.context || 'Unknown',
            userAgent: navigator?.userAgent || 'Unknown',
            url: window?.location?.href || 'Unknown'
        });

        console.info("El equipo técnico ha sido notificado automáticamente sobre el error en " + errorDetail.context);
    } catch (e) {
        console.error("Failed to log error to admin:", e);
    }
};

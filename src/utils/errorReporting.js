import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

const APP_ID = 'finanzas_boveda_dual_v2';

export const logErrorToAdmin = async ({ type = 'CRITICAL_ERROR', message = '', component = 'Unknown' }) => {
    try {
        const userId = auth?.currentUser ? auth.currentUser.uid : 'unauthenticated';
        const notificationsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'admin_notifications');

        await addDoc(notificationsRef, {
            timestamp: serverTimestamp(),
            type,
            message,
            component,
            userId,
            status: 'pending',
            recipient: 'admin@freenanzas-app.web.app'
        });
    } catch (e) {
        // Silent fail — never block the user flow for logging
    }
};

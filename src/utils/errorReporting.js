import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

export const APP_ID = 'finanzas_boveda_dual_v2';
export const ADMIN_EMAIL = 'admin@freenanzas-app.web.app';

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
            recipient: ADMIN_EMAIL,
        });
    } catch (e) {
        // Silent fail — never block the user flow for logging
    }
};

export const logIAScanFailure = async ({ errorMessage = '', payloadSnippet = '' } = {}) => {
    try {
        const userId = auth?.currentUser ? auth.currentUser.uid : 'unauthenticated';
        const logsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'errorLogs');

        await addDoc(logsRef, {
            timestamp: serverTimestamp(),
            errorType: 'IA_SCAN_FAILURE',
            adminEmail: ADMIN_EMAIL,
            errorMessage,
            payloadSnippet,
            userId,
        });
    } catch (e) {
        // Silent fail — never block the user flow for logging
    }
};

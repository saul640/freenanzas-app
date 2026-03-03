import { logErrorToAdmin } from './errorReporting';

let initialized = false;

export const setupGlobalErrorHandlers = () => {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;

    window.addEventListener('error', (event) => {
        const message = event?.error?.message || event?.message || 'Unknown error';
        logErrorToAdmin({
            type: 'GLOBAL_ERROR',
            message,
            component: 'window.onerror',
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event?.reason;
        const message = reason?.message || (typeof reason === 'string' ? reason : 'Unhandled promise rejection');
        logErrorToAdmin({
            type: 'UNHANDLED_REJECTION',
            message,
            component: 'window.onunhandledrejection',
        });
    });
};

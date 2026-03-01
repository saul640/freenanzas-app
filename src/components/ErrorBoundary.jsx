import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, errorId: null };
    }

    static getDerivedStateFromError(_error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // 1. Gather error details
        const uniqueErrorId = Math.random().toString(36).substring(2, 9);
        this.setState({ errorId: uniqueErrorId });

        const errorLog = {
            errorId: uniqueErrorId,
            errorMessage: error.message || 'Unknown Error',
            errorStack: errorInfo?.componentStack || 'No stack trace available',
            path: window.location.pathname,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            // Attempt to get user ID from local storage if available from your auth setup
            userId: localStorage.getItem('last_uid') || 'Anonymous',
        };

        console.error("ErrorBoundary caught an exception:", errorLog);

        // 2. Send to N8N Webhook if configured
        const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL;

        if (webhookUrl) {
            fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(errorLog),
            })
                .then(response => {
                    if (!response.ok) {
                        console.warn("N8N Webhook responded with error:", response.status);
                    }
                })
                .catch(fetchError => {
                    console.error("Failed to send error report to N8N webhook:", fetchError);
                });
        } else {
            // Error reporting disabled: N8N webhook URL is not configured
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-surface-light dark:bg-surface-dark transition-colors duration-300">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md w-full border border-gray-100 dark:border-gray-700">
                        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">¡Ups! Algo inesperado ocurrió.</h2>
                        <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
                            Hemos detectado un problema y nuestro equipo técnico ha sido notificado automáticamente de forma anónima. Disculpa las molestias.
                        </p>

                        {this.state.errorId && (
                            <div className="text-xs text-gray-400 dark:text-gray-500 mb-6">
                                ID de Referencia: {this.state.errorId}
                            </div>
                        )}

                        <button
                            onClick={() => window.location.replace('/')}
                            className="w-full py-3 px-4 bg-primary-light dark:bg-primary-dark text-white rounded-xl shadow-soft font-medium flex items-center justify-center space-x-2 hover:opacity-90 transition-opacity"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                            </svg>
                            <span>Volver a Inicio</span>
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;

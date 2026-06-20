import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function PrivateRoute({ children }) {
    const { currentUser, userDataLoading } = useAuth();

    if (!currentUser) return <Navigate to="/onboarding" />;

    if (userDataLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f7f9f8] dark:bg-slate-900">
                <div className="flex flex-col items-center gap-3 text-primary">
                    <span className="material-symbols-rounded text-4xl animate-spin">progress_activity</span>
                    <p className="text-sm font-medium text-gray-500 dark:text-slate-400">Cargando tu cuenta...</p>
                </div>
            </div>
        );
    }

    return children;
}

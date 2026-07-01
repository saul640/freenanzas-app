import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { toast, Toaster } from 'react-hot-toast';
import { db, functions } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../data/legalPolicies';

const USER_SUBCOLLECTIONS = [
    'creditCards',
    'recurring',
    'categories',
    'budgets',
    'loans',
    'billingReceipts',
];

const serializeFirestoreValue = (value) => {
    if (!value) return value;
    if (value.toDate) return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map(serializeFirestoreValue);
    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, serializeFirestoreValue(entry)])
        );
    }
    return value;
};

const downloadJson = (payload, filename) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

export default function SecurityPrivacy() {
    const navigate = useNavigate();
    const { currentUser, userData } = useAuth();
    const [isDownloading, setIsDownloading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDownloadData = async () => {
        if (!currentUser) return;

        setIsDownloading(true);
        const toastId = toast.loading('Preparando descarga...');
        try {
            const userRef = doc(db, 'users', currentUser.uid);
            const userSnapshot = await getDoc(userRef);
            const transactionsSnapshot = await getDocs(
                query(collection(db, 'transactions'), where('userId', '==', currentUser.uid))
            );

            const subcollections = {};
            for (const name of USER_SUBCOLLECTIONS) {
                const snapshot = await getDocs(collection(db, 'users', currentUser.uid, name));
                subcollections[name] = snapshot.docs.map((item) => ({
                    id: item.id,
                    ...serializeFirestoreValue(item.data()),
                }));
            }

            const payload = {
                exportedAt: new Date().toISOString(),
                account: {
                    uid: currentUser.uid,
                    email: currentUser.email || null,
                    displayName: currentUser.displayName || null,
                    emailVerified: currentUser.emailVerified === true,
                },
                profile: userSnapshot.exists()
                    ? serializeFirestoreValue(userSnapshot.data())
                    : serializeFirestoreValue(userData || {}),
                transactions: transactionsSnapshot.docs.map((item) => ({
                    id: item.id,
                    ...serializeFirestoreValue(item.data()),
                })),
                ...subcollections,
            };

            downloadJson(payload, `freenanzas-datos-${new Date().toISOString().slice(0, 10)}.json`);
            toast.success('Descarga lista.', { id: toastId });
        } catch (error) {
            console.error('Data export error:', error);
            toast.error('No pudimos preparar tus datos. Intenta de nuevo o contacta soporte.', { id: toastId });
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!currentUser) return;

        setIsDeleting(true);
        const toastId = toast.loading('Eliminando cuenta y datos...');
        try {
            const deleteAccount = httpsCallable(functions, 'deleteMyAccountData');
            await deleteAccount();
            toast.success('Tu cuenta y datos han sido eliminados.', { id: toastId });
            navigate('/onboarding');
        } catch (error) {
            console.error('Account deletion error:', error);
            if (error.code === 'functions/unauthenticated') {
                toast.error('Por seguridad, inicia sesión de nuevo antes de eliminar tu cuenta.', { id: toastId });
            } else {
                toast.error('Error al eliminar la cuenta. Intenta de nuevo o contacta soporte.', { id: toastId });
            }
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f7f9f8] dark:bg-slate-900 text-gray-900 dark:text-zinc-100 transition-colors duration-200 pb-12">
            <Toaster position="top-center" />

            <header className="bg-primary text-black px-6 pt-12 pb-6 rounded-b-[2rem] shadow-sm">
                <button onClick={() => navigate(-1)} className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-black/70 hover:text-black transition-colors">
                    <span className="material-symbols-rounded text-[18px]">arrow_back</span>
                    Volver
                </button>
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-white/80 flex items-center justify-center shadow-sm shrink-0">
                        <span className="material-symbols-rounded text-[22px]">shield_lock</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold tracking-tight leading-tight">Seguridad y privacidad</h1>
                        <p className="text-xs font-semibold text-black/60 mt-1">Control claro sobre tus datos</p>
                    </div>
                </div>
            </header>

            <main className="px-6 py-6 space-y-4">
                <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="material-symbols-rounded text-emerald-600 dark:text-emerald-300">lock</span>
                        <h2 className="text-lg font-extrabold text-gray-900 dark:text-zinc-100">Tus datos financieros son privados.</h2>
                    </div>
                    <p className="text-sm leading-6 text-gray-600 dark:text-slate-300">
                        Freenanzas usa autenticación segura con Firebase, reglas de acceso por usuario y procesamiento de pagos mediante PayPal. No vendemos tus datos. No almacenamos tarjetas de crédito. Las funciones de IA se usan únicamente para ayudarte a analizar tus gastos y recibos.
                    </p>
                </section>

                <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
                    <button
                        onClick={handleDownloadData}
                        disabled={isDownloading}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-60"
                    >
                        <span className="flex items-center gap-3 text-sm font-semibold text-gray-800 dark:text-slate-200">
                            <span className="material-symbols-rounded text-[18px] text-gray-400">download</span>
                            Descargar mis datos
                        </span>
                        <span className="material-symbols-rounded text-[18px] text-gray-300">{isDownloading ? 'progress_activity' : 'chevron_right'}</span>
                    </button>

                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-t border-gray-50 dark:border-slate-700"
                    >
                        <span className="flex items-center gap-3 text-sm font-semibold text-red-500 dark:text-red-400">
                            <span className="material-symbols-rounded text-[18px]">delete_forever</span>
                            Eliminar mis datos
                        </span>
                        <span className="material-symbols-rounded text-[18px] text-gray-300">chevron_right</span>
                    </button>
                </section>

                <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
                    <Link to="/privacy" className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                        <span className="flex items-center gap-3 text-sm font-semibold text-gray-800 dark:text-slate-200">
                            <span className="material-symbols-rounded text-[18px] text-gray-400">database</span>
                            Qué datos usamos
                        </span>
                        <span className="material-symbols-rounded text-[18px] text-gray-300">chevron_right</span>
                    </Link>

                    <Link to="/ai-financial-notice" className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors border-t border-gray-50 dark:border-slate-700">
                        <span className="flex items-center gap-3 text-sm font-semibold text-gray-800 dark:text-slate-200">
                            <span className="material-symbols-rounded text-[18px] text-gray-400">psychology</span>
                            Cómo funciona la IA
                        </span>
                        <span className="material-symbols-rounded text-[18px] text-gray-300">chevron_right</span>
                    </Link>

                    <Link to="/refunds-cancellation" className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors border-t border-gray-50 dark:border-slate-700">
                        <span className="flex items-center gap-3 text-sm font-semibold text-gray-800 dark:text-slate-200">
                            <span className="material-symbols-rounded text-[18px] text-gray-400">card_membership</span>
                            Cómo cancelar PRO
                        </span>
                        <span className="material-symbols-rounded text-[18px] text-gray-300">chevron_right</span>
                    </Link>

                    <a href={SUPPORT_MAILTO} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors border-t border-gray-50 dark:border-slate-700">
                        <span className="flex items-center gap-3 text-sm font-semibold text-gray-800 dark:text-slate-200">
                            <span className="material-symbols-rounded text-[18px] text-gray-400">mail</span>
                            Contacto de soporte
                        </span>
                        <span className="text-xs font-semibold text-gray-400 dark:text-slate-500">{SUPPORT_EMAIL}</span>
                    </a>
                </section>

                <p className="text-[11px] leading-5 text-gray-400 dark:text-slate-500 text-center px-2">
                    Para solicitudes especiales de privacidad o soporte, escribe desde el correo asociado a tu cuenta.
                </p>
            </main>

            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-5 w-full max-w-sm border border-red-100 dark:border-red-900/40">
                        <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 text-red-500 flex items-center justify-center mx-auto mb-4">
                            <span className="material-symbols-rounded">warning</span>
                        </div>
                        <h2 className="text-lg font-bold text-center text-gray-900 dark:text-zinc-100 mb-2">¿Eliminar tus datos?</h2>
                        <p className="text-sm leading-6 text-center text-gray-500 dark:text-slate-400 mb-4">
                            Esta acción eliminará tu cuenta y datos financieros. Antes de continuar, descarga una copia si necesitas conservarla.
                        </p>
                        <Link to="/data-deletion" className="block text-center text-xs font-semibold text-red-600 dark:text-red-300 underline mb-4">
                            Ver política de eliminación de datos
                        </Link>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={isDeleting}
                                className="flex-1 py-2.5 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-xl text-sm font-semibold disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDeleteAccount}
                                disabled={isDeleting}
                                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1"
                            >
                                {isDeleting ? (
                                    <>
                                        <span className="animate-spin material-symbols-rounded text-[14px]">progress_activity</span>
                                        Eliminando...
                                    </>
                                ) : (
                                    'Sí, eliminar'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { FaCrown, FaTimes } from 'react-icons/fa';
import { PayPalScriptProvider, PayPalButtons, usePayPalScriptReducer, DISPATCH_ACTION } from "@paypal/react-paypal-js";
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'react-hot-toast';

// ─── Exponential Backoff Utility ───
const retryWithBackoff = async (fn, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
        try { return await fn(); }
        catch (err) {
            if (i === maxRetries - 1) throw err;
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
    }
};

function PaywallModalContent({ onClose }) {
    const { currentUser } = useAuth();
    const [{ isPending, isRejected }, dispatch] = usePayPalScriptReducer();
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [billingCycle, setBillingCycle] = useState("monthly");

    const planIdMonthly = import.meta.env.VITE_PAYPAL_PLAN_MONTHLY || "P-MONTHLY-TODO";
    const planIdAnnual = import.meta.env.VITE_PAYPAL_PLAN_ANNUAL || "P-ANNUAL-TODO";
    const currentPlanId = billingCycle === "annual" ? planIdAnnual : planIdMonthly;

    const fallbackLinkMonthly = import.meta.env.VITE_PAYPAL_FALLBACK_MONTHLY || "";
    const fallbackLinkAnnual = import.meta.env.VITE_PAYPAL_FALLBACK_ANNUAL || "";
    const currentFallbackLink = billingCycle === "annual" ? fallbackLinkAnnual : fallbackLinkMonthly;

    // ─── Animation States ───
    const [isVisible, setIsVisible] = useState(false);
    useEffect(() => {
        setIsVisible(true);
    }, []);

    const handleClose = () => {
        setIsVisible(false);
        setTimeout(onClose, 300);
    };

    // ─── Auth + SDK readiness guard ───
    const isReady = !!currentUser && !isPending && !isRejected;

    const handleApprove = async (data, _actions) => {
        if (!currentUser || !db) {
            setErrorMsg("Tu sesión ha expirado. Por favor, recarga la página e inténtalo de nuevo.");
            return;
        }
        setLoading(true);
        setErrorMsg("");
        try {
            const now = new Date();
            const periodDays = billingCycle === "annual" ? 365 : 30;
            const currentPeriodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

            const userRef = doc(db, 'users', currentUser.uid);
            await retryWithBackoff(() =>
                setDoc(userRef, {
                    isPro: true,
                    paypalSubscriptionId: data.subscriptionID,
                    planType: billingCycle,
                    currentPeriodEnd: currentPeriodEnd,
                    cancelAtPeriodEnd: false,
                    subscriptionStartDate: now,
                }, { merge: true })
            );

            toast.success('¡Suscripción exitosa! Ahora eres usuario PRO 🎉', { duration: 5000 });
            handleClose();
        } catch (error) {
            setErrorMsg("Hubo un error al actualizar tu cuenta. Por favor contacta a soporte.");
        } finally {
            setLoading(false);
        }
    };

    const handleError = (err) => {
        const msg = err?.message || String(err);
        if (msg.includes('INSTRUMENT_DECLINED') || msg.includes('funding')) {
            setErrorMsg("Tu método de pago fue rechazado. Verifica tus fondos o intenta con otro método.");
        } else if (msg.includes('popup') || msg.includes('window')) {
            setErrorMsg("La ventana de PayPal se cerró antes de completar el pago. Intenta de nuevo.");
        } else {
            setErrorMsg("En este momento estamos experimentando intermitencias con PayPal. Intenta de nuevo en unos minutos.");
        }
    };

    const handleCancel = (_data) => {
        setErrorMsg("El pago fue cancelado. Inténtalo de nuevo cuando estés listo.");
    };

    // ─── Reset PayPal state without page reload ───
    const resetPaymentState = () => {
        setErrorMsg("");
        setLoading(false);
        dispatch({
            type: DISPATCH_ACTION.RESET_OPTIONS,
            value: {
                "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID,
                currency: "USD",
                intent: "subscription",
                vault: true,
                components: "buttons",
            },
        });
    };

    return (
        <div className={`fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            {/* ── Full-screen loading overlay during payment processing ── */}
            {loading && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex flex-col items-center justify-center gap-4">
                    <span className="material-symbols-rounded text-5xl text-white animate-spin">progress_activity</span>
                    <p className="text-white text-lg font-semibold animate-pulse">Procesando tu suscripción…</p>
                    <p className="text-white/60 text-sm">No cierres esta ventana</p>
                </div>
            )}

            <div className={`bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-md relative my-auto max-h-[90vh] overflow-y-auto transition-all duration-300 transform ${isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
                <button
                    onClick={handleClose}
                    disabled={loading}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors disabled:opacity-30"
                >
                    <FaTimes size={20} />
                </button>

                <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-yellow-500/30">
                        <FaCrown className="text-white text-3xl" />
                    </div>

                    <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-500 to-amber-600 mb-3">
                        Hazte PRO
                    </h2>

                    <p className="text-gray-600 dark:text-gray-300 mb-6 font-medium">
                        Desbloquea el poder de la Inteligencia Artificial y lleva tus finanzas al siguiente nivel.
                    </p>

                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-4 w-full mb-8 border border-gray-100 dark:border-gray-700">
                        <ul className="text-left space-y-4">
                            <li className="flex items-center text-sm font-medium text-gray-800 dark:text-gray-200">
                                <span className="bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 p-1 rounded-full mr-3">✔</span>
                                Escaneo de recibos analizados con IA
                            </li>
                            <li className="flex items-center text-sm font-medium text-gray-800 dark:text-gray-200">
                                <span className="bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 p-1 rounded-full mr-3">✔</span>
                                Consultas directas al Asesor Financiero IA
                            </li>
                            <li className="flex items-center text-sm font-medium text-gray-800 dark:text-gray-200">
                                <span className="bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 p-1 rounded-full mr-3">✔</span>
                                Exportaciones avanzadas a PDF y Excel
                            </li>
                            <li className="flex items-center text-sm font-medium text-gray-800 dark:text-gray-200">
                                <span className="bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 p-1 rounded-full mr-3">✔</span>
                                Soporte prioritario
                            </li>
                        </ul>
                    </div>

                    {errorMsg && (
                        <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-lg w-full mb-4 text-sm font-medium flex items-start gap-2">
                            <span className="material-symbols-rounded text-[18px] mt-0.5 shrink-0">error</span>
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    <div className="w-full mb-6">
                        <div className="flex justify-center bg-gray-100 dark:bg-gray-700/50 p-1 rounded-xl w-full mb-4">
                            <button
                                onClick={() => setBillingCycle("monthly")}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${billingCycle === "monthly"
                                    ? "bg-white dark:bg-gray-600 shadow text-gray-800 dark:text-slate-300"
                                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                    }`}
                            >
                                Mensual
                            </button>
                            <button
                                onClick={() => setBillingCycle("annual")}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${billingCycle === "annual"
                                    ? "bg-gradient-to-r from-yellow-400 to-yellow-500 shadow text-white"
                                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                    }`}
                            >
                                Anual (-20%)
                            </button>
                        </div>

                        {/* Pricing Display */}
                        <div className="text-center py-2">
                            {billingCycle === "monthly" ? (
                                <div>
                                    <span className="text-4xl font-extrabold text-gray-900 dark:text-slate-300">$4.99</span>
                                    <span className="text-gray-500 dark:text-gray-400 font-medium ml-1">USD / mes</span>
                                </div>
                            ) : (
                                <div>
                                    <div className="flex items-center justify-center space-x-2 mb-1">
                                        <span className="text-lg line-through text-gray-400 font-medium">$59.88 USD</span>
                                        <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full dark:bg-green-900/30 dark:text-green-400">
                                            ¡Ahorra un 20%!
                                        </span>
                                    </div>
                                    <span className="text-4xl font-extrabold text-gray-900 dark:text-slate-300">$47.90</span>
                                    <span className="text-gray-500 dark:text-gray-400 font-medium ml-1">USD / año</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="w-full relative z-0">
                        {/* Auth/SDK not ready — show loading */}
                        {!isReady && !isRejected && (
                            <div className="flex flex-col items-center gap-2 py-6">
                                <span className="material-symbols-rounded text-3xl text-gray-400 animate-spin">progress_activity</span>
                                <p className="text-gray-500 text-sm">Preparando métodos de pago…</p>
                            </div>
                        )}

                        {isRejected && (
                            <div className="flex flex-col items-center gap-3 py-6 bg-red-50 dark:bg-red-900/30 rounded-xl p-4">
                                <p className="text-red-500 text-sm text-center font-medium">
                                    No pudimos conectar con el sistema base de PayPal en este momento.
                                </p>
                                {currentFallbackLink ? (
                                    <div className="flex flex-col items-center gap-2 w-full mt-2">
                                        <p className="text-gray-700 dark:text-gray-300 text-xs text-center mb-1">
                                            ¡No te preocupes! Puedes suscribirte de forma segura usando nuestro enlace de pago directo:
                                        </p>
                                        <a
                                            href={currentFallbackLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-full bg-[#0070ba] hover:bg-[#003087] text-white px-4 py-3 rounded-full text-sm font-bold transition-colors shadow-md flex items-center justify-center gap-2"
                                            onClick={() => handleClose()}
                                        >
                                            Pagar con PayPal <span className="material-symbols-rounded text-[18px]">open_in_new</span>
                                        </a>
                                        <button
                                            onClick={resetPaymentState}
                                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xs mt-3 underline"
                                        >
                                            Reintentar cargar el módulo integrado
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={resetPaymentState}
                                        className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-full text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm mt-2"
                                    >
                                        <span className="material-symbols-rounded text-[18px]">refresh</span> Reintentar
                                    </button>
                                )}
                            </div>
                        )}

                        {/* PayPal buttons ONLY when auth + SDK are both ready */}
                        {isReady && (
                            <div key={billingCycle}>
                                <PayPalButtons
                                    style={{ layout: "vertical", shape: "pill", color: "gold", label: "subscribe" }}
                                    createSubscription={(data, actions) => {
                                        setErrorMsg("");
                                        return actions.subscription.create({
                                            plan_id: currentPlanId
                                        });
                                    }}
                                    onApprove={handleApprove}
                                    onError={handleError}
                                    onCancel={handleCancel}
                                />
                            </div>
                        )}
                    </div>

                    <p className="text-xs text-gray-400 mt-4 pb-2">
                        Cancela en cualquier momento. Cobro seguro mediante PayPal.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function PaywallModal({ isOpen, onClose }) {
    if (!isOpen) return null;

    const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;

    if (!clientId || clientId === "test") {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm text-center">
                    <p className="text-red-500 font-bold mb-4">Error de Configuración</p>
                    <p className="text-gray-700 dark:text-gray-300 text-sm mb-6">
                        El Client ID de PayPal no está configurado. Por favor, comunícate con soporte técnico.
                    </p>
                    <button onClick={onClose} className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg font-medium">Cerrar</button>
                </div>
            </div>
        );
    }

    const initialOptions = {
        "client-id": clientId,
        currency: "USD",
        intent: "subscription",
        vault: true,
        components: "buttons"
    };

    return (
        <PayPalScriptProvider options={initialOptions}>
            <PaywallModalContent onClose={onClose} />
        </PayPalScriptProvider>
    );
}

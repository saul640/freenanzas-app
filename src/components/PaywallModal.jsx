import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { FaCrown, FaTimes } from 'react-icons/fa';
import { PayPalButtons, usePayPalScriptReducer, DISPATCH_ACTION } from "@paypal/react-paypal-js";
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function PaywallModal({ isOpen, onClose }) {
    const { currentUser } = useAuth();
    const [{ isPending, isRejected }, dispatch] = usePayPalScriptReducer();
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [billingCycle, setBillingCycle] = useState("monthly"); // "monthly" or "annual"

    if (!isOpen) return null;

    const planIdMonthly = import.meta.env.VITE_PAYPAL_PLAN_MONTHLY || "P-MONTHLY-TODO";
    const planIdAnnual = import.meta.env.VITE_PAYPAL_PLAN_ANNUAL || "P-ANNUAL-TODO";
    const currentPlanId = billingCycle === "annual" ? planIdAnnual : planIdMonthly;

    const handleApprove = async (data, _actions) => {
        setLoading(true);
        setErrorMsg("");
        try {
            if (currentUser && db) {
                const now = new Date();
                const periodDays = billingCycle === "annual" ? 365 : 30;
                const currentPeriodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

                const userRef = doc(db, 'users', currentUser.uid);
                await updateDoc(userRef, {
                    isPro: true,
                    paypalSubscriptionId: data.subscriptionID,
                    // Additive subscription metadata
                    planType: billingCycle, // "monthly" or "annual"
                    currentPeriodEnd: currentPeriodEnd,
                    cancelAtPeriodEnd: false,
                    subscriptionStartDate: now,
                });
                alert("¡Suscripción exitosa! Ahora eres usuario PRO y tienes acceso a todas las funciones de IA.");
                onClose();
            }
        } catch (error) {
            setErrorMsg("Hubo un error al actualizar tu cuenta. Por favor contacta a soporte.");
        } finally {
            setLoading(false);
        }
    };

    const handleError = (err) => {
        console.error("PayPal Error:", err);
        setErrorMsg("En este momento estamos experimentando intermitencias con nuestro proveedor de pagos. Por favor, inténtalo de nuevo en unos minutos.");
    };

    const handleCancel = (_data) => {
        setErrorMsg("El pago fue cancelado. Inténtalo de nuevo.");
    };

    const handleRetryPayPal = () => {
        dispatch({
            type: DISPATCH_ACTION.RESET_OPTIONS,
            value: {
                "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID || "test",
                intent: 'subscription',
                vault: true,
            },
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-md relative animate-fade-in-up my-auto max-h-[90vh] overflow-y-auto">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
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
                        <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-lg w-full mb-4 text-sm font-medium">
                            {errorMsg}
                        </div>
                    )}

                    <div className="w-full mb-6">
                        <div className="flex justify-center bg-gray-100 dark:bg-gray-700/50 p-1 rounded-xl w-full mb-4">
                            <button
                                onClick={() => setBillingCycle("monthly")}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${billingCycle === "monthly"
                                    ? "bg-white dark:bg-gray-600 shadow text-gray-800 dark:text-white"
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
                                    <span className="text-4xl font-extrabold text-gray-900 dark:text-white">$4.99</span>
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
                                    <span className="text-4xl font-extrabold text-gray-900 dark:text-white">$47.90</span>
                                    <span className="text-gray-500 dark:text-gray-400 font-medium ml-1">USD / año</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="w-full relative z-0">
                        {loading && <p className="text-amber-600 font-medium mb-4 animate-pulse">Procesando tu suscripción...</p>}

                        {isPending && (
                            <div className="flex justify-center items-center py-6">
                                <p className="text-gray-500 text-sm">Cargando métodos de pago...</p>
                            </div>
                        )}

                        {isRejected && (
                            <div className="flex flex-col items-center gap-3 py-6 bg-red-50 rounded-xl p-4">
                                <p className="text-red-500 text-sm text-center">
                                    No se pudo cargar PayPal. Verifica tu conexión a internet.
                                </p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-full text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                                >
                                    <span className="material-symbols-rounded text-[18px]">refresh</span> Reintentar
                                </button>
                            </div>
                        )}

                        {/* We use a key to force re-render of PayPal buttons when plan changes */}
                        {!isPending && !isRejected && (
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
                                    onError={(err) => {
                                        console.error("PayPal Error:", err);
                                        setErrorMsg("Estamos experimentando intermitencias. Por favor, intenta de nuevo.");
                                    }}
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

import React, { useState } from 'react';
import { getStripe } from '../utils/stripe';
import { useAuth } from '../contexts/AuthContext';
import { FaCrown, FaTimes } from 'react-icons/fa';

export default function PaywallModal({ isOpen, onClose }) {
    const { currentUser } = useAuth();
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleUpgrade = async () => {
        setLoading(true);
        try {
            const stripe = await getStripe();
            if (!stripe) {
                alert("Stripe no está configurado (Faltan variables de entorno).");
                return;
            }

            alert("En entorno de producción, redirigiremos a Stripe Checkout aquí mediante Payment Links o Cloud Functions.");
        } catch (error) {
            console.error(error);
            alert("Error al iniciar checkout: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-md relative animate-fade-in-up">
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

                    <button
                        onClick={handleUpgrade}
                        disabled={loading}
                        className="w-full py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-white font-bold text-lg transition-all transform hover:-translate-y-1 shadow-xl shadow-yellow-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? "Procesando..." : "Mejorar a PRO ahora"}
                    </button>
                    <p className="text-xs text-gray-400 mt-4">
                        Cancela en cualquier momento. Cobro seguro mediante Stripe.
                    </p>
                </div>
            </div>
        </div>
    );
}

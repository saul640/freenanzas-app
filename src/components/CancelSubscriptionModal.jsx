import React from 'react';

/**
 * Modal de confirmación para cancelar suscripción.
 * Muestra mensaje de grace period y maneja loading/error states.
 */
export default function CancelSubscriptionModal({ isOpen, onClose, onConfirm, isLoading, periodEndDate }) {
    if (!isOpen) return null;

    const formattedDate = periodEndDate
        ? new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(periodEndDate)
        : '';

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-fade-in-up"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Icon */}
                <div className="flex justify-center mb-4">
                    <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                        <span className="material-symbols-rounded text-red-500 text-[28px]">warning</span>
                    </div>
                </div>

                <h3 className="text-lg font-bold text-gray-800 text-center mb-2">
                    ¿Cancelar suscripción?
                </h3>

                <p className="text-sm text-gray-500 text-center mb-1">
                    ¿Estás seguro de que deseas cancelar tu suscripción PRO?
                </p>

                {formattedDate && (
                    <p className="text-sm text-gray-600 text-center font-medium mb-6">
                        Mantendrás tus beneficios PRO hasta el{' '}
                        <span className="text-amber-600 font-bold">{formattedDate}</span>.
                    </p>
                )}

                {!formattedDate && (
                    <p className="text-sm text-gray-600 text-center font-medium mb-6">
                        Mantendrás tus beneficios PRO hasta el final de tu ciclo de facturación actual.
                    </p>
                )}

                <div className="space-y-2">
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <span className="animate-spin material-symbols-rounded text-[18px]">progress_activity</span>
                                Cancelando...
                            </>
                        ) : (
                            'Sí, cancelar suscripción'
                        )}
                    </button>

                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition-colors disabled:opacity-50"
                    >
                        No, mantener mi plan
                    </button>
                </div>
            </div>
        </div>
    );
}

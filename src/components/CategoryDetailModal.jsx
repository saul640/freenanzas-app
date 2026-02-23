import React, { useMemo } from 'react';
import { formatMoney } from '../utils/format';

/**
 * Modal de detalle de categoría — muestra las transacciones filtradas
 * para una categoría seleccionada en la vista de Análisis.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Si el modal está visible
 * @param {Function} props.onClose - Callback para cerrar el modal
 * @param {string} props.categoryName - Nombre de la categoría
 * @param {Array} props.transactions - Todas las transacciones del usuario
 * @param {Object} props.iconData - { icon, color, bg, bar } de la categoría
 */
export default function CategoryDetailModal({ isOpen, onClose, categoryName, transactions, iconData }) {
    // ─── Filtrar transacciones de esta categoría ───
    const filtered = useMemo(() => {
        if (!categoryName || !transactions) return [];
        return transactions
            .filter((tx) => tx.category === categoryName && tx.type === 'expense')
            .sort((a, b) => {
                const dateA = a.timestamp?.toDate?.() || new Date(a.date || 0);
                const dateB = b.timestamp?.toDate?.() || new Date(b.date || 0);
                return dateB - dateA;
            });
    }, [categoryName, transactions]);

    // ─── Resumen ───
    const total = useMemo(() => filtered.reduce((s, tx) => s + (tx.amount || 0), 0), [filtered]);

    const formatTxDate = (tx) => {
        if (tx.timestamp?.toDate) {
            return tx.timestamp.toDate().toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        if (tx.date) {
            return new Date(tx.date + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        return 'Sin fecha';
    };

    if (!isOpen) return null;

    const { icon, color, bg } = iconData || { icon: 'category', color: 'text-gray-500', bg: 'bg-gray-100' };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Modal Panel */}
            <div className="fixed inset-x-0 bottom-0 z-50 max-w-md mx-auto animate-in slide-in-from-bottom duration-300">
                <div className="bg-white rounded-t-[2rem] shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">

                    {/* Header */}
                    <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
                        {/* Drag Handle */}
                        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${bg}`}>
                                    <span className={`material-symbols-rounded text-2xl ${color}`}>{icon}</span>
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">{categoryName}</h2>
                                    <p className="text-xs text-gray-400 font-medium">
                                        {filtered.length} {filtered.length === 1 ? 'transacción' : 'transacciones'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all"
                            >
                                <span className="material-symbols-rounded text-xl text-gray-600">close</span>
                            </button>
                        </div>

                        {/* Total */}
                        <div className="mt-4 bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-2xl p-4 flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-500">Total gastado</span>
                            <span className="text-xl font-extrabold text-gray-900">RD$ {formatMoney(total)}</span>
                        </div>
                    </div>

                    {/* Transaction List */}
                    <div className="flex-1 overflow-y-auto px-6 py-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}>
                        {filtered.length === 0 ? (
                            <div className="text-center py-10">
                                <span className="material-symbols-rounded text-4xl text-gray-300 mb-2">receipt_long</span>
                                <p className="text-gray-400 text-sm mt-2">No hay transacciones en esta categoría.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {filtered.map((tx) => (
                                    <div key={tx.id} className="flex items-center justify-between bg-gray-50 rounded-2xl p-4 hover:bg-gray-100/80 transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-sm text-gray-900 truncate">
                                                {tx.note || tx.merchant || categoryName}
                                            </p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[11px] text-gray-400">{formatTxDate(tx)}</span>
                                                {tx.merchant && tx.note && (
                                                    <>
                                                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                                                        <span className="text-[11px] text-gray-400 truncate">{tx.merchant}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <span className="font-bold text-sm text-gray-800 shrink-0 ml-3">
                                            RD$ {formatMoney(tx.amount)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

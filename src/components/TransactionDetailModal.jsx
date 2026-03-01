import React from 'react';
import { formatMoney, getCategoryIcon, getCategoryColor } from '../utils/format';

/** Reusable row for transaction detail display */
const DetailRow = ({ icon, label, value, valueClass = '' }) => {
    if (!value || value === '') return null;
    return (
        <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-b-0">
            <span className="material-symbols-rounded text-gray-400 text-[20px] mt-0.5 shrink-0">{icon}</span>
            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
                <p className={`text-[14px] font-semibold text-gray-800 mt-0.5 break-words ${valueClass}`}>{value}</p>
            </div>
        </div>
    );
};

/**
 * TransactionDetailModal
 * Shows full detail of a transaction in a slide-up modal.
 * All data comes from client state — no extra DB calls.
 */
export default function TransactionDetailModal({ transaction, creditCards, onClose }) {
    if (!transaction) return null;

    const tx = transaction;
    const isExpense = tx.type === 'expense';

    // Resolve payment method label
    let paymentMethod = 'Efectivo';
    if (tx.metodoPago === 'tarjeta' && tx.tarjetaCreditoId) {
        const card = creditCards?.find(c => c.id === tx.tarjetaCreditoId);
        paymentMethod = card ? `💳 ${card.name}` : '💳 Tarjeta de Crédito';
    } else if (tx.metodoPago === 'transferencia') {
        paymentMethod = '🏦 Transferencia';
    } else if (tx.metodoPago) {
        paymentMethod = tx.metodoPago;
    }

    // Resolve status
    const rawStatus = tx.estado || tx.status || (isExpense ? 'pagado' : 'recibido');
    const statusMap = {
        pagado: { label: 'Pagado', color: 'bg-emerald-100 text-emerald-700' },
        pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700' },
        parcial: { label: 'Pago Parcial', color: 'bg-blue-100 text-blue-700' },
        recibido: { label: 'Recibido', color: 'bg-emerald-100 text-emerald-700' },
    };
    const statusInfo = statusMap[rawStatus] || { label: rawStatus, color: 'bg-gray-100 text-gray-600' };

    // Format the full date/time
    const fullDate = (() => {
        try {
            const d = tx.timestamp?.toDate ? tx.timestamp.toDate()
                : tx.createdAt instanceof Date ? tx.createdAt
                    : tx.date ? new Date(tx.date + 'T12:00:00')
                        : null;
            if (!d) return 'Sin fecha';
            return d.toLocaleDateString('es-DO', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: true,
            });
        } catch {
            return tx.date || 'Sin fecha';
        }
    })();

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] flex flex-col">
                {/* Close Button (top-right) */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors z-10"
                >
                    <span className="material-symbols-rounded text-gray-500 text-lg">close</span>
                </button>

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-6 pb-2">
                    {/* Header */}
                    <div className="flex items-center gap-4 mb-5 pr-10">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${getCategoryColor(tx.category)}`}>
                            <span className="material-symbols-rounded text-2xl">{getCategoryIcon(tx.category)}</span>
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-extrabold text-gray-900 leading-tight truncate">
                                {tx.note || tx.description || tx.category || 'Transacción'}
                            </h3>
                            <p className="text-sm font-medium text-gray-400 mt-0.5">{tx.category}</p>
                        </div>
                    </div>

                    {/* Amount Card */}
                    <div className={`rounded-2xl p-5 mb-5 ${isExpense ? 'bg-red-50' : 'bg-emerald-50'}`}>
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                            {isExpense ? 'Gasto' : 'Ingreso'}
                        </p>
                        <p className={`text-3xl font-extrabold ${isExpense ? 'text-red-600' : 'text-emerald-600'}`}>
                            {isExpense ? '- ' : '+ '}RD$ {formatMoney(tx.amount)}
                        </p>
                        {tx.pagos_abonados > 0 && (
                            <p className="text-xs font-semibold text-blue-600 mt-1">
                                Abonado: RD$ {formatMoney(tx.pagos_abonados)}
                            </p>
                        )}
                    </div>

                    {/* Status Badge */}
                    <div className="mb-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold ${statusInfo.color}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {statusInfo.label}
                        </span>
                    </div>

                    {/* Detail Rows */}
                    <div className="bg-gray-50 rounded-2xl px-4 divide-y divide-gray-100">
                        <DetailRow icon="calendar_today" label="Fecha y Hora" value={fullDate} />
                        <DetailRow icon="payments" label="Método de Pago" value={paymentMethod} />
                        <DetailRow icon="storefront" label="Comercio" value={tx.merchant} />
                        <DetailRow icon="tag" label="RNC" value={tx.rnc} />
                        <DetailRow icon="confirmation_number" label="No. de Ticket" value={tx.ticketNumber} />
                        <DetailRow icon="person" label="Operador" value={tx.operator} />
                        <DetailRow icon="location_on" label="Ubicación" value={tx.location} />
                        <DetailRow icon="notes" label="Detalles" value={tx.details} />
                    </div>
                </div>

                {/* Sticky Close Button — always visible */}
                <div className="shrink-0 px-6 pt-3 pb-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 24px) + 8px)' }}>
                    <button
                        onClick={onClose}
                        className="w-full py-3.5 rounded-2xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors active:scale-[0.98]"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

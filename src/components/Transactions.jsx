import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTransactions } from '../hooks/useTransactions';
import { formatMoney, formatDate, getCategoryIcon, getCategoryColor } from '../utils/format';
import BottomNav from './BottomNav';
import PendingPayments from './PendingPayments';

export default function Transactions() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { transactions, loading } = useTransactions(currentUser?.uid);

    return (
        <div className="flex flex-col min-h-screen bg-[#f7f9f8] max-w-md mx-auto relative shadow-2xl overflow-hidden pb-32">
            {/* Header */}
            <header className="bg-primary text-black px-6 pt-12 pb-6 rounded-b-[2rem] shadow-sm relative z-10 transition-all duration-300">
                <div className="flex justify-between items-center mb-0">
                    <div>
                        <p className="text-sm font-medium opacity-80">Tu historial</p>
                        <h1 className="text-2xl font-bold tracking-tight mt-1">Movimientos</h1>
                    </div>
                    <button
                        onClick={() => navigate('/expenses')}
                        className="flex items-center gap-1.5 bg-black/10 hover:bg-black/20 px-3 py-2 rounded-xl transition-all active:scale-95"
                    >
                        <span className="material-symbols-rounded text-lg">download</span>
                        <span className="text-xs font-bold">Exportar</span>
                    </button>
                </div>
            </header>

            {/* Pending Payments Section */}
            <div className="px-6 mt-6 relative z-10">
                <PendingPayments />
            </div>

            {/* List */}
            <div className="flex-1 mt-6 px-6 relative z-10">
                {loading ? (
                    <div className="flex justify-center py-10">
                        <span className="material-symbols-rounded animate-spin text-primary text-3xl">progress_activity</span>
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200">
                        <span className="material-symbols-rounded text-4xl text-gray-300 mb-2">receipt_long</span>
                        <p className="text-gray-400 text-sm mt-2">No tienes transacciones aún.</p>
                        <button onClick={() => navigate('/add')} className="mt-4 text-primary font-medium text-sm">+ Agregar primera</button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {transactions.map(tx => (
                            <div key={tx.id} className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-gray-50">
                                <div className="flex items-center gap-3">
                                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${getCategoryColor(tx.category)}`}>
                                        <span className="material-symbols-rounded text-xl">{getCategoryIcon(tx.category)}</span>
                                    </div>
                                    <div>
                                        <p className="font-semibold text-sm">{tx.note || tx.category}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(tx.timestamp)}</p>
                                    </div>
                                </div>
                                <span className={`font-bold text-sm ${tx.type === 'expense' ? 'text-gray-800' : 'text-primary'}`}>
                                    {tx.type === 'expense' ? '- ' : '+ '}RD$ {formatMoney(tx.amount)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <BottomNav />
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTransactions } from '../hooks/useTransactions';
import { formatMoney, formatDate, getCategoryIcon, getCategoryColor } from '../utils/format';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from './BottomNav';
import PendingPayments from './PendingPayments';
import TransactionDetailModal from './TransactionDetailModal';

export default function Transactions() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { transactions, loading, loadingMore, error, hasMore, loadMore } = useTransactions(currentUser?.uid);
    const [selectedTx, setSelectedTx] = useState(null);
    const [creditCards, setCreditCards] = useState([]);

    // Load credit cards for payment method resolution in modal
    useEffect(() => {
        if (!currentUser || !db) return;
        const unsubscribe = onSnapshot(
            collection(db, 'users', currentUser.uid, 'creditCards'),
            (snap) => setCreditCards(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            (err) => console.error('Error loading cards:', err),
        );
        return unsubscribe;
    }, [currentUser]);

    return (
        <div className="flex flex-col min-h-screen bg-[#f7f9f8] max-w-md mx-auto relative shadow-2xl overflow-x-hidden pb-32">
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

            {/* Transaction List */}
            <div className="flex-1 mt-6 px-6 relative z-10">
                {/* Error State */}
                {error && (
                    <div className="bg-red-50 text-red-600 px-4 py-3 rounded-2xl border border-red-100 flex items-center gap-2 text-sm font-medium mb-4">
                        <span className="material-symbols-rounded text-lg">error</span>
                        Error al cargar movimientos. Verifica tu conexión.
                    </div>
                )}

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
                    <>
                        {/* Section Header */}
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[15px] font-bold text-gray-700">Cargos Recientes</h3>
                            <span className="text-[12px] font-medium text-gray-400">{transactions.length} movimientos</span>
                        </div>

                        <div className="space-y-2.5">
                            {transactions.map(tx => (
                                <button
                                    key={tx.id}
                                    onClick={() => setSelectedTx(tx)}
                                    className="w-full flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-gray-50 cursor-pointer hover:bg-gray-50 hover:shadow-md hover:border-gray-100 active:scale-[0.98] transition-all duration-150 text-left group"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${getCategoryColor(tx.category)} group-hover:scale-105 transition-transform`}>
                                            <span className="material-symbols-rounded text-xl">{getCategoryIcon(tx.category)}</span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-sm truncate">{tx.note || tx.description || tx.category}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">{formatDate(tx.timestamp || tx.createdAt)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 ml-3">
                                        <span className={`font-bold text-sm ${tx.type === 'expense' ? 'text-gray-800' : 'text-primary'}`}>
                                            {tx.type === 'expense' ? '- ' : '+ '}RD$ {formatMoney(tx.amount)}
                                        </span>
                                        <span className="material-symbols-rounded text-gray-300 text-base group-hover:text-primary transition-colors">chevron_right</span>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Load More */}
                        {hasMore && (
                            <div className="flex justify-center mt-5 mb-4">
                                <button
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    className="flex items-center gap-2 px-6 py-3 bg-white rounded-2xl text-sm font-bold text-primary border border-primary/20 hover:bg-primary/5 active:scale-[0.97] transition-all disabled:opacity-50"
                                >
                                    {loadingMore ? (
                                        <>
                                            <span className="material-symbols-rounded animate-spin text-base">progress_activity</span>
                                            Cargando...
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-rounded text-base">expand_more</span>
                                            Cargar más movimientos
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Transaction Detail Modal */}
            {selectedTx && (
                <TransactionDetailModal
                    transaction={selectedTx}
                    creditCards={creditCards}
                    onClose={() => setSelectedTx(null)}
                    onEdit={(tx) => {
                        setSelectedTx(null);
                        navigate(`/add/${tx.id}`);
                    }}
                />
            )}

            <BottomNav />
        </div>
    );
}

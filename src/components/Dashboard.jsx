import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from './BottomNav';
import { formatMoney, formatDate, getCategoryIcon, getCategoryColor } from '../utils/format';

export default function Dashboard() {
    const navigate = useNavigate();
    const { currentUser, logout } = useAuth();

    const [transactions, setTransactions] = useState([]);
    const [balance, setBalance] = useState({ total: 0, income: 0, expense: 0 });
    const [showBalance, setShowBalance] = useState(true);

    useEffect(() => {
        if (!currentUser || !db) return;

        const q = query(
            collection(db, 'transactions'),
            where('userId', '==', currentUser.uid),
            orderBy('timestamp', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTransactions(txs);

            let income = 0;
            let expense = 0;
            txs.forEach(t => {
                if (t.type === 'income') income += t.amount;
                else expense += t.amount;
            });

            setBalance({ total: income - expense, income, expense });
        });

        return unsubscribe;
    }, [currentUser]);

    const userName = currentUser?.displayName?.split(' ')[0] || 'Usuario';
    const budgetUsed = balance.income > 0 ? Math.min(Math.round((balance.expense / balance.income) * 100), 100) : 0;

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/onboarding');
        } catch (e) { console.error(e); }
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#f7f9f8]">
            {/* Header */}
            <header className="px-6 pt-6 pb-4">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-sm text-gray-500">Bienvenido de nuevo,</p>
                        <h1 className="text-2xl font-bold">Hola, {userName} 👋</h1>
                    </div>
                    <button onClick={handleLogout} className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center overflow-hidden">
                        {currentUser?.photoURL ? (
                            <img src={currentUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <span className="material-symbols-rounded text-orange-600">person</span>
                        )}
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 space-y-5 pb-28">

                {/* Balance Card */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-1">
                        <p className="text-xs text-gray-400 font-semibold tracking-wider uppercase">Saldo Total</p>
                        <button onClick={() => setShowBalance(!showBalance)} className="text-primary">
                            <span className="material-symbols-rounded text-xl">{showBalance ? 'visibility' : 'visibility_off'}</span>
                        </button>
                    </div>
                    <h2 className="text-4xl font-bold">
                        {showBalance ? (
                            <>RD$ {formatMoney(balance.total)}<span className="text-xl text-gray-400">.00</span></>
                        ) : (
                            'RD$ ••••••'
                        )}
                    </h2>
                    {balance.income > 0 && (
                        <p className="text-sm text-primary mt-2 flex items-center gap-1">
                            <span className="material-symbols-rounded text-sm">trending_up</span>
                            Activo
                        </p>
                    )}
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => { navigate('/add'); }} className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm border border-gray-100 active:scale-95 transition-transform">
                        <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                            <span className="material-symbols-rounded text-primary">arrow_upward</span>
                        </div>
                        <span className="text-sm font-semibold">Ingresos</span>
                    </button>
                    <button onClick={() => { navigate('/add'); }} className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm border border-gray-100 active:scale-95 transition-transform">
                        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                            <span className="material-symbols-rounded text-red-500">arrow_downward</span>
                        </div>
                        <span className="text-sm font-semibold">Gastos</span>
                    </button>
                </div>

                {/* Gastos vs Ingresos Dashboard */}
                <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-5">Flujo de Caja</h3>
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex-1">
                            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary shadow-sm shadow-primary/30"></span> Ingresos</p>
                            <p className="font-bold text-xl text-gray-800">RD$ {formatMoney(balance.income)}</p>
                        </div>
                        <div className="w-px h-12 bg-gray-100 mx-4"></div>
                        <div className="flex-1 text-right">
                            <p className="text-xs text-gray-500 mb-1 flex items-center justify-end gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm shadow-red-500/30"></span> Gastos</p>
                            <p className="font-bold text-xl text-gray-800">RD$ {formatMoney(balance.expense)}</p>
                        </div>
                    </div>

                    {/* Barra combinada */}
                    <div className="w-full h-3 border border-gray-100/50 bg-gray-50 rounded-full overflow-hidden flex relative shadow-inner">
                        {balance.income === 0 && balance.expense === 0 ? (
                            <div className="w-full h-full bg-gray-100" />
                        ) : (
                            <>
                                <div
                                    className="h-full bg-primary transition-all duration-1000 ease-out"
                                    style={{ width: `${(balance.income / (balance.income + balance.expense)) * 100}%` }}
                                />
                                <div
                                    className="h-full bg-red-500 transition-all duration-1000 ease-out"
                                    style={{ width: `${(balance.expense / (balance.income + balance.expense)) * 100}%` }}
                                />
                            </>
                        )}
                    </div>
                    {balance.income > 0 && (
                        <div className="mt-4 flex items-center justify-center gap-2">
                            <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${budgetUsed > 90 ? 'bg-red-50 text-red-600' : budgetUsed > 70 ? 'bg-yellow-50 text-yellow-600' : 'bg-primary/10 text-primary-dark'}`}>
                                {budgetUsed}% gastado
                            </div>
                            <span className="text-xs text-gray-400">de tus ingresos</span>
                        </div>
                    )}
                </div>

                {/* Recent Transactions */}
                <section>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold">Gastos Recientes</h3>
                        <button className="text-primary text-sm font-medium">Ver todo</button>
                    </div>

                    {transactions.length === 0 ? (
                        <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200">
                            <span className="material-symbols-rounded text-4xl text-gray-300 mb-2">receipt_long</span>
                            <p className="text-gray-400 text-sm mt-2">No tienes transacciones aún.</p>
                            <button onClick={() => navigate('/add')} className="mt-4 text-primary font-medium text-sm">+ Agregar primera</button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {transactions.slice(0, 5).map(tx => (
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
                </section>
            </div>

            {/* Bottom Navigation */}
            <BottomNav />
        </div>
    );
}

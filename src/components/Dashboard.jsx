import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

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

    const formatMoney = (amount) => {
        return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return 'Reciente';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return `Hoy, ${date.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
        }
        if (date.toDateString() === yesterday.toDateString()) {
            return `Ayer, ${date.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
        }
        return date.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
    };

    const getCategoryIcon = (category) => {
        const map = {
            'Comida': 'shopping_cart',
            'Supermercado y Despensa': 'shopping_cart',
            'Transporte': 'directions_car',
            'Renta': 'home',
            'Vivienda/Alquiler': 'home',
            'Servicios': 'bolt',
            'Servicios Básicos': 'bolt',
            'Ocio': 'sports_esports',
            'Ocio y Entretenimiento': 'sports_esports',
            'Salud': 'health_and_safety',
            'Educación': 'school',
            'Ahorro e Inversión': 'savings',
            'Salario Quincenal': 'payments',
            'Freelance': 'work',
            'Rendimientos': 'trending_up',
        };
        return map[category] || 'receipt_long';
    };

    const getCategoryColor = (category) => {
        const map = {
            'Comida': 'bg-orange-50 text-orange-500',
            'Supermercado y Despensa': 'bg-orange-50 text-orange-500',
            'Transporte': 'bg-blue-50 text-blue-500',
            'Renta': 'bg-purple-50 text-purple-500',
            'Vivienda/Alquiler': 'bg-purple-50 text-purple-500',
            'Servicios': 'bg-yellow-50 text-yellow-600',
            'Servicios Básicos': 'bg-yellow-50 text-yellow-600',
            'Ocio': 'bg-pink-50 text-pink-500',
            'Ocio y Entretenimiento': 'bg-red-50 text-red-500',
            'Salud': 'bg-green-50 text-green-600',
            'Ahorro e Inversión': 'bg-emerald-50 text-emerald-600',
        };
        return map[category] || 'bg-gray-50 text-gray-500';
    };

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

                {/* Budget Progress */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold">Presupuesto del mes</h3>
                        <span className="text-sm text-gray-400">{budgetUsed}% usado</span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                        <div
                            className={`h-full rounded-full transition-all duration-1000 ease-out ${budgetUsed > 90 ? 'bg-red-500' : budgetUsed > 70 ? 'bg-yellow-500' : 'bg-primary'}`}
                            style={{ width: `${budgetUsed}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                        <span>RD$ {formatMoney(balance.expense)}</span>
                        <span>RD$ {formatMoney(balance.income)}</span>
                    </div>
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

            {/* Floating Add Button */}
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-20">
                <button
                    onClick={() => navigate('/add')}
                    className="w-16 h-16 bg-primary text-black rounded-2xl flex items-center justify-center shadow-xl shadow-primary/30 active:scale-90 transition-transform border-4 border-white"
                >
                    <span className="material-symbols-rounded text-3xl">qr_code_scanner</span>
                </button>
            </div>

            {/* Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white px-6 py-3 flex justify-between items-center border-t border-gray-100 z-10" style={{ paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}>
                <button className="flex flex-col items-center gap-0.5 text-primary">
                    <span className="material-symbols-rounded text-[22px]">home</span>
                    <span className="text-[10px] font-semibold">Inicio</span>
                </button>
                <button className="flex flex-col items-center gap-0.5 text-gray-400">
                    <span className="material-symbols-rounded text-[22px]">swap_horiz</span>
                    <span className="text-[10px]">Movimientos</span>
                </button>
                <div className="w-16" /> {/* spacer for center FAB */}
                <button onClick={() => navigate('/budgets')} className="flex flex-col items-center gap-0.5 text-gray-400">
                    <span className="material-symbols-rounded text-[22px]">donut_small</span>
                    <span className="text-[10px]">Presupuesto</span>
                </button>
                <button className="flex flex-col items-center gap-0.5 text-gray-400">
                    <span className="material-symbols-rounded text-[22px]">person</span>
                    <span className="text-[10px]">Perfil</span>
                </button>
            </nav>
        </div>
    );
}

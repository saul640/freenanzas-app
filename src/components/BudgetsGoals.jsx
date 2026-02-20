import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const budgetCategories = [
    { name: 'Comida', icon: 'restaurant', color: 'bg-blue-500', bgColor: 'bg-blue-50 text-blue-600', mapped: ['Comida', 'Supermercado y Despensa'] },
    { name: 'Transporte', icon: 'directions_car', color: 'bg-red-500', bgColor: 'bg-red-50 text-red-600', mapped: ['Transporte'] },
    { name: 'Entretenimiento', icon: 'sports_esports', color: 'bg-blue-400', bgColor: 'bg-indigo-50 text-indigo-600', mapped: ['Ocio', 'Ocio y Entretenimiento'] },
    { name: 'Servicios', icon: 'bolt', color: 'bg-yellow-500', bgColor: 'bg-yellow-50 text-yellow-600', mapped: ['Servicios', 'Servicios Básicos'] },
];

export default function BudgetsGoals() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState('presupuestos');

    const [totalIncome, setTotalIncome] = useState(0);
    const [categorySpending, setCategorySpending] = useState({});
    const [totalSavings, setTotalSavings] = useState(0);

    useEffect(() => {
        if (!currentUser || !db) return;

        const q = query(collection(db, 'transactions'), where('userId', '==', currentUser.uid));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let income = 0;
            let spending = {};
            let savings = 0;

            budgetCategories.forEach(c => { spending[c.name] = 0; });

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.type === 'income') {
                    income += data.amount;
                } else {
                    budgetCategories.forEach(cat => {
                        if (cat.mapped.includes(data.category)) {
                            spending[cat.name] += data.amount;
                        }
                    });

                    if (['Ahorro e Inversión', 'Ahorro'].includes(data.category)) {
                        savings += data.amount;
                    }
                }
            });

            setTotalIncome(income);
            setCategorySpending(spending);
            setTotalSavings(savings);
        });

        return unsubscribe;
    }, [currentUser]);

    const formatMoney = (amount) => {
        return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    };

    // Budget limits as percentage of income
    const getBudgetLimit = (catName) => {
        const limits = { 'Comida': 0.22, 'Transporte': 0.18, 'Entretenimiento': 0.11, 'Servicios': 0.11 };
        return totalIncome * (limits[catName] || 0.10);
    };

    const getUsagePercent = (spent, limit) => {
        if (limit === 0) return 0;
        return Math.round((spent / limit) * 100);
    };

    const getStatusLabel = (percent) => {
        if (percent > 100) return { text: 'Cuidado', color: 'text-red-500' };
        if (percent > 85) return { text: 'Atención', color: 'text-yellow-600' };
        if (percent > 60) return { text: '¡Vas bien!', color: 'text-green-600' };
        return { text: 'Excelente', color: 'text-green-600' };
    };

    const getBarColor = (percent) => {
        if (percent > 100) return 'bg-red-500';
        if (percent > 85) return 'bg-yellow-500';
        return 'bg-primary';
    };

    const totalBudget = budgetCategories.reduce((sum, cat) => sum + getBudgetLimit(cat.name), 0);
    const emergencyGoal = 100000;
    const emergencyPercent = Math.min(Math.round((totalSavings / emergencyGoal) * 100), 100);

    return (
        <div className="flex flex-col min-h-screen bg-[#f7f9f8]">
            {/* Header */}
            <header className="px-6 pt-5 pb-3 flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
                    <span className="material-symbols-rounded text-xl">arrow_back</span>
                </button>
                <h1 className="text-lg font-bold">Mis Finanzas</h1>
                <button className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
                    <span className="material-symbols-rounded text-xl">more_horiz</span>
                </button>
            </header>

            {/* Tabs */}
            <div className="px-6 mb-4">
                <div className="flex p-1 bg-gray-100 rounded-xl">
                    <button
                        onClick={() => setActiveTab('presupuestos')}
                        className={`flex-1 py-2.5 font-semibold rounded-lg transition-all text-sm ${activeTab === 'presupuestos' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}
                    >
                        Presupuestos
                    </button>
                    <button
                        onClick={() => setActiveTab('metas')}
                        className={`flex-1 py-2.5 font-semibold rounded-lg transition-all text-sm ${activeTab === 'metas' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}
                    >
                        Metas
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 pb-28 space-y-5">

                {activeTab === 'presupuestos' && (
                    <>
                        {/* Total Header */}
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-sm text-gray-400">Total Presupuestado</p>
                                <h2 className="text-3xl font-bold">RD$ {formatMoney(totalBudget)}</h2>
                            </div>
                            <span className="text-primary text-sm font-semibold">Mes Actual</span>
                        </div>

                        {totalIncome === 0 ? (
                            <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200">
                                <span className="material-symbols-rounded text-4xl text-gray-300">account_balance_wallet</span>
                                <p className="text-gray-400 text-sm mt-3">Registra un ingreso para activar tus presupuestos.</p>
                                <button onClick={() => navigate('/add')} className="mt-4 text-primary font-medium text-sm">+ Agregar Ingreso</button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {budgetCategories.map(cat => {
                                    const limit = getBudgetLimit(cat.name);
                                    const spent = categorySpending[cat.name] || 0;
                                    const remaining = Math.max(limit - spent, 0);
                                    const percent = getUsagePercent(spent, limit);
                                    const status = getStatusLabel(percent);
                                    const exceeds = percent > 100;

                                    return (
                                        <div key={cat.name} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cat.bgColor}`}>
                                                        <span className="material-symbols-rounded text-lg">{cat.icon}</span>
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-sm">{cat.name}</p>
                                                        <p className={`text-xs mt-0.5 ${exceeds ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                                                            {exceeds ? `RD$ ${formatMoney(spent - limit)} excedido` : `RD$ ${formatMoney(remaining)} restante`}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold text-sm">RD$ {formatMoney(spent)}</p>
                                                    <p className="text-[10px] text-gray-400">de RD$ {formatMoney(limit)}</p>
                                                </div>
                                            </div>

                                            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-1000 ${getBarColor(percent)}`}
                                                    style={{ width: `${Math.min(percent, 100)}%` }}
                                                />
                                            </div>

                                            <div className="flex justify-between text-xs">
                                                <span className={exceeds ? 'text-red-500 font-medium' : 'text-gray-400'}>{percent}% usado</span>
                                                <span className={status.color + ' font-medium'}>{status.text}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'metas' && (
                    <>
                        <h2 className="text-xl font-bold">Mis Metas</h2>

                        {/* Emergency Fund */}
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-50">
                            <div className="flex items-start gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="material-symbols-rounded text-primary">shield</span>
                                        <h3 className="font-bold">Fondo de Emergencia</h3>
                                    </div>
                                    <p className="text-xs text-gray-400 mb-2">Ahorrado hasta ahora</p>
                                    <p className="text-2xl font-bold">RD$ {formatMoney(totalSavings)}</p>
                                    <p className="text-xs text-gray-400 mt-1">Meta: RD$ {formatMoney(emergencyGoal)}</p>
                                    <button className="text-primary text-sm font-medium mt-2 flex items-center gap-1">
                                        Ver detalles <span className="material-symbols-rounded text-sm">arrow_forward</span>
                                    </button>
                                </div>

                                {/* Circular Progress */}
                                <div className="relative w-20 h-20">
                                    <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
                                        <circle cx="36" cy="36" r="30" fill="none" stroke="#e8f5e9" strokeWidth="6" />
                                        <circle
                                            cx="36" cy="36" r="30" fill="none"
                                            stroke="#0df259" strokeWidth="6"
                                            strokeLinecap="round"
                                            strokeDasharray={`${emergencyPercent * 1.884} 188.4`}
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-sm font-bold">{emergencyPercent}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Second Goal */}
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-50">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                                        <span className="material-symbols-rounded text-blue-500">flight</span>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm">Viaje a Punta Cana</h3>
                                        <p className="text-xs text-gray-400">RD$ 10,000 / RD$ 25,000</p>
                                    </div>
                                </div>
                                <div className="relative w-12 h-12">
                                    <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                                        <circle cx="24" cy="24" r="20" fill="none" stroke="#e3f2fd" strokeWidth="4" />
                                        <circle cx="24" cy="24" r="20" fill="none" stroke="#42a5f5" strokeWidth="4" strokeLinecap="round" strokeDasharray="50.26 125.66" />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-[10px] font-bold">40%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Add Goal FAB */}
                        <div className="flex justify-end">
                            <button className="w-14 h-14 bg-primary text-black rounded-full flex items-center justify-center shadow-lg shadow-primary/30 active:scale-90 transition-transform">
                                <span className="material-symbols-rounded text-2xl">add</span>
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white px-6 py-3 flex justify-between items-center border-t border-gray-100 z-10" style={{ paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}>
                <button onClick={() => navigate('/')} className="flex flex-col items-center gap-0.5 text-gray-400">
                    <span className="material-symbols-rounded text-[22px]">home</span>
                    <span className="text-[10px]">Inicio</span>
                </button>
                <button className="flex flex-col items-center gap-0.5 text-gray-400">
                    <span className="material-symbols-rounded text-[22px]">swap_horiz</span>
                    <span className="text-[10px]">Transacciones</span>
                </button>
                <div className="w-16" />
                <button className="flex flex-col items-center gap-0.5 text-primary">
                    <span className="material-symbols-rounded text-[22px]">donut_small</span>
                    <span className="text-[10px] font-semibold">Presupuestos</span>
                </button>
                <button className="flex flex-col items-center gap-0.5 text-gray-400">
                    <span className="material-symbols-rounded text-[22px]">person</span>
                    <span className="text-[10px]">Perfil</span>
                </button>
            </nav>
        </div>
    );
}

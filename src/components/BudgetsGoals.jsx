import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from './BottomNav';

export default function Analytics() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [periodTab, setPeriodTab] = useState('mensual');

    const [totalIncome, setTotalIncome] = useState(0);
    const [totalExpense, setTotalExpense] = useState(0);
    const [categorySpending, setCategorySpending] = useState([]);

    useEffect(() => {
        if (!currentUser || !db) return;
        const q = query(collection(db, 'transactions'), where('userId', '==', currentUser.uid));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let income = 0;
            let expense = 0;
            let catMap = {};

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.type === 'income') {
                    income += data.amount;
                } else {
                    expense += data.amount;
                    if (!catMap[data.category]) {
                        catMap[data.category] = {
                            name: data.category,
                            amount: 0,
                            count: 0
                        };
                    }
                    catMap[data.category].amount += data.amount;
                    catMap[data.category].count += 1;
                }
            });

            const topCategories = Object.values(catMap).sort((a, b) => b.amount - a.amount);

            setTotalIncome(income);
            setTotalExpense(expense);
            setCategorySpending(topCategories);
        });
        return unsubscribe;
    }, [currentUser]);

    const formatMoney = (amount) => {
        return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    };

    const getIconData = (catName) => {
        const mapping = {
            'Comida': { icon: 'restaurant', color: 'text-orange-500', bg: 'bg-orange-100', bar: 'bg-orange-500' },
            'Supermercado y Despensa': { icon: 'shopping_cart', color: 'text-orange-500', bg: 'bg-orange-100', bar: 'bg-orange-500' },
            'Transporte': { icon: 'directions_car', color: 'text-blue-500', bg: 'bg-blue-100', bar: 'bg-blue-500' },
            'Servicios': { icon: 'bolt', color: 'text-purple-500', bg: 'bg-purple-100', bar: 'bg-purple-500' },
            'Servicios Básicos': { icon: 'bolt', color: 'text-purple-500', bg: 'bg-purple-100', bar: 'bg-purple-500' },
        };
        return mapping[catName] || { icon: 'category', color: 'text-gray-500', bg: 'bg-gray-100', bar: 'bg-gray-400' };
    };

    const percentSpent = totalIncome > 0 ? Math.min(Math.round((totalExpense / totalIncome) * 100), 100) : 0;
    const balanceAvailable = totalIncome - totalExpense;

    return (
        <div className="flex flex-col min-h-screen bg-[#f5f7f6]">
            {/* Header Mirror/iOS Style */}
            <header className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-[#f5f7f6]/90 backdrop-blur-md px-6 pt-12 pb-4 flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-black/5 active:scale-95 transition-all">
                    <span className="material-symbols-rounded text-2xl text-gray-800">arrow_back_ios_new</span>
                </button>
                <h1 className="text-xl font-bold text-gray-900">Análisis Mensual</h1>
                <button className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-black/5 active:scale-95 transition-all">
                    <span className="material-symbols-rounded text-2xl text-gray-800">more_horiz</span>
                </button>
            </header>

            {/* Content Spacer */}
            <div className="pt-28 pb-28 px-5 space-y-5">

                {/* Tabs Switcher */}
                <div className="bg-white/50 border border-gray-200/50 p-1.5 rounded-2xl flex max-w-[280px] mx-auto shadow-sm">
                    <button
                        onClick={() => setPeriodTab('mensual')}
                        className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${periodTab === 'mensual' ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Mensual
                    </button>
                    <button
                        onClick={() => setPeriodTab('semanal')}
                        className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${periodTab === 'semanal' ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Semanal
                    </button>
                </div>

                {/* Resumen Cards */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Ingresos */}
                    <div className="bg-white rounded-3xl p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-white">
                        <div className="flex items-center gap-1.5 mb-2">
                            <span className="material-symbols-rounded text-primary font-bold text-[18px]">arrow_downward</span>
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Ingresos</span>
                        </div>
                        <h2 className="text-xl font-extrabold text-gray-900 mb-1">RD$ {formatMoney(totalIncome)}</h2>
                        <p className="text-[10px] font-semibold text-primary">+12% vs mes ant.</p>
                    </div>

                    {/* Gastos */}
                    <div className="bg-white rounded-3xl p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-white">
                        <div className="flex items-center gap-1.5 mb-2">
                            <span className="material-symbols-rounded text-red-500 font-bold text-[18px]">arrow_upward</span>
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Gastos</span>
                        </div>
                        <h2 className="text-xl font-extrabold text-gray-900 mb-1">RD$ {formatMoney(totalExpense)}</h2>
                        <p className="text-[10px] font-semibold text-gray-400">-5% vs mes ant.</p>
                    </div>
                </div>

                {/* Gráfico Principal */}
                <div className="bg-white rounded-[32px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
                    {/* Donut Chart SVG */}
                    <div className="flex justify-center mb-6 mt-2 relative">
                        <div className="w-40 h-40 relative">
                            <svg className="w-full h-full -rotate-90 drop-shadow-sm" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="42" fill="none" stroke="#e6fceb" strokeWidth="12" />
                                <circle
                                    cx="50" cy="50" r="42" fill="none"
                                    stroke="currentColor" strokeWidth="12"
                                    strokeLinecap="round"
                                    className="text-primary transition-all duration-1000 ease-in-out drop-shadow-[0_0_8px_rgba(13,242,89,0.5)]"
                                    strokeDasharray={`${percentSpent * 2.638} 263.8`}
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Gastado</span>
                                <span className="text-2xl font-extrabold text-gray-900 leading-none">{percentSpent}%</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between items-end mb-4 relative z-10">
                        <div>
                            <p className="text-sm font-semibold text-gray-500 mb-1">Balance Disponible</p>
                            <h2 className="text-3xl font-extrabold text-gray-900">RD$ {formatMoney(balanceAvailable)}</h2>
                        </div>
                        <div className="bg-[#e6fceb] px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm border border-primary/10">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                            <span className="text-xs font-bold text-primary-dark">Saludable</span>
                        </div>
                    </div>

                    {/* Trend line graphic */}
                    <div className="relative mt-6 mb-2">
                        <svg className="w-full h-12" preserveAspectRatio="none" viewBox="0 0 200 40">
                            <path
                                d="M0,35 Q20,30 40,35 T80,25 T120,40 T160,10 T200,30"
                                fill="none"
                                stroke="#0df259"
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="drop-shadow-[0_4px_6px_rgba(13,242,89,0.3)]"
                            />
                        </svg>
                        <p className="text-[10px] font-bold text-gray-400 absolute bottom-[-5px] right-0 bg-white pl-2">Tendencia de ahorro +4%</p>
                    </div>
                </div>

                {/* Listado de Categorías */}
                <div>
                    <div className="flex justify-between items-end mb-4 px-2">
                        <h3 className="text-[17px] font-bold text-gray-900">Categorías con más gastos</h3>
                        <button className="text-sm font-bold text-primary active:scale-95 transition-transform">Ver todas</button>
                    </div>

                    <div className="space-y-3">
                        {categorySpending.length === 0 ? (
                            <p className="text-center text-sm text-gray-400 py-6">No hay gastos registrados aún.</p>
                        ) : (
                            categorySpending.slice(0, 4).map((cat, index) => {
                                const { icon, color, bg, bar } = getIconData(cat.name);
                                const progress = Math.min((cat.amount / totalExpense) * 100, 100);

                                return (
                                    <div key={index} className="bg-white rounded-[24px] p-5 shadow-[0_4px_15px_-4px_rgba(0,0,0,0.03)] border border-white">
                                        <div className="flex items-center gap-4 mb-3">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${bg}`}>
                                                <span className={`material-symbols-rounded text-2xl ${color}`}>{icon}</span>
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-gray-900 leading-tight">{cat.name}</h4>
                                                <p className="text-xs font-medium text-gray-400 mt-0.5">{cat.count} {cat.count === 1 ? 'transacción' : 'transacciones'}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-extrabold text-gray-900">RD$ {formatMoney(cat.amount)}</p>
                                            </div>
                                        </div>

                                        {/* Progress Bar Lineal */}
                                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
                                            <div className={`h-full rounded-full ${bar}`} style={{ width: `${progress}%` }} />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

            </div>

            <BottomNav />
        </div>
    );
}

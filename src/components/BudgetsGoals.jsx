import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from './BottomNav';
import CategoryDetailModal from './CategoryDetailModal';

// ─── Color mapping: Firestore color id → hex + tailwind ───
const COLOR_MAP = {
    blue: { hex: '#3b82f6', text: 'text-blue-500', bg: 'bg-blue-100', bar: 'bg-blue-500' },
    purple: { hex: '#a855f7', text: 'text-purple-500', bg: 'bg-purple-100', bar: 'bg-purple-500' },
    pink: { hex: '#ec4899', text: 'text-pink-500', bg: 'bg-pink-100', bar: 'bg-pink-500' },
    red: { hex: '#ef4444', text: 'text-red-500', bg: 'bg-red-100', bar: 'bg-red-500' },
    orange: { hex: '#f97316', text: 'text-orange-500', bg: 'bg-orange-100', bar: 'bg-orange-500' },
    yellow: { hex: '#eab308', text: 'text-yellow-500', bg: 'bg-yellow-100', bar: 'bg-yellow-500' },
    green: { hex: '#22c55e', text: 'text-green-500', bg: 'bg-green-100', bar: 'bg-green-500' },
    emerald: { hex: '#10b981', text: 'text-emerald-500', bg: 'bg-emerald-100', bar: 'bg-emerald-500' },
    teal: { hex: '#14b8a6', text: 'text-teal-500', bg: 'bg-teal-100', bar: 'bg-teal-500' },
    cyan: { hex: '#06b6d4', text: 'text-cyan-500', bg: 'bg-cyan-100', bar: 'bg-cyan-500' },
    indigo: { hex: '#6366f1', text: 'text-indigo-500', bg: 'bg-indigo-100', bar: 'bg-indigo-500' },
    gray: { hex: '#6b7280', text: 'text-gray-500', bg: 'bg-gray-100', bar: 'bg-gray-400' },
};

// ─── Default icon+color mapping for built-in categories ───
const DEFAULT_CAT_MAP = {
    'Comida': { icon: 'restaurant', colorId: 'orange' },
    'Supermercado y Despensa': { icon: 'shopping_cart', colorId: 'orange' },
    'Transporte': { icon: 'directions_car', colorId: 'blue' },
    'Servicios': { icon: 'bolt', colorId: 'purple' },
    'Servicios Básicos': { icon: 'bolt', colorId: 'purple' },
    'Renta': { icon: 'home', colorId: 'indigo' },
    'Vivienda/Alquiler': { icon: 'home', colorId: 'indigo' },
    'Ocio': { icon: 'sports_esports', colorId: 'pink' },
    'Ocio y Entretenimiento': { icon: 'sports_esports', colorId: 'red' },
    'Salud': { icon: 'health_and_safety', colorId: 'green' },
    'Educación': { icon: 'school', colorId: 'cyan' },
    'Ahorro': { icon: 'savings', colorId: 'emerald' },
    'Ahorro e Inversión': { icon: 'savings', colorId: 'emerald' },
    'Otros': { icon: 'more_horiz', colorId: 'gray' },
};

export default function Analytics() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [periodTab, setPeriodTab] = useState('mensual');

    const [allTransactions, setAllTransactions] = useState([]);
    const [customCategories, setCustomCategories] = useState([]);
    const [showAllCats, setShowAllCats] = useState(false);

    // ─── Drill-down modal state ───
    const [selectedCategory, setSelectedCategory] = useState(null);

    // ─── Fetch transactions ───
    useEffect(() => {
        if (!currentUser || !db) return;
        const q = query(collection(db, 'transactions'), where('userId', '==', currentUser.uid));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllTransactions(txs);
        });
        return unsubscribe;
    }, [currentUser]);

    // ─── Fetch custom categories ───
    useEffect(() => {
        if (!currentUser || !db) return;
        const categoriesRef = collection(db, 'users', currentUser.uid, 'categories');
        const unsubscribe = onSnapshot(categoriesRef, (snapshot) => {
            const cats = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(item => item?.name);
            setCustomCategories(cats);
        });
        return unsubscribe;
    }, [currentUser]);

    // ─── Build a lookup Map: categoryName → { icon, colorId } ───
    const categoryLookup = useMemo(() => {
        const lookup = { ...DEFAULT_CAT_MAP };
        customCategories.forEach(cat => {
            if (!lookup[cat.name]) {
                lookup[cat.name] = {
                    icon: cat.icon || 'label',
                    colorId: cat.color || 'teal',
                };
            }
        });
        return lookup;
    }, [customCategories]);

    // ─── Resolve full icon data for a category name ───
    const getIconData = useCallback((catName) => {
        const entry = categoryLookup[catName] || { icon: 'label', colorId: 'teal' };
        const colors = COLOR_MAP[entry.colorId] || COLOR_MAP.teal;
        return { icon: entry.icon, color: colors.text, bg: colors.bg, bar: colors.bar, hex: colors.hex };
    }, [categoryLookup]);

    // ─── Memoized computations ───
    const { totalIncome, totalExpense, categorySpending } = useMemo(() => {
        let income = 0;
        let expense = 0;
        const catMap = {};

        allTransactions.forEach(tx => {
            if (tx.type === 'income') {
                income += tx.amount;
            } else {
                expense += tx.amount;
                if (!catMap[tx.category]) {
                    catMap[tx.category] = { name: tx.category, amount: 0, count: 0 };
                }
                catMap[tx.category].amount += tx.amount;
                catMap[tx.category].count += 1;
            }
        });

        const topCategories = Object.values(catMap).sort((a, b) => b.amount - a.amount);
        return { totalIncome: income, totalExpense: expense, categorySpending: topCategories };
    }, [allTransactions]);

    const formatMoney = useCallback((amount) => {
        return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    }, []);

    const percentSpent = totalIncome > 0 ? Math.min(Math.round((totalExpense / totalIncome) * 100), 100) : 0;
    const balanceAvailable = totalIncome - totalExpense;

    // ─── Donut chart segments (memoized) ───
    const CIRCUMFERENCE = 2 * Math.PI * 42; // ~263.89
    const donutSegments = useMemo(() => {
        if (totalExpense === 0 || categorySpending.length === 0) return [];
        let accumulated = 0;
        return categorySpending.map(cat => {
            const pct = cat.amount / totalExpense;
            const dash = pct * CIRCUMFERENCE;
            const offset = -accumulated * CIRCUMFERENCE;
            accumulated += pct;
            const { hex } = getIconData(cat.name);
            return { name: cat.name, dash, offset, hex };
        });
    }, [categorySpending, totalExpense, getIconData, CIRCUMFERENCE]);

    // ─── Visible categories (show all or top 4) ───
    const visibleCategories = showAllCats ? categorySpending : categorySpending.slice(0, 4);

    // ─── Modal handlers ───
    const handleCategoryClick = useCallback((cat) => {
        setSelectedCategory(cat.name);
    }, []);

    const handleCloseModal = useCallback(() => {
        setSelectedCategory(null);
    }, []);

    const selectedIconData = selectedCategory ? getIconData(selectedCategory) : null;

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

                {/* Gráfico Principal — Donut Segmentado por Categorías */}
                <div className="bg-white rounded-[32px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
                    {/* Donut Chart SVG — Multi-segment */}
                    <div className="flex justify-center mb-6 mt-2 relative">
                        <div className="w-44 h-44 relative">
                            <svg className="w-full h-full -rotate-90 drop-shadow-sm" viewBox="0 0 100 100">
                                {/* Background ring */}
                                <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f4" strokeWidth="13" />
                                {/* Category segments */}
                                {donutSegments.map((seg, i) => (
                                    <circle
                                        key={seg.name}
                                        cx="50" cy="50" r="42" fill="none"
                                        stroke={seg.hex}
                                        strokeWidth="13"
                                        strokeDasharray={`${seg.dash} ${CIRCUMFERENCE}`}
                                        strokeDashoffset={seg.offset}
                                        className="transition-all duration-700 ease-out"
                                        style={{
                                            filter: `drop-shadow(0 0 4px ${seg.hex}40)`,
                                        }}
                                    />
                                ))}
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Gastado</span>
                                <span className="text-2xl font-extrabold text-gray-900 leading-none">{percentSpent}%</span>
                            </div>
                        </div>
                    </div>

                    {/* Leyenda de colores compacta */}
                    {donutSegments.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mb-5">
                            {donutSegments.slice(0, 5).map(seg => (
                                <div key={seg.name} className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.hex }} />
                                    <span className="text-[11px] font-semibold text-gray-500 truncate max-w-[80px]">{seg.name}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex justify-between items-end mb-4 relative z-10">
                        <div>
                            <p className="text-sm font-semibold text-gray-500 mb-1">Balance Disponible</p>
                            <h2 className="text-3xl font-extrabold text-gray-900">RD$ {formatMoney(balanceAvailable)}</h2>
                        </div>
                        <div className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm border ${balanceAvailable >= 0 ? 'bg-[#e6fceb] border-primary/10' : 'bg-red-50 border-red-100'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${balanceAvailable >= 0 ? 'bg-primary' : 'bg-red-500'}`}></span>
                            <span className={`text-xs font-bold ${balanceAvailable >= 0 ? 'text-primary-dark' : 'text-red-600'}`}>
                                {balanceAvailable >= 0 ? 'Saludable' : 'Déficit'}
                            </span>
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

                {/* Listado de Categorías — INTERACTIVO */}
                <div>
                    <div className="flex justify-between items-end mb-4 px-2">
                        <h3 className="text-[17px] font-bold text-gray-900">
                            {showAllCats ? 'Todas las categorías' : 'Categorías con más gastos'}
                        </h3>
                        <button
                            onClick={() => setShowAllCats(!showAllCats)}
                            className="text-sm font-bold text-primary active:scale-95 transition-transform"
                        >
                            {showAllCats ? 'Ver menos' : 'Ver todas'}
                        </button>
                    </div>

                    <div className="space-y-3">
                        {categorySpending.length === 0 ? (
                            <p className="text-center text-sm text-gray-400 py-6">No hay gastos registrados aún.</p>
                        ) : (
                            visibleCategories.map((cat, index) => {
                                const { icon, color, bg, bar } = getIconData(cat.name);
                                const progress = totalExpense > 0 ? Math.min((cat.amount / totalExpense) * 100, 100) : 0;

                                return (
                                    <button
                                        key={index}
                                        onClick={() => handleCategoryClick(cat)}
                                        className="w-full text-left bg-white rounded-[24px] p-5 shadow-[0_4px_15px_-4px_rgba(0,0,0,0.03)] border border-white hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] active:scale-[0.98] transition-all duration-200 cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-4 mb-3">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${bg} group-hover:scale-110 transition-transform duration-200`}>
                                                <span className={`material-symbols-rounded text-2xl ${color}`}>{icon}</span>
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-gray-900 leading-tight">{cat.name}</h4>
                                                <p className="text-xs font-medium text-gray-400 mt-0.5">{cat.count} {cat.count === 1 ? 'transacción' : 'transacciones'}</p>
                                            </div>
                                            <div className="text-right flex items-center gap-2">
                                                <p className="font-extrabold text-gray-900">RD$ {formatMoney(cat.amount)}</p>
                                                <span className="material-symbols-rounded text-gray-300 text-lg group-hover:text-primary transition-colors">chevron_right</span>
                                            </div>
                                        </div>

                                        {/* Progress Bar Lineal */}
                                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
                                            <div className={`h-full rounded-full ${bar} transition-all duration-700`} style={{ width: `${progress}%` }} />
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

            </div>

            {/* Category Detail Modal */}
            <CategoryDetailModal
                isOpen={selectedCategory !== null}
                onClose={handleCloseModal}
                categoryName={selectedCategory}
                transactions={allTransactions}
                iconData={selectedIconData}
            />

            <BottomNav />
        </div>
    );
}

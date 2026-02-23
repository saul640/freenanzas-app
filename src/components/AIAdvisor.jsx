import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { analyzeSpending, analyzeSpendingLocal } from '../lib/gemini';
import BottomNav from './BottomNav';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function AIAdvisor() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [transactions, setTransactions] = useState([]);
    const [insights, setInsights] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!currentUser || !db) return;
        const q = query(collection(db, 'transactions'), where('userId', '==', currentUser.uid));
        const unsub = onSnapshot(q, snap => {
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, [currentUser]);

    const { totalIncome, totalExpense, categories } = useMemo(() => {
        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();
        let income = 0, expense = 0;
        const catMap = {};
        transactions.forEach(tx => {
            const txDate = tx.timestamp?.toDate ? tx.timestamp.toDate() : tx.date ? new Date(tx.date) : null;
            if (!txDate || txDate.getMonth() !== thisMonth || txDate.getFullYear() !== thisYear) return;
            if (tx.type === 'income') income += tx.amount;
            else {
                expense += tx.amount;
                const cat = tx.category || 'Otros';
                if (!catMap[cat]) catMap[cat] = { name: cat, amount: 0, count: 0 };
                catMap[cat].amount += tx.amount;
                catMap[cat].count++;
            }
        });
        return { totalIncome: income, totalExpense: expense, categories: Object.values(catMap).sort((a, b) => b.amount - a.amount) };
    }, [transactions]);

    const formatMoney = useCallback(n => new Intl.NumberFormat('es-DO').format(n), []);

    const handleAnalyze = async () => {
        setLoading(true);
        setError(null);
        const monthName = MONTH_NAMES[new Date().getMonth()];
        try {
            // Try Gemini first
            const result = await analyzeSpending({ totalIncome, totalExpense, categories, monthName });
            setInsights(result);
            sessionStorage.setItem('aiInsights', JSON.stringify(result));
        } catch (e) {
            console.warn('Gemini failed, using local analysis:', e.message);
            // Fallback to local algorithm
            const local = analyzeSpendingLocal(categories, totalExpense);
            setInsights(local);
        }
        setLoading(false);
    };

    // Load cached insights
    useEffect(() => {
        const cached = sessionStorage.getItem('aiInsights');
        if (cached) { try { setInsights(JSON.parse(cached)); } catch { } }
    }, []);

    return (
        <div className="flex flex-col min-h-screen bg-[#f5f7f6]">
            <header className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-[#f5f7f6]/90 backdrop-blur-md px-6 pt-12 pb-4 flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-black/5 active:scale-95 transition-all"><span className="material-symbols-rounded text-2xl text-gray-800">arrow_back_ios_new</span></button>
                <h1 className="text-xl font-bold text-gray-900">Asesor Financiero IA</h1>
                <div className="w-10" />
            </header>

            <div className="pt-28 pb-28 px-5 space-y-5">
                {/* Analyze Button */}
                <button onClick={handleAnalyze} disabled={loading || categories.length === 0} className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg disabled:opacity-50 active:scale-[0.98] transition-transform flex items-center justify-center gap-3">
                    {loading ? (
                        <><span className="material-symbols-rounded animate-spin">progress_activity</span> Analizando...</>
                    ) : (
                        <><span className="material-symbols-rounded text-2xl">auto_awesome</span> Analizar Mis Gastos</>
                    )}
                </button>

                {categories.length === 0 && (
                    <p className="text-center text-sm text-gray-400 py-4">Registra gastos este mes para obtener tu análisis personalizado.</p>
                )}

                {/* Insights */}
                {insights && (
                    <div className="space-y-4 animate-in fade-in duration-500">
                        {/* Summary */}
                        <div className="bg-gradient-to-br from-violet-500 to-indigo-600 rounded-[28px] p-6 shadow-lg relative overflow-hidden">
                            <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                            <div className="flex items-start gap-3">
                                <span className="material-symbols-rounded text-3xl text-white/80">psychology</span>
                                <div>
                                    <p className="text-sm font-bold text-white/90">Resumen de IA</p>
                                    <p className="text-white/80 text-sm mt-1 leading-relaxed">{insights.resumen}</p>
                                </div>
                            </div>
                        </div>

                        {/* Alert */}
                        {insights.alerta && (
                            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
                                <span className="material-symbols-rounded text-red-500 text-2xl">warning</span>
                                <p className="text-sm text-red-700 font-medium">{insights.alerta}</p>
                            </div>
                        )}

                        {/* 50-30-20 Rule */}
                        {insights.regla503020 && (
                            <div className="bg-white rounded-[28px] p-6 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="material-symbols-rounded text-indigo-500">pie_chart</span>
                                    <h3 className="font-bold text-gray-900">Regla 50-30-20</h3>
                                </div>
                                <div className="space-y-3">
                                    {[
                                        { label: 'Necesidades', ideal: 50, real: insights.regla503020.necesidadesReal, color: 'bg-blue-500' },
                                        { label: 'Deseos', ideal: 30, real: insights.regla503020.deseosReal, color: 'bg-purple-500' },
                                        { label: 'Ahorro', ideal: 20, real: insights.regla503020.ahorroReal, color: 'bg-emerald-500' },
                                    ].map(item => (
                                        <div key={item.label}>
                                            <div className="flex justify-between text-xs mb-1">
                                                <span className="font-bold text-gray-700">{item.label}</span>
                                                <span className="text-gray-400">Real: {item.real || 0}% · Ideal: {item.ideal}%</span>
                                            </div>
                                            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden relative">
                                                <div className={`h-full rounded-full ${item.color} transition-all duration-700`} style={{ width: `${Math.min(item.real || 0, 100)}%` }} />
                                                <div className="absolute top-0 h-full w-0.5 bg-gray-400" style={{ left: `${item.ideal}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {insights.regla503020.veredicto && <p className="text-xs text-gray-500 mt-3 italic">{insights.regla503020.veredicto}</p>}
                            </div>
                        )}

                        {/* Ant/Vampire Expenses */}
                        {insights.gastosHormiga?.length > 0 && (
                            <div className="bg-white rounded-[28px] p-6 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="material-symbols-rounded text-amber-500">pest_control</span>
                                    <h3 className="font-bold text-gray-900">Gastos Hormiga</h3>
                                </div>
                                <div className="space-y-3">
                                    {insights.gastosHormiga.map((ant, i) => (
                                        <div key={i} className="bg-amber-50 rounded-2xl p-4">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-gray-900">{ant.categoria}</span>
                                                <span className="text-sm font-extrabold text-amber-600">RD$ {formatMoney(ant.monto)}</span>
                                            </div>
                                            <p className="text-xs text-gray-500">{ant.frecuencia} transacciones · {ant.consejo}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 bg-green-50 rounded-2xl p-4 flex items-center gap-3">
                                    <span className="material-symbols-rounded text-green-500 text-2xl">savings</span>
                                    <div>
                                        <p className="text-xs text-gray-500">Potencial de ahorro mensual</p>
                                        <p className="text-xl font-extrabold text-green-600">RD$ {formatMoney(insights.potencialAhorro)}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tips */}
                        {insights.tips?.length > 0 && (
                            <div className="bg-white rounded-[28px] p-6 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="material-symbols-rounded text-cyan-500">lightbulb</span>
                                    <h3 className="font-bold text-gray-900">Tips Personalizados</h3>
                                </div>
                                <div className="space-y-3">
                                    {insights.tips.map((tip, i) => (
                                        <div key={i} className="flex gap-3 items-start">
                                            <span className="w-6 h-6 bg-cyan-100 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-cyan-600">{i + 1}</span>
                                            <p className="text-sm text-gray-700 leading-relaxed">{tip}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <BottomNav />
        </div>
    );
}

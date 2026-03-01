import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLoans } from '../hooks/useLoans';
import { useDailyInsight } from '../hooks/useDailyInsight';
import { collection, query, where, onSnapshot, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import BottomNav from './BottomNav';
import PaywallModal from './PaywallModal';
import { formatMoney, formatDate, getCategoryIcon, getCategoryColor } from '../utils/format';
import TransactionDetailModal from './TransactionDetailModal';

export default function Dashboard() {
    const navigate = useNavigate();
    const { currentUser, logout, isProUser, isTrialUser, userData } = useAuth();
    const { loans } = useLoans(currentUser?.uid); // Added loans hook
    const { insight: dailyInsightText, loading: insightLoading } = useDailyInsight(userData, currentUser);

    const [transactions, setTransactions] = useState([]);
    const [balance, setBalance] = useState({ total: 0, income: 0, expense: 0 });
    const [showBalance, setShowBalance] = useState(true);
    const [selectedTx, setSelectedTx] = useState(null);
    const [creditCards, setCreditCards] = useState([]);
    const [showPaywall, setShowPaywall] = useState(false);



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

    // Load credit cards for modal payment method resolution
    useEffect(() => {
        if (!currentUser || !db) return;
        const setCards = (val) => setCreditCards(val); // Defined setCards before usage
        const unsubscribe = onSnapshot(
            collection(db, 'users', currentUser.uid, 'creditCards'),
            (snap) => setCards(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            (err) => console.error('Error loading cards:', err),
        );
        return unsubscribe;
    }, [currentUser]);

    const userName = currentUser?.displayName?.split(' ')[0] || 'Usuario';
    const budgetUsed = balance.income > 0 ? Math.min(Math.round((balance.expense / balance.income) * 100), 100) : 0;

    // Lógica de Recomendaciones (Affiliate Engine)
    const recommendation = useMemo(() => {
        try {
            const getCardBalanceDOP = (card) => card.balanceDOP ?? card.balanceALaFecha ?? card.balance ?? 0;

            const highInterestCards = creditCards.filter(c => (Number(c.interestRate) || 0) > 25 && getCardBalanceDOP(c) > 0);
            const highInterestLoans = (loans || []).filter(l => (Number(l.tasaInteres) || 0) > 25 && l.balancePendiente > 0);

            const allDebts = [
                ...highInterestCards.map(c => ({ name: c.name, rate: Number(c.interestRate), type: 'tarjeta' })),
                ...highInterestLoans.map(l => ({ name: l.nombrePrestamo, rate: Number(l.tasaInteres), type: 'préstamo' }))
            ];

            if (allDebts.length > 0) {
                const worstDebt = allDebts.sort((a, b) => b.rate - a.rate)[0];
                return {
                    title: "🚨 Alerta de Interés Alto",
                    content: `Estás pagando un ${worstDebt.rate}% de interés en tu ${worstDebt.type} "${worstDebt.name}". Una consolidación al 15% te ahorraría miles de pesos.`,
                    cta: "Ver oferta de consolidación",
                    link: import.meta.env.VITE_AFFILIATE_LOAN_LINK || "https://ejemplo-banco.com/afiliado"
                };
            }
        } catch (error) {
            console.error("Error al procesar datos para afiliados:", error);
        }

        return {
            title: "💡 Tip Financiero",
            content: "Mantén tu ahorro del 10% hoy. Tu 'yo' del futuro te lo agradecerá enormemente.",
            cta: null,
            link: null
        };
    }, [creditCards, loans]);

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
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            Hola, {userName} 👋
                            {isProUser && !isTrialUser && (
                                <span className="material-symbols-rounded text-amber-500 text-xl" title="Usuario PRO">crown</span>
                            )}
                        </h1>
                        <p className="text-xs text-emerald-700/70 mt-1">Construyendo tu libertad financiera</p>
                    </div>
                    <div className="flex items-center gap-2">

                        <button onClick={handleLogout} className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center overflow-hidden">
                            {currentUser?.photoURL ? (
                                <img src={currentUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <span className="material-symbols-rounded text-orange-600">person</span>
                            )}
                        </button>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 space-y-5 pb-40">

                {/* Balance Card */}
                <div className="relative overflow-hidden rounded-3xl p-6 shadow-xl border border-white/10 bg-gradient-to-br from-[#0df259] to-emerald-800">
                    <div className="absolute -top-16 -right-10 w-40 h-40 bg-white/20 rounded-full blur-3xl" aria-hidden="true"></div>
                    <div className="absolute -bottom-20 -left-16 w-52 h-52 bg-emerald-900/30 rounded-full blur-3xl" aria-hidden="true"></div>
                    <div className="absolute inset-0 bg-white/10 backdrop-blur-[2px]" aria-hidden="true"></div>
                    <div className="relative z-10 flex justify-between items-center mb-1">
                        <p className="text-xs text-white/80 font-semibold tracking-wider uppercase">Saldo Total</p>
                        <button onClick={() => setShowBalance(!showBalance)} className="text-white/90 hover:text-white transition-colors">
                            <span className="material-symbols-rounded text-xl">{showBalance ? 'visibility' : 'visibility_off'}</span>
                        </button>
                    </div>
                    <h2 className="relative z-10 text-4xl font-bold text-white">
                        {showBalance ? (
                            <>RD$ {formatMoney(balance.total)}<span className="text-xl text-white/70">.00</span></>
                        ) : (
                            'RD$ ••••••'
                        )}
                    </h2>
                    {balance.income > 0 && (
                        <p className="relative z-10 text-sm text-white/90 mt-2 inline-flex items-center gap-1 bg-white/15 px-2.5 py-1 rounded-full">
                            <span className="material-symbols-rounded text-sm">trending_up</span>
                            Activo
                        </p>
                    )}
                </div>

                {/* Insight del día */}
                <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-gradient-to-r from-amber-50 via-amber-50 to-emerald-50 p-4 shadow-sm">
                    <div className="w-11 h-11 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shadow-sm shrink-0">
                        {insightLoading ? (
                            <span className="material-symbols-rounded animate-spin opacity-50">sync</span>
                        ) : (
                            <span className="material-symbols-rounded">lightbulb</span>
                        )}
                    </div>
                    <div className="flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700/80">Insight del dia</p>
                        {insightLoading ? (
                            <p className="text-sm text-amber-900/60 animate-pulse">Analizando tus finanzas...</p>
                        ) : (
                            <p className="text-sm text-amber-900">{dailyInsightText || "Un presupuesto es decir a tu dinero a dónde ir en lugar de preguntarte a dónde fue."}</p>
                        )}
                    </div>
                </div>

                {/* Ofertas para ti (Lead Gen Engine) */}
                <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-3">
                        <span className="material-symbols-rounded text-primary/20 text-4xl leading-none">request_quote</span>
                    </div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ofertas para ti</h3>
                    <p className="text-sm font-bold text-gray-800 mb-1">{recommendation.title}</p>
                    <p className="text-xs text-gray-500 mb-4 pr-10">{recommendation.content}</p>

                    {recommendation.cta && (
                        <a
                            href={recommendation.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-primary text-black text-xs font-bold px-4 py-2.5 rounded-xl active:scale-95 transition-transform shadow-sm"
                        >
                            {recommendation.cta}
                            <span className="material-symbols-rounded text-sm">open_in_new</span>
                        </a>
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

                {/* Financial Tools Grid */}
                <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-3">Herramientas Financieras</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => navigate('/recurring')} className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-gray-100 active:scale-95 transition-transform text-left">
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><span className="material-symbols-rounded text-indigo-500">event_repeat</span></div>
                            <div><p className="text-sm font-bold text-gray-800">Recurrentes</p><p className="text-[10px] text-gray-400">Calendario</p></div>
                        </button>
                        <button onClick={() => navigate('/budget')} className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-gray-100 active:scale-95 transition-transform text-left">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><span className="material-symbols-rounded text-emerald-500">account_balance</span></div>
                            <div><p className="text-sm font-bold text-gray-800">Presupuesto</p><p className="text-[10px] text-gray-400">Mensual</p></div>
                        </button>
                        <button onClick={() => navigate('/cards')} className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-gray-100 active:scale-95 transition-transform text-left">
                            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><span className="material-symbols-rounded text-purple-500">credit_card</span></div>
                            <div><p className="text-sm font-bold text-gray-800">Tarjetas</p><p className="text-[10px] text-gray-400">Crédito</p></div>
                        </button>
                        <button onClick={() => navigate('/advisor')} className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-gray-100 active:scale-95 transition-transform text-left">
                            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center"><span className="material-symbols-rounded text-violet-500">auto_awesome</span></div>
                            <div><p className="text-sm font-bold text-gray-800">Asesor IA</p><p className="text-[10px] text-gray-400">Consejos</p></div>
                        </button>
                        <button onClick={() => navigate('/loans')} className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-gray-100 active:scale-95 transition-transform text-left">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><span className="material-symbols-rounded text-amber-500">account_balance</span></div>
                            <div><p className="text-sm font-bold text-gray-800">Préstamos</p><p className="text-[10px] text-gray-400">Deudas</p></div>
                        </button>
                        <button onClick={() => navigate('/add')} className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-cyan-100 active:scale-95 transition-transform text-left">
                            <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center"><span className="material-symbols-rounded text-cyan-500">smart_toy</span></div>
                            <div><p className="text-sm font-bold text-gray-800">Filtro IA</p><p className="text-[10px] text-gray-400">Preventivo</p></div>
                        </button>
                    </div>
                </div>

                {/* Hazte PRO Banner — solo para usuarios free/trial expirado */}
                {!isProUser && (
                    <button
                        onClick={() => setShowPaywall(true)}
                        className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 rounded-2xl p-4 flex items-center gap-4 shadow-lg active:scale-[0.98] transition-transform text-left"
                    >
                        <div className="w-12 h-12 rounded-full bg-white/30 flex items-center justify-center">
                            <span className="material-symbols-rounded text-white text-2xl">crown</span>
                        </div>
                        <div className="flex-1">
                            <p className="font-bold text-white text-sm">Desbloquea Freenanzas PRO</p>
                            <p className="text-white/80 text-xs">IA ilimitada, reportes avanzados y más</p>
                        </div>
                        <span className="material-symbols-rounded text-white/80">chevron_right</span>
                    </button>
                )}
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
                        <button onClick={() => navigate('/transactions')} className="text-primary text-sm font-medium hover:underline transition-all">Ver todo</button>
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
                                <button
                                    key={tx.id}
                                    onClick={() => setSelectedTx(tx)}
                                    className="w-full flex items-center justify-between bg-white rounded-2xl p-4 shadow-md border border-gray-50 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg text-left active:scale-[0.98]"
                                >
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
                                </button>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {/* Transaction Detail Modal */}
            {selectedTx && (
                <TransactionDetailModal
                    transaction={selectedTx}
                    creditCards={creditCards}
                    onClose={() => setSelectedTx(null)}
                />
            )}

            {/* Bottom Navigation */}
            <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} />
            <BottomNav />
        </div>
    );
}

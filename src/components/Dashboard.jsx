import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLoans } from '../hooks/useLoans';
import { useDailyInsight } from '../hooks/useDailyInsight';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from './BottomNav';
import PaywallModal from './PaywallModal';
import { formatMoney, formatDate, getCategoryIcon, getCategoryColor } from '../utils/format';
import TransactionDetailModal from './TransactionDetailModal';

export default function Dashboard() {
    const navigate = useNavigate();
    const { currentUser, logout, isProUser, isTrialUser, userData, userStatus, trialDaysLeft } = useAuth();
    const { loans } = useLoans(currentUser?.uid);
    const { insight: dailyInsightText, loading: insightLoading } = useDailyInsight(userData, currentUser);
    const canAccessPremium = isProUser || isTrialUser;

    const [transactions, setTransactions] = useState([]);
    const [balance, setBalance] = useState({ total: 0, income: 0, expense: 0, savings: 0, spendingExpense: 0, available: 0 });
    const [showBalance, setShowBalance] = useState(true);
    const [balanceTab, setBalanceTab] = useState('spending');
    const [selectedTx, setSelectedTx] = useState(null);
    const [creditCards, setCreditCards] = useState([]);
    const [showPaywall, setShowPaywall] = useState(false);

    const daysRemaining = trialDaysLeft !== undefined ? Math.max(0, trialDaysLeft) : 7;



    useEffect(() => {
        if (!currentUser || !db) return;

        const q = query(
            collection(db, 'transactions'),
            where('userId', '==', currentUser.uid),
            orderBy('timestamp', 'desc')
        );

        const SAVINGS_CATEGORIES = ['ahorro', 'ahorro e inversión'];
        const isSavingsCategory = (cat) => SAVINGS_CATEGORIES.includes((cat || '').toLowerCase());

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTransactions(txs);

            let income = 0;
            let expense = 0;
            let savings = 0;
            let spendingExpense = 0;
            txs.forEach(t => {
                if (t.type === 'income') {
                    income += t.amount;
                } else {
                    expense += t.amount;
                    if (isSavingsCategory(t.category)) {
                        savings += t.amount;
                    } else {
                        spendingExpense += t.amount;
                    }
                }
            });

            const available = income - spendingExpense - savings;
            setBalance({ total: income - expense, income, expense, savings, spendingExpense, available });
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
        <div className="flex flex-col min-h-screen bg-[#f7f9f8] dark:bg-slate-900 transition-colors duration-200">
            {/* Header */}
            <header className="px-6 pt-6 pb-4">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-sm text-gray-500 dark:text-slate-400 transition-colors duration-200">Bienvenido de nuevo,</p>
                        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-900 dark:text-indigo-200 transition-colors duration-200">
                            Hola, {userName} 👋
                            {isProUser && !isTrialUser && (
                                <span className="material-symbols-rounded text-amber-500 text-xl" title="Usuario PRO">crown</span>
                            )}
                        </h1>
                        <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70 mt-1 transition-colors duration-200">Construyendo tu libertad financiera</p>
                    </div>
                    <div className="flex items-center gap-2">

                        <button onClick={() => navigate('/profile')} className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center overflow-hidden">
                            {currentUser?.photoURL ? (
                                <img src={currentUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <span className="material-symbols-rounded text-orange-600">person</span>
                            )}
                        </button>
                    </div>
                </div>
            </header>

            {/* Promotional trial banner — no otorga acceso, solo informa */}
            {userStatus === 'TRIAL' && (
                <div className="mx-6 mt-1 flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-2xl px-4 py-3 shadow-md border border-indigo-400/30">
                    <span className="material-symbols-rounded text-xl animate-pulse">auto_awesome</span>
                    <p className="flex-1 text-sm font-medium">
                        🎁 Tienes {daysRemaining} días de prueba PRO restantes. ¡Mejora ahora!
                    </p>
                    <button
                        onClick={() => setShowPaywall(true)}
                        className="bg-white text-indigo-600 text-xs font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-transform whitespace-nowrap"
                    >
                        Ir a PRO
                    </button>
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 space-y-5 pb-40">

                {/* Balance Tabs */}
                <div className="flex p-1 bg-gray-100 dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200/50 dark:border-slate-700">
                    <button
                        onClick={() => setBalanceTab('spending')}
                        className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 ${balanceTab === 'spending'
                                ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm'
                                : 'text-gray-400 dark:text-slate-500 hover:text-gray-600'
                            }`}
                    >
                        <span className="material-symbols-rounded text-lg">account_balance_wallet</span>
                        Para Gastar
                    </button>
                    <button
                        onClick={() => setBalanceTab('savings')}
                        className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 ${balanceTab === 'savings'
                                ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-400 shadow-sm'
                                : 'text-gray-400 dark:text-slate-500 hover:text-gray-600'
                            }`}
                    >
                        <span className="material-symbols-rounded text-lg">savings</span>
                        Mis Ahorros
                    </button>
                </div>

                {/* Balance Cards */}
                <div className="relative">
                    {/* Card: Para Gastar */}
                    <div
                        className={`relative overflow-hidden rounded-3xl p-6 shadow-xl border border-white/10 transition-all duration-500 ease-in-out ${balanceTab === 'spending'
                                ? 'opacity-100 translate-y-0 pointer-events-auto'
                                : 'opacity-0 translate-y-4 pointer-events-none absolute inset-0'
                            } bg-gradient-to-br from-[#0df259] to-emerald-800`}
                    >
                        <div className="absolute -top-16 -right-10 w-40 h-40 bg-white/20 rounded-full blur-3xl" aria-hidden="true"></div>
                        <div className="absolute -bottom-20 -left-16 w-52 h-52 bg-emerald-900/30 rounded-full blur-3xl" aria-hidden="true"></div>
                        <div className="absolute inset-0 bg-white/10 backdrop-blur-[2px]" aria-hidden="true"></div>
                        <div className="relative z-10 flex justify-between items-center mb-1">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-rounded text-white/80 text-lg">account_balance_wallet</span>
                                <p className="text-xs text-white/80 font-semibold tracking-wider uppercase">Disponible para Gastar</p>
                            </div>
                            <button onClick={() => setShowBalance(!showBalance)} className="text-white/90 hover:text-white transition-colors">
                                <span className="material-symbols-rounded text-xl">{showBalance ? 'visibility' : 'visibility_off'}</span>
                            </button>
                        </div>
                        <h2 className="relative z-10 text-4xl font-bold text-white mt-2">
                            {showBalance ? (
                                <>RD$ {formatMoney(balance.available)}<span className="text-xl text-white/70">.00</span></>
                            ) : (
                                'RD$ ••••••'
                            )}
                        </h2>
                        <div className="relative z-10 flex items-center gap-3 mt-3">
                            {balance.income > 0 && (
                                <p className="text-sm text-white/90 inline-flex items-center gap-1 bg-white/15 px-2.5 py-1 rounded-full">
                                    <span className="material-symbols-rounded text-sm">trending_up</span>
                                    Activo
                                </p>
                            )}
                            {balance.savings > 0 && (
                                <p className="text-[11px] text-white/70 inline-flex items-center gap-1 bg-white/10 px-2 py-1 rounded-full">
                                    <span className="material-symbols-rounded text-xs">lock</span>
                                    RD$ {formatMoney(balance.savings)} en ahorro
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Card: Mis Ahorros */}
                    <div
                        className={`relative overflow-hidden rounded-3xl p-6 shadow-xl border border-white/10 transition-all duration-500 ease-in-out ${balanceTab === 'savings'
                                ? 'opacity-100 translate-y-0 pointer-events-auto'
                                : 'opacity-0 translate-y-4 pointer-events-none absolute inset-0'
                            } bg-gradient-to-br from-indigo-500 to-violet-800`}
                    >
                        <div className="absolute -top-16 -right-10 w-40 h-40 bg-white/15 rounded-full blur-3xl" aria-hidden="true"></div>
                        <div className="absolute -bottom-20 -left-16 w-52 h-52 bg-violet-900/40 rounded-full blur-3xl" aria-hidden="true"></div>
                        <div className="absolute inset-0 bg-white/5 backdrop-blur-[2px]" aria-hidden="true"></div>
                        <div className="relative z-10 flex justify-between items-center mb-1">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-rounded text-white/80 text-lg">savings</span>
                                <p className="text-xs text-white/80 font-semibold tracking-wider uppercase">Fondo de Ahorro</p>
                            </div>
                            <button onClick={() => setShowBalance(!showBalance)} className="text-white/90 hover:text-white transition-colors">
                                <span className="material-symbols-rounded text-xl">{showBalance ? 'visibility' : 'visibility_off'}</span>
                            </button>
                        </div>
                        <h2 className="relative z-10 text-4xl font-bold text-white mt-2">
                            {showBalance ? (
                                <>RD$ {formatMoney(balance.savings)}<span className="text-xl text-white/70">.00</span></>
                            ) : (
                                'RD$ ••••••'
                            )}
                        </h2>
                        <div className="relative z-10 flex items-center gap-3 mt-3">
                            <p className="text-sm text-white/90 inline-flex items-center gap-1 bg-white/15 px-2.5 py-1 rounded-full">
                                <span className="material-symbols-rounded text-sm">lock</span>
                                Protegido
                            </p>
                            {balance.available > 0 && (
                                <p className="text-[11px] text-white/70 inline-flex items-center gap-1 bg-white/10 px-2 py-1 rounded-full">
                                    <span className="material-symbols-rounded text-xs">account_balance_wallet</span>
                                    RD$ {formatMoney(balance.available)} disponible
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Insight del día */}
                <div className="flex items-start gap-3 rounded-2xl border border-amber-100 dark:border-amber-900/50 bg-gradient-to-r from-amber-50 via-amber-50 to-emerald-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 p-4 shadow-sm transition-colors duration-200">
                    <div className="w-11 h-11 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center shadow-sm shrink-0 transition-colors duration-200">
                        {insightLoading ? (
                            <span className="material-symbols-rounded animate-spin opacity-50">sync</span>
                        ) : (
                            <span className="material-symbols-rounded">lightbulb</span>
                        )}
                    </div>
                    <div className="flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700/80 dark:text-amber-400/80 transition-colors duration-200">Insight del dia</p>
                        {insightLoading ? (
                            <p className="text-sm text-amber-900/60 dark:text-slate-400 animate-pulse transition-colors duration-200">Analizando tus finanzas...</p>
                        ) : (
                            <p className="text-sm text-amber-900 dark:text-slate-300 transition-colors duration-200">{dailyInsightText || "Un presupuesto es decir a tu dinero a dónde ir en lugar de preguntarte a dónde fue."}</p>
                        )}
                    </div>
                </div>

                {/* Ofertas para ti (Lead Gen Engine) */}
                <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm dark:shadow-indigo-500/20 border border-gray-100 dark:border-slate-700 overflow-hidden relative transition-all duration-300 hover:shadow-md">
                    <div className="absolute top-0 right-0 p-3">
                        <span className="material-symbols-rounded text-primary/20 dark:text-primary/10 text-4xl leading-none">request_quote</span>
                    </div>
                    <h3 className="text-xs font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider mb-2 transition-colors duration-200">Ofertas para ti</h3>
                    <p className="text-sm font-bold text-gray-800 dark:text-indigo-200 mb-1 transition-colors duration-200">{recommendation.title}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-300 mb-4 pr-10 transition-colors duration-200">{recommendation.content}</p>

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
                    <button onClick={() => { navigate('/add'); }} className="bg-white dark:bg-slate-800 rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm dark:shadow-indigo-500/10 border border-gray-100 dark:border-slate-700 active:scale-95 hover:-translate-y-1 hover:shadow-md transition-all duration-300">
                        <div className="w-12 h-12 rounded-full bg-green-50 dark:bg-green-500/10 flex items-center justify-center transition-colors duration-200">
                            <span className="material-symbols-rounded text-primary dark:text-green-400">arrow_upward</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-900 dark:text-indigo-200 transition-colors duration-200">Ingresos</span>
                    </button>
                    <button onClick={() => { navigate('/add'); }} className="bg-white dark:bg-slate-800 rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm dark:shadow-indigo-500/10 border border-gray-100 dark:border-slate-700 active:scale-95 hover:-translate-y-1 hover:shadow-md transition-all duration-300">
                        <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center transition-colors duration-200">
                            <span className="material-symbols-rounded text-red-500 dark:text-red-400">arrow_downward</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-900 dark:text-indigo-200 transition-colors duration-200">Gastos</span>
                    </button>
                </div>

                {/* Financial Tools Grid */}
                <div>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-indigo-200 mb-3 transition-colors duration-200">Herramientas Financieras</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => navigate('/recurring')} className="bg-white dark:bg-slate-800 rounded-2xl p-4 flex items-center gap-3 shadow-sm dark:shadow-indigo-500/10 border border-gray-100 dark:border-slate-700 active:scale-95 hover:-translate-y-1 hover:shadow-md transition-all duration-300 text-left">
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center transition-colors duration-200"><span className="material-symbols-rounded text-indigo-500 dark:text-indigo-400">event_repeat</span></div>
                            <div><p className="text-sm font-bold text-gray-800 dark:text-slate-300 transition-colors duration-200">Recurrentes</p><p className="text-[10px] text-gray-400 dark:text-slate-400 transition-colors duration-200">Calendario</p></div>
                        </button>
                        <button onClick={() => navigate('/budget')} className="bg-white dark:bg-slate-800 rounded-2xl p-4 flex items-center gap-3 shadow-sm dark:shadow-indigo-500/10 border border-gray-100 dark:border-slate-700 active:scale-95 hover:-translate-y-1 hover:shadow-md transition-all duration-300 text-left">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center transition-colors duration-200"><span className="material-symbols-rounded text-emerald-500 dark:text-emerald-400">account_balance</span></div>
                            <div><p className="text-sm font-bold text-gray-800 dark:text-slate-300 transition-colors duration-200">Presupuesto</p><p className="text-[10px] text-gray-400 dark:text-slate-400 transition-colors duration-200">Mensual</p></div>
                        </button>
                        <button onClick={() => canAccessPremium ? navigate('/cards') : setShowPaywall(true)} className={`bg-white dark:bg-slate-800 rounded-2xl p-4 flex items-center gap-3 shadow-sm dark:shadow-indigo-500/10 border border-gray-100 dark:border-slate-700 active:scale-95 hover:-translate-y-1 hover:shadow-md transition-all duration-300 text-left relative ${!canAccessPremium ? 'opacity-70' : ''}`}>
                            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center transition-colors duration-200"><span className="material-symbols-rounded text-purple-500 dark:text-purple-400">credit_card</span></div>
                            <div><p className="text-sm font-bold text-gray-800 dark:text-slate-300 transition-colors duration-200">Tarjetas</p><p className="text-[10px] text-gray-400 dark:text-slate-400 transition-colors duration-200">Crédito</p></div>
                            {!canAccessPremium && <span className="absolute top-2 right-2 material-symbols-rounded text-amber-500 text-sm drop-shadow-md">lock</span>}
                        </button>
                        <button onClick={() => canAccessPremium ? navigate('/advisor') : setShowPaywall(true)} className={`bg-white dark:bg-slate-800 rounded-2xl p-4 flex items-center gap-3 shadow-sm dark:shadow-indigo-500/10 border border-gray-100 dark:border-slate-700 active:scale-95 hover:-translate-y-1 hover:shadow-md transition-all duration-300 text-left relative ${!canAccessPremium ? 'opacity-70' : ''}`}>
                            <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center transition-colors duration-200"><span className="material-symbols-rounded text-violet-500 dark:text-violet-400">auto_awesome</span></div>
                            <div><p className="text-sm font-bold text-gray-800 dark:text-slate-300 transition-colors duration-200">Asesor IA</p><p className="text-[10px] text-gray-400 dark:text-slate-400 transition-colors duration-200">Consejos</p></div>
                            {!canAccessPremium && <span className="absolute top-2 right-2 material-symbols-rounded text-amber-500 text-sm drop-shadow-md">lock</span>}
                        </button>
                        <button onClick={() => canAccessPremium ? navigate('/loans') : setShowPaywall(true)} className={`bg-white dark:bg-slate-800 rounded-2xl p-4 flex items-center gap-3 shadow-sm dark:shadow-indigo-500/10 border border-gray-100 dark:border-slate-700 active:scale-95 hover:-translate-y-1 hover:shadow-md transition-all duration-300 text-left relative ${!canAccessPremium ? 'opacity-70' : ''}`}>
                            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center transition-colors duration-200"><span className="material-symbols-rounded text-amber-500 dark:text-amber-400">account_balance</span></div>
                            <div><p className="text-sm font-bold text-gray-800 dark:text-slate-300 transition-colors duration-200">Préstamos</p><p className="text-[10px] text-gray-400 dark:text-slate-400 transition-colors duration-200">Deudas</p></div>
                            {!canAccessPremium && <span className="absolute top-2 right-2 material-symbols-rounded text-amber-500 text-sm drop-shadow-md">lock</span>}
                        </button>
                        <button onClick={() => canAccessPremium ? navigate('/add') : setShowPaywall(true)} className={`bg-white dark:bg-slate-800 rounded-2xl p-4 flex items-center gap-3 shadow-sm dark:shadow-indigo-500/10 border border-cyan-100 dark:border-slate-700 active:scale-95 hover:-translate-y-1 hover:shadow-md transition-all duration-300 text-left relative ${!canAccessPremium ? 'opacity-70' : ''}`}>
                            <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-500/20 flex items-center justify-center transition-colors duration-200"><span className="material-symbols-rounded text-cyan-500 dark:text-cyan-400">smart_toy</span></div>
                            <div><p className="text-sm font-bold text-gray-800 dark:text-slate-300 transition-colors duration-200">Filtro IA</p><p className="text-[10px] text-gray-400 dark:text-slate-400 transition-colors duration-200">Preventivo</p></div>
                            {!canAccessPremium && <span className="absolute top-2 right-2 material-symbols-rounded text-amber-500 text-sm drop-shadow-md">lock</span>}
                        </button>
                    </div>
                </div>

                {/* Hazte PRO Banner — solo para usuarios free/trial expirado */}
                {!isProUser && (
                    <button
                        onClick={() => setShowPaywall(true)}
                        className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 rounded-2xl p-4 flex items-center gap-4 shadow-md hover:shadow-lg hover:-translate-y-1 active:scale-[0.98] transition-all duration-300 text-left"
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
                        <div className="text-center py-10 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 transition-colors duration-200">
                            <span className="material-symbols-rounded text-4xl text-gray-300 dark:text-slate-600 mb-2">receipt_long</span>
                            <p className="text-gray-400 dark:text-slate-400 text-sm mt-2 transition-colors duration-200">No tienes transacciones aún.</p>
                            <button onClick={() => navigate('/add')} className="mt-4 text-primary dark:text-primary-dark font-medium text-sm hover:-translate-y-0.5 transition-transform inline-block">+ Agregar primera</button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {transactions.slice(0, 5).map((tx, index) => (
                                <button
                                    key={tx.id}
                                    onClick={() => setSelectedTx(tx)}
                                    className="w-full flex items-center justify-between bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm dark:shadow-indigo-500/10 border border-gray-50 dark:border-slate-700 transition-all duration-300 hover:-translate-y-1 hover:shadow-md text-left active:scale-[0.98] animate-fade-in-up"
                                    style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'both' }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${getCategoryColor(tx.category)}`}>
                                            <span className="material-symbols-rounded text-xl">{getCategoryIcon(tx.category)}</span>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-sm dark:text-slate-300">{tx.note || tx.category}</p>
                                            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(tx.timestamp)}</p>
                                        </div>
                                    </div>
                                    <span className={`font-bold text-sm ${tx.type === 'expense' ? 'text-gray-800 dark:text-zinc-100' : 'text-primary dark:text-green-400'}`}>
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

            {/* Paywall overlay — blocks dashboard for EXPIRED users (trial expired) */}
            {userStatus === 'EXPIRED' && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-6">
                    <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
                        <div className="w-16 h-16 mx-auto bg-amber-100 rounded-full flex items-center justify-center mb-4">
                            <span className="material-symbols-rounded text-amber-500 text-3xl">lock</span>
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Suscríbete a PRO</h2>
                        <p className="text-sm text-gray-500 mb-6">
                            Activa tu suscripción para acceder a todas las funciones de Freenanzas.
                        </p>
                        <button
                            onClick={() => setShowPaywall(true)}
                            className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 text-white font-bold py-3.5 rounded-2xl shadow-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-rounded">crown</span>
                            Suscribirme a PRO
                        </button>
                    </div>
                </div>
            )}

            <BottomNav />
        </div>
    );
}

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, doc, setDoc, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useLoans } from '../hooks/useLoans';
import { calcAhorroRecomendado } from '../lib/gemini';
import {
    getMonthlyExpenseTransactions,
    getRecurringBudgetOverview,
    getTransactionMonthKey,
} from '../utils/monthlyBudget';
import BottomNav from './BottomNav';
import PaywallModal from './PaywallModal';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const DEFAULT_CATEGORIES = ['Comida', 'Transporte', 'Servicios', 'Renta', 'Ocio', 'Salud', 'Educación', 'Otros'];
const CURRENT_MONTH_KEY = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const SAVINGS_CATEGORIES = new Set(['ahorro', 'ahorro e inversión']);
const isSavingsTransaction = (transaction) => SAVINGS_CATEGORIES.has((transaction.category || '').toLowerCase());

function getBarColor(pct) {
    if (pct >= 90) return { bar: 'bg-red-500', text: 'text-red-600', label: '¡Cuidado!' };
    if (pct >= 70) return { bar: 'bg-amber-500', text: 'text-amber-600', label: 'Atención' };
    return { bar: 'bg-primary', text: 'text-primary', label: 'Bien' };
}

const getCardBalanceDOP = (card) => card.balanceDOP ?? card.balanceALaFecha ?? card.balance ?? 0;

export default function MonthlyBudget() {
    const navigate = useNavigate();
    const { currentUser, isProUser: isPro } = useAuth();
    const [showPaywall, setShowPaywall] = useState(false);
    const monthKey = CURRENT_MONTH_KEY();
    const appId = import.meta.env.VITE_FIREBASE_APP_ID;

    const [globalLimit, setGlobalLimit] = useState(0);
    const [categoryLimits, setCategoryLimits] = useState({});
    const [transactions, setTransactions] = useState([]);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [tempGlobal, setTempGlobal] = useState('');
    const [tempCats, setTempCats] = useState({});
    const [showResetDialog, setShowResetDialog] = useState(false);
    const [resetAcknowledged, setResetAcknowledged] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [budgetNotice, setBudgetNotice] = useState(null);

    // ─── Loans integration ───
    const { loans, totalCuotasPendientes } = useLoans(currentUser?.uid);

    // ─── Load budget doc ───
    useEffect(() => {
        if (!currentUser || !db) return;
        const budgetRef = doc(db, 'users', currentUser.uid, 'budgets', monthKey);
        const unsub = onSnapshot(budgetRef, snap => {
            if (snap.exists()) {
                const data = snap.data();
                setGlobalLimit(data.globalLimit || 0);
                setCategoryLimits(data.categoryLimits || {});
            } else {
                setGlobalLimit(0);
                setCategoryLimits({});
            }
        });
        return unsub;
    }, [currentUser, monthKey]);

    // ─── Load transactions for current month ───
    useEffect(() => {
        if (!currentUser || !db) return;
        const q = query(collection(db, 'transactions'), where('userId', '==', currentUser.uid));
        const unsub = onSnapshot(q, snap => {
            const txs = getMonthlyExpenseTransactions(
                snap.docs.map(d => ({ id: d.id, ...d.data() })),
                monthKey,
            );
            setTransactions(txs);
        });
        return unsub;
    }, [currentUser, monthKey]);

    const spendingTransactions = useMemo(() => transactions.filter(tx => !isSavingsTransaction(tx)), [transactions]);
    const totalSpent = useMemo(() => spendingTransactions.reduce((s, t) => s + (t.amount || 0), 0), [spendingTransactions]);

    // ─── Income tracking (for savings calc) ───
    const [allTx, setAllTx] = useState([]);
    const [creditCards, setCreditCards] = useState([]);

    useEffect(() => {
        if (!currentUser || !db) return;
        return onSnapshot(query(collection(db, 'transactions'), where('userId', '==', currentUser.uid)), snap => {
            setAllTx(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser || !db || !appId) return;
        return onSnapshot(collection(db, 'users', currentUser.uid, 'creditCards'), snap => {
            setCreditCards(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [currentUser, appId]);

    const monthlyIncome = useMemo(() => {
        const now = new Date();
        return allTx.filter(tx => {
            if (tx.type !== 'income') return false;
            const d = tx.timestamp?.toDate ? tx.timestamp.toDate() : tx.date ? new Date(tx.date) : null;
            return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).reduce((s, t) => s + (t.amount || 0), 0);
    }, [allTx]);

    const [recurring, setRecurring] = useState([]);
    useEffect(() => {
        if (!currentUser || !db) return;
        return onSnapshot(collection(db, 'users', currentUser.uid, 'recurring'), snap => {
            setRecurring(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [currentUser]);

    const recurringOverview = useMemo(
        () => getRecurringBudgetOverview(recurring, monthKey),
        [recurring, monthKey],
    );
    const totalRecurrentesPendientes = recurringOverview.totalPending;

    const totalCardDebt = useMemo(() => creditCards.reduce((s, c) => s + getCardBalanceDOP(c), 0), [creditCards]);
    const credimasDebt = useMemo(() => creditCards.reduce((s, c) => s + (c.credimasTotalAdeudado || 0), 0), [creditCards]);
    const totalDeudaGlobal = totalCardDebt + (loans.reduce((s, l) => s + (l.balancePendiente || 0), 0)) + credimasDebt;
    const ahorroRecomendado = useMemo(() => calcAhorroRecomendado(monthlyIncome, totalDeudaGlobal), [monthlyIncome, totalDeudaGlobal]);
    const disponibleReal = Math.max(globalLimit - totalSpent - totalCuotasPendientes - totalRecurrentesPendientes - ahorroRecomendado, 0);

    const spendingByCategory = useMemo(() => {
        const map = {};
        spendingTransactions.forEach(tx => {
            const cat = tx.category || 'Otros';
            map[cat] = (map[cat] || 0) + (tx.amount || 0);
        });
        return map;
    }, [spendingTransactions]);

    const allCategories = useMemo(() => {
        const set = new Set([...DEFAULT_CATEGORIES, ...Object.keys(categoryLimits), ...Object.keys(spendingByCategory)]);
        return Array.from(set);
    }, [categoryLimits, spendingByCategory]);

    const formatMoney = useCallback((n) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n), []);

    const automaticPayments = useMemo(
        () => transactions.filter((transaction) => transaction.automaticPayment),
        [transactions],
    );
    const totalAutomaticPayments = useMemo(
        () => automaticPayments.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
        [automaticPayments],
    );
    const automaticPaymentsUSD = useMemo(
        () => allTx.filter((transaction) => (
            transaction.type === 'expense'
            && transaction.automaticPayment
            && transaction.currency === 'USD'
            && getTransactionMonthKey(transaction) === monthKey
        )),
        [allTx, monthKey],
    );
    const totalAutomaticPaymentsUSD = useMemo(
        () => automaticPaymentsUSD.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
        [automaticPaymentsUSD],
    );

    const startEditing = () => {
        setTempGlobal(String(globalLimit || ''));
        setTempCats({ ...categoryLimits });
        setEditing(true);
    };

    const handleSave = async () => {
        if (!currentUser || !db) return;
        setSaving(true);
        try {
            const parsed = parseFloat(tempGlobal) || 0;
            const parsedCats = {};
            Object.entries(tempCats).forEach(([k, v]) => { const n = parseFloat(v); if (n > 0) parsedCats[k] = n; });
            await setDoc(doc(db, 'users', currentUser.uid, 'budgets', monthKey), { globalLimit: parsed, categoryLimits: parsedCats, updatedAt: serverTimestamp() });
            setEditing(false);
            setBudgetNotice({ type: 'success', text: 'Presupuesto actualizado correctamente.' });
        } catch {
            setBudgetNotice({ type: 'error', text: 'No pudimos guardar el presupuesto. Inténtalo de nuevo.' });
        } finally {
            setSaving(false);
        }
    };

    const handleResetBudget = async () => {
        if (!currentUser || !db || !resetAcknowledged) return;
        setResetting(true);
        try {
            await setDoc(doc(db, 'users', currentUser.uid, 'budgets', monthKey), {
                globalLimit: 0,
                categoryLimits: {},
                resetAt: serverTimestamp(),
                resetNoticeVersion: 1,
            });
            setEditing(false);
            setShowResetDialog(false);
            setResetAcknowledged(false);
            setBudgetNotice({
                type: 'success',
                text: `Presupuesto de ${MONTH_NAMES[new Date().getMonth()].toLowerCase()} restablecido. Tus movimientos se conservaron.`,
            });
        } catch {
            setBudgetNotice({ type: 'error', text: 'No pudimos restablecer el presupuesto. No se cambió ningún dato.' });
        } finally {
            setResetting(false);
        }
    };

    const globalPct = globalLimit > 0 ? Math.min(Math.round((totalSpent / globalLimit) * 100), 100) : 0;

    const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const now = new Date();

    const generatePDF = () => {
        if (!isPro) {
            setShowPaywall(true);
            return;
        }

        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.text(`Presupuesto Mensual - ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`, 14, 22);

        doc.setFontSize(11);
        doc.text(`Generado el: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, 14, 30);

        let finalY = 35;

        // Block 1: Ingresos
        const currentMonthIncomeTxs = allTx.filter(tx => {
            if (tx.type !== 'income') return false;
            const d = tx.timestamp?.toDate ? tx.timestamp.toDate() : tx.date ? new Date(tx.date) : null;
            return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });

        doc.autoTable({
            startY: finalY,
            head: [['Ingresos', 'Monto']],
            body: [
                ...currentMonthIncomeTxs.map(tx => [tx.note || tx.category || 'Ingreso', `RD$ ${formatMoney(tx.amount)}`]),
                [{ content: 'Total Ingresos', styles: { fontStyle: 'bold' } }, { content: `RD$ ${formatMoney(monthlyIncome)}`, styles: { fontStyle: 'bold' } }]
            ],
            theme: 'grid',
            headStyles: { fillColor: [34, 197, 94] }
        });

        finalY = doc.lastAutoTable.finalY + 10;

        // Block 2: Gastos Realizados
        doc.autoTable({
            startY: finalY,
            head: [['Gastos Realizados', 'Categoría', 'Monto']],
            body: [
                ...transactions.map(tx => [tx.note || 'Gasto', tx.category || 'Otros', `RD$ ${formatMoney(tx.amount)}`]),
                [{ content: 'Total Gastos', colSpan: 2, styles: { fontStyle: 'bold' } }, { content: `RD$ ${formatMoney(totalSpent)}`, styles: { fontStyle: 'bold' } }]
            ],
            theme: 'grid',
            headStyles: { fillColor: [239, 68, 68] }
        });

        finalY = doc.lastAutoTable.finalY + 10;

        // Block 3: Pagos Realizados
        const pagosRealizados = recurring.filter(r => (r.paidMonths || []).includes(monthKey));
        const totalPagosRealizados = pagosRealizados.reduce((s, r) => s + (r.amount || 0), 0);

        doc.autoTable({
            startY: finalY,
            head: [['Pagos Fijos/Recurrentes Realizados', 'Categoría', 'Monto']],
            body: [
                ...pagosRealizados.map(r => [r.name, r.category || 'Otros', `RD$ ${formatMoney(r.amount)}`]),
                [{ content: 'Total Pagos Realizados', colSpan: 2, styles: { fontStyle: 'bold' } }, { content: `RD$ ${formatMoney(totalPagosRealizados)}`, styles: { fontStyle: 'bold' } }]
            ],
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246] }
        });

        finalY = doc.lastAutoTable.finalY + 10;

        // Block 4: Pendientes por Realizar
        const pagosPendientes = recurring.filter(r => {
            const startStr = r.startDate ? r.startDate.substring(0, 7) : null;
            if (startStr && startStr > monthKey) return false;
            return !(r.paidMonths || []).includes(monthKey);
        });

        const totalPagPendientes = pagosPendientes.reduce((s, r) => s + (r.amount || 0), 0) + totalCuotasPendientes;

        const pendingBody = pagosPendientes.map(r => [r.name, r.type === 'credit_card' ? 'Tarjeta de Crédito' : (r.category || 'Otros'), `RD$ ${formatMoney(r.amount)}`]);
        if (totalCuotasPendientes > 0) {
            pendingBody.push(['Cuotas de Préstamos Activos', 'Préstamos', `RD$ ${formatMoney(totalCuotasPendientes)}`]);
        }

        doc.autoTable({
            startY: finalY,
            head: [['Pagos Pendientes por Realizar', 'Tipo/Categoría', 'Monto']],
            body: [
                ...pendingBody,
                [{ content: 'Total Pendientes', colSpan: 2, styles: { fontStyle: 'bold' } }, { content: `RD$ ${formatMoney(totalPagPendientes)}`, styles: { fontStyle: 'bold' } }]
            ],
            theme: 'grid',
            headStyles: { fillColor: [245, 158, 11] }
        });

        doc.save(`Presupuesto_Mensual_${monthKey}.pdf`);
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#f5f7f6]">
            <header className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-[#f5f7f6]/90 backdrop-blur-md px-6 pt-12 pb-4 flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-black/5 active:scale-95 transition-all">
                    <span className="material-symbols-rounded text-2xl text-gray-800">arrow_back_ios_new</span>
                </button>
                <h1 className="text-xl font-bold text-gray-900">Presupuesto Mensual</h1>
                <button onClick={editing ? handleSave : startEditing} className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary/10 hover:bg-primary/20 active:scale-95 transition-all">
                    <span className="material-symbols-rounded text-2xl text-primary">{saving ? 'hourglass_top' : editing ? 'check' : 'edit'}</span>
                </button>
            </header>

            <div className="pt-28 pb-40 px-5 space-y-5">
                {/* Global Budget Card */}
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-[28px] p-6 shadow-lg relative overflow-hidden">
                    <div className="absolute -top-10 -right-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                    <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">{MONTH_NAMES[now.getMonth()]} {now.getFullYear()}</p>
                    {editing ? (
                        <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-2xl font-bold text-white">RD$</span>
                            <input type="number" value={tempGlobal} onChange={e => setTempGlobal(e.target.value)} placeholder="0" className="bg-white/20 text-white placeholder:text-white/40 text-3xl font-extrabold rounded-xl px-3 py-1 w-40 outline-none border-none" />
                        </div>
                    ) : (
                        <>
                            <p className="text-3xl font-extrabold text-white">RD$ {formatMoney(totalSpent)} <span className="text-lg text-white/70">/ {formatMoney(globalLimit)}</span></p>
                            <div className="w-full h-3 bg-white/20 rounded-full mt-3 overflow-hidden">
                                <div className={`h-full rounded-full bg-white transition-all duration-700`} style={{ width: `${globalPct}%` }} />
                            </div>
                            <div className="flex justify-between mt-2">
                                <span className="text-white/80 text-xs font-semibold">{globalPct}% usado</span>
                                <span className="text-white/80 text-xs font-semibold">Restante: RD$ {formatMoney(disponibleReal)}</span>
                            </div>
                        </>
                    )}
                </div>

                {budgetNotice && (
                    <div
                        role="status"
                        className={`rounded-2xl px-4 py-3 flex items-start gap-3 text-sm font-semibold ${budgetNotice.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
                    >
                        <span className="material-symbols-rounded text-xl">
                            {budgetNotice.type === 'success' ? 'check_circle' : 'error'}
                        </span>
                        <span className="flex-1">{budgetNotice.text}</span>
                        <button
                            type="button"
                            onClick={() => setBudgetNotice(null)}
                            aria-label="Cerrar aviso"
                            className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center"
                        >
                            <span className="material-symbols-rounded text-base">close</span>
                        </button>
                    </div>
                )}

                {/* Ahorro Recomendado Card */}
                {monthlyIncome > 0 && (
                    <div className="bg-gradient-to-r from-sky-500 to-cyan-500 rounded-[28px] p-5 shadow-lg relative overflow-hidden">
                        <div className="absolute -top-6 -right-6 w-20 h-20 bg-white/10 rounded-full blur-xl" />
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                                <span className="material-symbols-rounded text-white text-2xl">savings</span>
                            </div>
                            <div className="flex-1">
                                <p className="text-white/80 text-[10px] font-bold uppercase tracking-wider">🎯 Ahorro Recomendado del Mes</p>
                                <p className="text-2xl font-extrabold text-white">RD$ {formatMoney(ahorroRecomendado)}</p>
                            </div>
                        </div>
                        <p className="text-white/70 text-[10px] mt-2">Regla adaptativa: {totalDeudaGlobal > monthlyIncome * 0.4 ? 'Ahorro reducido por nivel de deuda' : 'Basado en la regla 50/30/20'}. Ingreso: RD$ {formatMoney(monthlyIncome)}</p>
                    </div>
                )}

                {automaticPayments.length > 0 && (
                    <section aria-labelledby="automatic-payments-title">
                        <div className="flex items-end justify-between mb-3 px-1">
                            <div>
                                <h3 id="automatic-payments-title" className="text-[17px] font-bold text-gray-900">Pagos registrados automáticamente</h3>
                                <p className="text-[11px] text-gray-400 mt-0.5">Ya están incluidos en el gasto del mes.</p>
                            </div>
                            <span className="text-sm font-extrabold text-emerald-600">RD$ {formatMoney(totalAutomaticPayments)}</span>
                        </div>
                        <div className="bg-white rounded-[24px] p-5 shadow-sm space-y-3">
                            {automaticPayments.map((payment) => (
                                <div key={payment.id} className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-rounded text-emerald-600 text-lg">done_all</span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-sm text-gray-900 truncate">{payment.note || 'Pago realizado'}</p>
                                            <p className="text-[10px] text-gray-400">{payment.category || 'Otros'}</p>
                                        </div>
                                    </div>
                                    <p className="font-extrabold text-sm text-gray-800 shrink-0">RD$ {formatMoney(payment.amount)}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {totalAutomaticPaymentsUSD > 0 && (
                    <div className="bg-cyan-50 rounded-2xl px-4 py-3 flex items-start gap-3">
                        <span className="material-symbols-rounded text-cyan-600">currency_exchange</span>
                        <div>
                            <p className="text-sm font-bold text-cyan-800">Pagos en USD registrados: US$ {formatMoney(totalAutomaticPaymentsUSD)}</p>
                            <p className="text-[11px] text-cyan-700 mt-0.5">Se muestran por separado y no se mezclan con el presupuesto en RD$ sin una tasa de cambio.</p>
                        </div>
                    </div>
                )}

                {recurringOverview.items.length > 0 && (
                    <section aria-labelledby="recurring-budget-title">
                        <div className="mb-3 px-1">
                            <h3 id="recurring-budget-title" className="text-[17px] font-bold text-gray-900">Pagos recurrentes del mes</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5">Comprometido: RD$ {formatMoney(recurringOverview.totalCommitted)} · Pendiente: RD$ {formatMoney(recurringOverview.totalPending)}</p>
                        </div>
                        <div className="bg-white rounded-[24px] p-5 shadow-sm space-y-3">
                            {recurringOverview.items.map((item) => {
                                const statusConfig = item.status === 'paid'
                                    ? { label: 'Pagado', classes: 'bg-emerald-100 text-emerald-700', icon: 'check_circle' }
                                    : item.status === 'partial'
                                        ? { label: 'Parcial', classes: 'bg-sky-100 text-sky-700', icon: 'timelapse' }
                                        : { label: 'Pendiente', classes: 'bg-amber-100 text-amber-700', icon: 'schedule' };
                                return (
                                    <div key={item.id} className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${statusConfig.classes}`}>
                                                <span className="material-symbols-rounded text-lg">{statusConfig.icon}</span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-sm text-gray-900 truncate">{item.name}</p>
                                                <p className="text-[10px] text-gray-400">
                                                    {item.category || 'Otros'}
                                                    {item.startDate ? ` · Día ${Number(item.startDate.slice(8, 10))}` : ''}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="font-extrabold text-sm text-gray-800">RD$ {formatMoney(item.amount)}</p>
                                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${statusConfig.classes}`}>{statusConfig.label}</span>
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Pagado</p>
                                    <p className="text-sm font-extrabold text-emerald-600">RD$ {formatMoney(recurringOverview.totalPaid)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Pendiente</p>
                                    <p className="text-sm font-extrabold text-amber-600">RD$ {formatMoney(recurringOverview.totalPending)}</p>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* Category Budgets */}
                <div>
                    <h3 className="text-[17px] font-bold text-gray-900 mb-3 px-1">Por Categoría</h3>
                    <div className="space-y-3">
                        {allCategories.map(cat => {
                            const limit = categoryLimits[cat] || 0;
                            const spent = spendingByCategory[cat] || 0;
                            const pct = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : (spent > 0 ? 100 : 0);
                            const colors = getBarColor(pct);

                            return (
                                <div key={cat} className="bg-white rounded-[24px] p-5 shadow-sm">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-bold text-gray-900">{cat}</h4>
                                        {editing ? (
                                            <input type="number" value={tempCats[cat] || ''} onChange={e => setTempCats({ ...tempCats, [cat]: e.target.value })} placeholder="Límite" className="w-24 bg-gray-50 text-right rounded-xl px-3 py-1.5 text-sm font-bold outline-none border-none" />
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <span className="font-extrabold text-gray-800">RD$ {formatMoney(spent)}</span>
                                                {limit > 0 && <span className="text-xs text-gray-400">/ {formatMoney(limit)}</span>}
                                            </div>
                                        )}
                                    </div>
                                    {!editing && limit > 0 && (
                                        <>
                                            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${colors.bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
                                            </div>
                                            <div className="flex justify-between mt-1.5">
                                                <span className={`text-[10px] font-bold ${colors.text}`}>{colors.label} · {pct}%</span>
                                                <span className="text-[10px] font-semibold text-gray-400">Resta RD$ {formatMoney(Math.max(limit - spent, 0))}</span>
                                            </div>
                                        </>
                                    )}
                                    {!editing && limit === 0 && spent > 0 && (
                                        <p className="text-[10px] text-gray-400 mt-1">Sin límite asignado</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Préstamos Activos Section */}
                {loans.length > 0 && (
                    <div>
                        <h3 className="text-[17px] font-bold text-gray-900 mb-3 px-1">Préstamos Activos</h3>
                        <div className="bg-white rounded-[24px] p-5 shadow-sm space-y-3">
                            {loans.map(loan => (
                                <div key={loan.id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${loan.pagadoEsteMes ? 'bg-green-100' : 'bg-amber-100'}`}>
                                            <span className={`material-symbols-rounded text-lg ${loan.pagadoEsteMes ? 'text-green-500' : 'text-amber-500'}`}>
                                                {loan.pagadoEsteMes ? 'check_circle' : 'account_balance'}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm text-gray-900">{loan.nombrePrestamo}</p>
                                            <p className="text-[10px] text-gray-400">Día {loan.diaDePago}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-extrabold text-sm ${loan.pagadoEsteMes ? 'text-green-500 line-through' : 'text-gray-800'}`}>RD$ {formatMoney(loan.cuotaMensual)}</p>
                                        <p className="text-[10px] text-gray-400">{loan.pagadoEsteMes ? 'Pagado' : 'Pendiente'}</p>
                                    </div>
                                </div>
                            ))}
                            <div className="border-t border-gray-100 pt-3 flex justify-between">
                                <span className="text-xs font-bold text-gray-500">Total Cuotas Pendientes</span>
                                <span className="text-sm font-extrabold text-amber-600">RD$ {formatMoney(totalCuotasPendientes)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* PDF Download Button */}
                <div className="flex justify-center mt-6">
                    <button onClick={generatePDF} className="flex items-center gap-2 bg-white text-gray-900 border border-gray-200 shadow-sm px-6 py-3.5 rounded-2xl font-bold text-sm hover:bg-gray-50 active:scale-95 transition-all w-full justify-center">
                        <span className="material-symbols-rounded text-red-500">picture_as_pdf</span>
                        Descargar Presupuesto (PDF)
                    </button>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        setResetAcknowledged(false);
                        setShowResetDialog(true);
                    }}
                    className="w-full min-h-12 flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white text-red-600 font-bold text-sm hover:bg-red-50 active:scale-[0.98] transition-all"
                >
                    <span className="material-symbols-rounded">restart_alt</span>
                    Restablecer presupuesto del mes
                </button>
            </div>

            {showResetDialog && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
                    <button
                        type="button"
                        aria-label="Cerrar aviso de restablecimiento"
                        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
                        onClick={() => !resetting && setShowResetDialog(false)}
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="reset-budget-title"
                        aria-describedby="reset-budget-description"
                        className="relative w-full max-w-sm bg-white rounded-[30px] p-6 shadow-2xl"
                    >
                        <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-4">
                            <span className="material-symbols-rounded text-3xl">warning</span>
                        </div>
                        <h2 id="reset-budget-title" className="text-xl font-extrabold text-gray-900">
                            ¿Restablecer el presupuesto de {MONTH_NAMES[now.getMonth()].toLowerCase()}?
                        </h2>
                        <p id="reset-budget-description" className="text-sm text-gray-500 mt-2 leading-relaxed">
                            El límite general y los límites por categoría volverán a RD$ 0. Tus transacciones, pagos recurrentes, pagos realizados, préstamos, tarjetas y presupuestos de otros meses se conservarán.
                        </p>
                        <label className="mt-5 flex items-start gap-3 rounded-2xl bg-red-50 p-4 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={resetAcknowledged}
                                onChange={(event) => setResetAcknowledged(event.target.checked)}
                                disabled={resetting}
                                className="mt-0.5 w-5 h-5 rounded border-red-300 text-red-600 focus:ring-red-500"
                            />
                            <span className="text-sm font-semibold text-red-800">Entiendo que los límites de este mes quedarán en cero.</span>
                        </label>
                        <div className="flex gap-3 mt-6">
                            <button
                                type="button"
                                autoFocus
                                disabled={resetting}
                                onClick={() => setShowResetDialog(false)}
                                className="flex-1 min-h-12 rounded-2xl bg-gray-100 text-gray-700 font-bold disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={!resetAcknowledged || resetting}
                                onClick={handleResetBudget}
                                className="flex-1 min-h-12 rounded-2xl bg-red-600 text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                                {resetting && <span className="material-symbols-rounded animate-spin text-lg">progress_activity</span>}
                                {resetting ? 'Restableciendo…' : `Sí, restablecer ${MONTH_NAMES[now.getMonth()].toLowerCase()}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} />
            <BottomNav />
        </div>
    );
}

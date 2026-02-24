import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from './BottomNav';

const GRADIENTS = [
    'from-slate-700 to-slate-900',
    'from-blue-600 to-indigo-800',
    'from-purple-600 to-pink-700',
    'from-emerald-600 to-teal-800',
    'from-amber-500 to-orange-700',
];

const FREQUENCIES = [
    { id: 'weekly', label: 'Semanal', days: 7 },
    { id: 'biweekly', label: 'Quincenal', days: 14 },
    { id: 'monthly', label: 'Mensual', days: 30 },
];

function monthKey(year, month) {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function currentMonthKey() {
    const d = new Date();
    return monthKey(d.getFullYear(), d.getMonth());
}

function getDueMonthKeys(startDate, frequency, upToYear, upToMonth) {
    const result = new Set();
    const start = new Date(startDate + 'T12:00:00');
    const freq = FREQUENCIES.find(f => f.id === frequency);
    if (!freq) return result;
    const d = new Date(start);
    const limit = new Date(upToYear, upToMonth + 1, 0);
    for (let i = 0; i < 500 && d <= limit; i++) {
        result.add(monthKey(d.getFullYear(), d.getMonth()));
        d.setDate(d.getDate() + freq.days);
    }
    return result;
}

function calcCarryOver(item) {
    if (item.type === 'credit_card') return { count: 0, amount: 0 };
    const now = new Date();
    const curKey = currentMonthKey();
    const start = item.startDate ? new Date(item.startDate + 'T12:00:00') : null;
    if (!start) return { count: 0, amount: 0 };

    const paidSet = new Set(item.paidMonths || []);
    const dueKeys = getDueMonthKeys(item.startDate, item.frequency, now.getFullYear(), now.getMonth());

    let unpaid = 0;
    dueKeys.forEach(mk => {
        if (mk < curKey && !paidSet.has(mk)) unpaid++;
    });

    return { count: unpaid, amount: unpaid * (item.amount || 0) };
}

function getPaymentStatus(item) {
    if (!item.active) return 'inactive';
    const curKey = currentMonthKey();
    const paidSet = new Set(item.paidMonths || []);

    if (paidSet.has(curKey)) return 'paid';

    const now = new Date();
    const startStr = item.startDate || now.toISOString().split('T')[0];
    const freq = item.frequency || 'monthly';
    const dueKeys = getDueMonthKeys(startStr, freq, now.getFullYear(), now.getMonth());

    if (!dueKeys.has(curKey)) {
        const startDate = new Date(startStr + 'T12:00:00');
        if (freq === 'monthly' && startDate <= now) {
            // monthly items are always due
        } else {
            return 'not-due';
        }
    }

    const rawDueDay = item.dueDay !== undefined && item.dueDay !== null ? Number(item.dueDay) : null;
    const dueDay = (rawDueDay && rawDueDay >= 1 && rawDueDay <= 31) ? rawDueDay : 15;
    const todayDay = now.getDate();
    if (todayDay > dueDay) return 'overdue';

    return 'pending';
}

function daysUntil(targetDay) {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), targetDay);
    if (thisMonth > now) return Math.ceil((thisMonth - now) / 86400000);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, targetDay);
    return Math.ceil((nextMonth - now) / 86400000);
}

function formatDate(day) {
    const now = new Date();
    let d = new Date(now.getFullYear(), now.getMonth(), day);
    if (d < now) d = new Date(now.getFullYear(), now.getMonth() + 1, day);
    return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
}

const getCardLimitDOP = (card) => card.limitDOP ?? card.limitePesos ?? card.limit ?? 0;
const getCardBalanceDOP = (card) => card.balanceDOP ?? card.balanceALaFecha ?? card.balance ?? 0;
const getCardMinPaymentDOP = (card) => card.minPaymentDOP ?? card.pagoMinimo ?? card.minPayment ?? 0;
const getCardLimitUSD = (card) => card.limitUSD ?? card.limiteDolares ?? 0;
const getCardBalanceUSD = (card) => card.balanceUSD ?? card.balanceDolaresALaFecha ?? 0;
const getCardMinPaymentUSD = (card) => card.minPaymentUSD ?? card.pagoMinimoUSD ?? 0;

// Avalanche: pay highest interest rate first
function calcAvalanche(cards, extraMonthly) {
    if (!cards.length || cards.every(c => getCardBalanceDOP(c) <= 0)) return { months: 0, totalInterest: 0 };
    const working = cards.filter(c => getCardBalanceDOP(c) > 0)
        .map(c => ({
            ...c,
            remaining: getCardBalanceDOP(c) + (c.credimasTotalAdeudado || 0),
            minPayment: getCardMinPaymentDOP(c),
        }))
        .sort((a, b) => (b.interestRate || 0) - (a.interestRate || 0));
    let months = 0, totalInterest = 0;
    while (working.some(c => c.remaining > 0) && months < 120) {
        months++;
        let extra = extraMonthly;
        working.forEach(c => {
            if (c.remaining <= 0) return;
            const interest = c.remaining * ((c.interestRate || 0) / 100 / 12);
            totalInterest += interest;
            c.remaining += interest;
        });
        working.forEach(c => {
            if (c.remaining <= 0) return;
            const pay = Math.min(c.minPayment || 500, c.remaining);
            c.remaining -= pay;
        });
        for (const c of working) {
            if (c.remaining <= 0 || extra <= 0) continue;
            const pay = Math.min(extra, c.remaining);
            c.remaining -= pay;
            extra -= pay;
        }
    }
    return { months, totalInterest: Math.round(totalInterest) };
}

function calcSnowball(cards, extraMonthly) {
    if (!cards.length || cards.every(c => getCardBalanceDOP(c) <= 0)) return { months: 0, totalInterest: 0 };
    const working = cards.filter(c => getCardBalanceDOP(c) > 0)
        .map(c => ({
            ...c,
            remaining: getCardBalanceDOP(c) + (c.credimasTotalAdeudado || 0),
            minPayment: getCardMinPaymentDOP(c),
        }))
        .sort((a, b) => getCardBalanceDOP(a) - getCardBalanceDOP(b));
    let months = 0, totalInterest = 0;
    while (working.some(c => c.remaining > 0) && months < 120) {
        months++;
        let extra = extraMonthly;
        working.forEach(c => {
            if (c.remaining <= 0) return;
            const interest = c.remaining * ((c.interestRate || 0) / 100 / 12);
            totalInterest += interest;
            c.remaining += interest;
        });
        working.forEach(c => {
            if (c.remaining <= 0) return;
            const pay = Math.min(c.minPayment || 500, c.remaining);
            c.remaining -= pay;
        });
        for (const c of working) {
            if (c.remaining <= 0 || extra <= 0) continue;
            const pay = Math.min(extra, c.remaining);
            c.remaining -= pay;
            extra -= pay;
        }
    }
    return { months, totalInterest: Math.round(totalInterest) };
}

const EMPTY_FORM = {
    name: '', limitePesos: '', limiteDolares: '', balanceALaFecha: '', balanceAlCorte: '',
    balanceDolaresALaFecha: '', balanceDolaresAlCorte: '',
    pagoMinimo: '', pagoMinimoUSD: '', fechaLimitePago: '25', cutoffDay: '15', interestRate: '40',
    credimasLimiteAprobado: '', credimasDisponible: '', credimasTotalAdeudado: '', credimasCuotaMensual: '',
    notificacionesPago: true,
};

export default function CreditCards() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [cards, setCards] = useState([]);
    const [recurring, setRecurring] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editId, setEditId] = useState(null);
    const [extraPayment, setExtraPayment] = useState('2000');
    const [form, setForm] = useState(EMPTY_FORM);
    const [expandedCard, setExpandedCard] = useState(null);
    const [paymentCard, setPaymentCard] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentCurrency, setPaymentCurrency] = useState('DOP');
    const [processingPayment, setProcessingPayment] = useState(false);
    const appId = 'finanzas_boveda_dual_v2';

    useEffect(() => {
        if (!currentUser || !db || !appId) {
            setCards([]);
            setRecurring([]);
            setTransactions([]);
            setExpandedCard(null);
            setShowForm(false);
            setEditId(null);
            setPaymentCard(null);
            setPaymentAmount('');
            setPaymentCurrency('DOP');
            return;
        }
        const unsubCards = onSnapshot(collection(db, 'users', currentUser.uid, 'creditCards'), snap => {
            setCards(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        const unsubRecurring = onSnapshot(collection(db, 'users', currentUser.uid, 'recurring'), snap => {
            setRecurring(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        const unsubTx = onSnapshot(collection(db, 'users', currentUser.uid, 'transactions'), snap => {
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(tx => tx.estado === 'pendiente' || tx.status === 'pendiente'));
        });
        return () => { unsubCards(); unsubRecurring(); unsubTx(); };
    }, [currentUser, appId]);

    const formatMoney = useCallback(n => new Intl.NumberFormat('es-DO').format(n), []);

    const openAdd = () => { setEditId(null); setForm(EMPTY_FORM); setShowForm(true); };
    const openEdit = (card) => {
        setEditId(card.id);
        setForm({
            name: card.name || '', limitePesos: String(card.limitDOP ?? card.limitePesos ?? card.limit ?? ''),
            limiteDolares: String(card.limitUSD ?? card.limiteDolares ?? ''), balanceALaFecha: String(card.balanceDOP ?? card.balanceALaFecha ?? card.balance ?? ''),
            balanceAlCorte: String(card.balanceAlCorte || ''),
            balanceDolaresALaFecha: String(card.balanceUSD ?? card.balanceDolaresALaFecha ?? ''),
            balanceDolaresAlCorte: String(card.balanceDolaresAlCorte || ''),
            pagoMinimo: String(card.minPaymentDOP ?? card.pagoMinimo ?? card.minPayment ?? ''),
            pagoMinimoUSD: String(card.minPaymentUSD ?? card.pagoMinimoUSD ?? ''),
            fechaLimitePago: String(card.fechaLimitePago || card.paymentDueDay || '25'),
            cutoffDay: String(card.cutoffDay || '15'), interestRate: String(card.interestRate || '40'),
            credimasLimiteAprobado: String(card.credimasLimiteAprobado || ''),
            credimasDisponible: String(card.credimasDisponible || ''),
            credimasTotalAdeudado: String(card.credimasTotalAdeudado || ''),
            credimasCuotaMensual: String(card.credimasCuotaMensual || ''),
            notificacionesPago: card.notificacionesPago !== false,
        });
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.name.trim() || !currentUser || !appId) return;
        setSaving(true);
        const limitDOP = parseFloat(form.limitePesos) || 0;
        const limitUSD = parseFloat(form.limiteDolares) || 0;
        const balanceDOP = parseFloat(form.balanceALaFecha) || 0;
        const balanceUSD = parseFloat(form.balanceDolaresALaFecha) || 0;
        const minPaymentDOP = parseFloat(form.pagoMinimo) || 0;
        const minPaymentUSD = parseFloat(form.pagoMinimoUSD) || 0;
        const data = {
            name: form.name.trim(),
            limitDOP,
            balanceDOP,
            minPaymentDOP,
            limitUSD,
            balanceUSD,
            minPaymentUSD,
            limitePesos: limitDOP,
            limiteDolares: limitUSD,
            balanceALaFecha: balanceDOP,
            balanceAlCorte: parseFloat(form.balanceAlCorte) || 0,
            balanceDolaresALaFecha: balanceUSD,
            balanceDolaresAlCorte: parseFloat(form.balanceDolaresAlCorte) || 0,
            pagoMinimo: minPaymentDOP,
            pagoMinimoUSD: minPaymentUSD,
            fechaLimitePago: parseInt(form.fechaLimitePago) || 25,
            cutoffDay: parseInt(form.cutoffDay) || 15,
            interestRate: parseFloat(form.interestRate) || 0,
            // Legacy compat
            limit: limitDOP,
            balance: balanceDOP,
            paymentDueDay: parseInt(form.fechaLimitePago) || 25,
            minPayment: minPaymentDOP,
            // Credimás
            credimasLimiteAprobado: parseFloat(form.credimasLimiteAprobado) || 0,
            credimasDisponible: parseFloat(form.credimasDisponible) || 0,
            credimasTotalAdeudado: parseFloat(form.credimasTotalAdeudado) || 0,
            credimasCuotaMensual: parseFloat(form.credimasCuotaMensual) || 0,
            notificacionesPago: form.notificacionesPago,
        };
        if (editId) {
            await updateDoc(doc(db, 'users', currentUser.uid, 'creditCards', editId), data);
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, 'users', currentUser.uid, 'creditCards'), data);
        }
        setShowForm(false);
        setForm(EMPTY_FORM);
        setEditId(null);
        setSaving(false);
    };

    const handleDelete = async (id) => {
        if (!currentUser || !appId) return;
        await deleteDoc(doc(db, 'users', currentUser.uid, 'creditCards', id));
    };

    const openPayment = (card, currency = 'DOP') => {
        setPaymentCard(card);
        setPaymentCurrency(currency);
        setPaymentAmount('');
    };

    const handlePayment = async () => {
        if (!currentUser || !appId || !paymentCard) return;
        const amount = parseFloat(paymentAmount) || 0;
        if (amount <= 0) return;
        setProcessingPayment(true);
        try {
            const cardRef = doc(db, 'users', currentUser.uid, 'creditCards', paymentCard.id);
            if (paymentCurrency === 'USD') {
                const nextBalanceUSD = Math.max(getCardBalanceUSD(paymentCard) - amount, 0);
                await updateDoc(cardRef, {
                    balanceUSD: nextBalanceUSD,
                    balanceDolaresALaFecha: nextBalanceUSD,
                });
            } else {
                const nextBalanceDOP = Math.max(getCardBalanceDOP(paymentCard) - amount, 0);
                await updateDoc(cardRef, {
                    balanceDOP: nextBalanceDOP,
                    balanceALaFecha: nextBalanceDOP,
                    balance: nextBalanceDOP,
                });
            }
            setPaymentCard(null);
            setPaymentAmount('');
        } catch (error) {
            console.error('Error al registrar el pago', error);
        } finally {
            setProcessingPayment(false);
        }
    };

    const pendingItems = useMemo(() => {
        const items = [];
        const now = new Date();

        recurring.forEach(item => {
            const rName = item.name;
            if (!rName) return;
            const status = getPaymentStatus(item);
            if (status === 'pending' || status === 'overdue') {
                const carryOver = calcCarryOver(item);
                const totalDue = (item.amount || 0) + carryOver.amount;
                if (totalDue > 0) {
                    let dToSet = parseInt(item.dueDay) || 15;
                    const isOverdue = status === 'overdue';
                    const daysLeft = daysUntil(dToSet);
                    items.push({
                        id: item.id,
                        type: 'recurring',
                        sourceItem: item,
                        name: rName,
                        amount: totalDue,
                        originalDueDay: dToSet,
                        daysLeft: isOverdue ? 0 : daysLeft,
                        isOverdue: isOverdue,
                        isNearDue: !isOverdue && daysLeft <= 3,
                        category: item.category || 'Gastos'
                    });
                }
            }
        });

        transactions.forEach(tx => {
            if (tx.estado === 'pendiente' || tx.status === 'pendiente') {
                const txDate = tx.date ? new Date(tx.date) : now;
                const isOverdue = txDate < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                items.push({
                    id: tx.id,
                    type: 'transaction',
                    sourceItem: tx,
                    name: tx.description || tx.category || 'Gasto Pendiente',
                    amount: Number(tx.amount || 0),
                    originalDueDay: txDate.getDate(),
                    daysLeft: isOverdue ? 0 : daysUntil(txDate.getDate()),
                    isOverdue: isOverdue,
                    isNearDue: !isOverdue && (daysUntil(txDate.getDate()) <= 3),
                    category: tx.category || 'Gastos'
                });
            }
        });

        return items.sort((a, b) => {
            if (a.isOverdue && !b.isOverdue) return -1;
            if (!a.isOverdue && b.isOverdue) return 1;
            if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
            return b.amount - a.amount;
        });
    }, [recurring, transactions]);

    const handleMarkAsPaid = async (pItem) => {
        if (!currentUser || !db) return;
        try {
            if (pItem.type === 'recurring') {
                const curKey = currentMonthKey();
                const itemRef = doc(db, 'users', currentUser.uid, 'recurring', pItem.id);
                const paidArr = pItem.sourceItem.paidMonths || [];
                if (!paidArr.includes(curKey)) {
                    await updateDoc(itemRef, { paidMonths: [...paidArr, curKey] });
                }
            } else if (pItem.type === 'transaction') {
                const itemRef = doc(db, 'users', currentUser.uid, 'transactions', pItem.id);
                await updateDoc(itemRef, { estado: 'pagado', status: 'pagado' });
            }
        } catch (e) {
            console.error(e);
        }
    };

    const totalDebt = useMemo(() => cards.reduce((s, c) => s + getCardBalanceDOP(c) + (c.credimasTotalAdeudado || 0), 0), [cards]);
    const totalLimit = useMemo(() => cards.reduce((s, c) => s + getCardLimitDOP(c), 0), [cards]);
    const totalDebtUSD = useMemo(() => cards.reduce((s, c) => s + getCardBalanceUSD(c), 0), [cards]);
    const totalLimitUSD = useMemo(() => cards.reduce((s, c) => s + getCardLimitUSD(c), 0), [cards]);
    const totalCredimas = useMemo(() => cards.reduce((s, c) => s + (c.credimasCuotaMensual || 0), 0), [cards]);
    const avalanche = useMemo(() => calcAvalanche(cards, parseFloat(extraPayment) || 2000), [cards, extraPayment]);
    const snowball = useMemo(() => calcSnowball(cards, parseFloat(extraPayment) || 2000), [cards, extraPayment]);
    const paymentBalance = paymentCard
        ? (paymentCurrency === 'USD' ? getCardBalanceUSD(paymentCard) : getCardBalanceDOP(paymentCard))
        : 0;
    const paymentCurrencyLabel = paymentCurrency === 'USD' ? 'US$' : 'RD$';

    return (
        <div className="flex flex-col min-h-screen bg-[#f5f7f6]">
            <header className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-[#f5f7f6]/90 backdrop-blur-md px-6 pt-12 pb-4 flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-black/5 active:scale-95 transition-all"><span className="material-symbols-rounded text-2xl text-gray-800">arrow_back_ios_new</span></button>
                <h1 className="text-xl font-bold text-gray-900">Tarjetas de Crédito</h1>
                <button onClick={openAdd} className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary/10 hover:bg-primary/20 active:scale-95 transition-all"><span className="material-symbols-rounded text-2xl text-primary">add</span></button>
            </header>

            <div className="pt-28 pb-28 px-5 space-y-5">
                {/* ══════════ SUMMARY ══════════ */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-950 rounded-[28px] p-6 shadow-lg relative overflow-hidden">
                    <div className="absolute -top-8 -right-8 w-28 h-28 bg-white/5 rounded-full blur-2xl" />
                    <p className="text-white/60 text-xs font-bold uppercase tracking-wider">Deuda Total (TC + Credimás)</p>
                    <p className="text-3xl font-extrabold text-white mt-1">RD$ {formatMoney(totalDebt)}</p>
                    <p className="text-white/50 text-xs mt-1">Crédito disponible: RD$ {formatMoney(Math.max(totalLimit - totalDebt, 0))}</p>
                    <div className="flex gap-3 mt-3 flex-wrap">
                        {cards.length > 0 && (
                            <div className="bg-cyan-500/20 rounded-xl px-3 py-2">
                                <p className="text-cyan-300 text-[10px] font-bold uppercase">USD</p>
                                <p className="text-white font-extrabold text-sm">US$ {formatMoney(totalDebtUSD)} <span className="text-white/50 text-[10px]">/ {formatMoney(totalLimitUSD)}</span></p>
                            </div>
                        )}
                        {totalCredimas > 0 && (
                            <div className="bg-white/10 rounded-xl px-3 py-2">
                                <p className="text-white/60 text-[10px] font-bold uppercase">Credimás/Mes</p>
                                <p className="text-white font-extrabold text-sm">RD$ {formatMoney(totalCredimas)}</p>
                            </div>
                        )}
                        <div className="bg-white/10 rounded-xl px-3 py-2">
                            <p className="text-white/60 text-[10px] font-bold uppercase">Tarjetas</p>
                            <p className="text-white font-extrabold text-sm">{cards.length}</p>
                        </div>
                    </div>
                    {totalDebt === 0 && <span className="inline-block mt-2 bg-green-500/20 text-green-300 text-xs font-bold px-3 py-1 rounded-full">🎉 Totalero — Sin deuda</span>}
                </div>

                {/* ══════════ PAGOS PENDIENTES ══════════ */}
                {pendingItems.length > 0 && (
                    <div className="bg-white rounded-[28px] py-4 mb-6">
                        <div className="flex items-center gap-2 mb-6 px-2">
                            <span className="material-symbols-rounded text-orange-500 text-[28px]">schedule</span>
                            <h3 className="text-[18px] font-extrabold text-gray-900">Pagos Pendientes por Realizar</h3>
                        </div>
                        <div className="space-y-4">
                            {pendingItems.map((pItem) => (
                                <div key={pItem.id} className="bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-[24px]">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gray-200 text-gray-700 shrink-0">
                                            <span className="material-symbols-rounded text-[24px]">
                                                receipt_long
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-[15px] font-bold text-gray-900">{pItem.name}</p>
                                            <div className="flex items-center gap-3 mt-1.5">
                                                <span className={`text-[11px] font-extrabold px-3 py-0.5 rounded-full ${pItem.isOverdue ? 'bg-red-100 text-red-600' : pItem.isNearDue ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
                                                    {pItem.isOverdue ? 'Vencido' : pItem.isNearDue ? 'Próximo a vencer' : 'Pendiente'}
                                                </span>
                                                <span className="text-[12px] text-gray-500 font-medium">Día {pItem.originalDueDay}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 sm:mt-0 flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                                        <div>
                                            <p className="text-[16px] font-extrabold text-gray-900">RD$ {formatMoney(pItem.amount)}</p>
                                        </div>
                                        <button onClick={() => handleMarkAsPaid(pItem)} className="w-10 h-10 rounded-full bg-green-100 hover:bg-green-200 flex items-center justify-center transition-colors shrink-0">
                                            <span className="material-symbols-rounded text-[20px] text-green-600 font-bold">check</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ══════════ CARD LIST ══════════ */}
                {cards.length > 0 && (
                    <div className="space-y-4">
                        {cards.map((card, i) => {
                            const bal = getCardBalanceDOP(card);
                            const limPesos = getCardLimitDOP(card);
                            const limDolares = getCardLimitUSD(card);
                            const balCorte = card.balanceAlCorte || 0;
                            const usagePesos = limPesos > 0 ? Math.round((bal / limPesos) * 100) : 0;
                            const balUSD = getCardBalanceUSD(card);
                            const dispDOP = Math.max(limPesos - bal, 0);
                            const dispUSD = Math.max(limDolares - balUSD, 0);
                            const usageUSD = limDolares > 0 ? Math.round((balUSD / limDolares) * 100) : 0;
                            const minPaymentDOP = getCardMinPaymentDOP(card);
                            const minPaymentUSD = getCardMinPaymentUSD(card);
                            const daysPay = daysUntil(card.fechaLimitePago || card.paymentDueDay || 25);
                            const daysCut = daysUntil(card.cutoffDay || 15);
                            const isUrgent = daysPay <= 5 && balCorte > 0;
                            const hasCredimas = (card.credimasLimiteAprobado || 0) > 0;
                            const isExpanded = expandedCard === card.id;

                            return (
                                <div key={card.id} className="space-y-0">
                                    {/* Main Card */}
                                    <div className={`bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]} rounded-[28px] p-6 shadow-lg relative overflow-hidden`}>
                                        <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-white/5 rounded-full blur-xl" />

                                        {/* Header */}
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <p className="text-white/70 text-xs font-bold uppercase tracking-wider">{card.name}</p>
                                                <p className="text-2xl font-extrabold text-white mt-1">RD$ {formatMoney(bal)}</p>
                                                <p className="text-white/50 text-[10px]">Balance a la fecha</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => openPayment(card)} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center active:scale-90 transition-transform">
                                                    <span className="material-symbols-rounded text-white/70 text-lg">payments</span>
                                                </button>
                                                <button onClick={() => openEdit(card)} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center active:scale-90 transition-transform">
                                                    <span className="material-symbols-rounded text-white/70 text-lg">edit</span>
                                                </button>
                                                <span className="material-symbols-rounded text-3xl text-white/30">credit_card</span>
                                            </div>
                                        </div>

                                        <div className="space-y-3 mb-3">
                                            {/* DOP Section */}
                                            <div className="bg-white/10 rounded-xl px-3 py-2.5">
                                                <div className="flex justify-between text-white/60 text-[10px] font-semibold mb-1">
                                                    <span>🇩🇴 DOP</span>
                                                    <span>{usagePesos}% usado</span>
                                                </div>
                                                <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full transition-all duration-700 ${usagePesos > 80 ? 'bg-red-400' : usagePesos > 50 ? 'bg-amber-400' : 'bg-white'}`} style={{ width: `${Math.min(usagePesos, 100)}%` }} />
                                                </div>
                                                <div className="flex justify-between mt-1.5">
                                                    <span className="text-white/50 text-[10px]">Límite: RD$ {formatMoney(limPesos)}</span>
                                                    <span className="text-white/50 text-[10px]">Disp: RD$ {formatMoney(dispDOP)}</span>
                                                </div>
                                            </div>
                                            {/* USD Section */}
                                            <div className="bg-cyan-500/15 rounded-xl px-3 py-2.5">
                                                <div className="flex justify-between text-cyan-200/80 text-[10px] font-semibold mb-1">
                                                    <span>🇺🇸 USD</span>
                                                    <span>{usageUSD}% usado</span>
                                                </div>
                                                <div className="w-full h-2 bg-white/15 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full transition-all duration-700 ${usageUSD > 80 ? 'bg-red-400' : usageUSD > 50 ? 'bg-amber-400' : 'bg-cyan-300'}`} style={{ width: `${Math.min(usageUSD, 100)}%` }} />
                                                </div>
                                                <div className="flex justify-between mt-1.5">
                                                    <span className="text-cyan-200/60 text-[10px]">Límite: US$ {formatMoney(limDolares)}</span>
                                                    <span className="text-cyan-200/60 text-[10px]">Disp: US$ {formatMoney(dispUSD)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Dates & Alerts */}
                                        <div className="flex gap-2 relative">
                                            {isUrgent && card.notificacionesPago !== false && (
                                                <div className="absolute -top-2 -right-2 flex h-4 w-4 z-10">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-slate-900 shadow"></span>
                                                </div>
                                            )}
                                            <div className={`flex-1 rounded-xl px-3 py-2 text-center ${daysCut <= 5 ? 'bg-amber-500/30' : 'bg-white/10'}`}>
                                                <p className="text-white/80 text-[10px] font-bold uppercase">Corte</p>
                                                <p className="text-white text-sm font-extrabold">{daysCut}d</p>
                                                <p className="text-white/60 text-[10px]">{formatDate(card.cutoffDay || 15)}</p>
                                            </div>
                                            <div className={`flex-1 rounded-xl px-3 py-2 text-center ${isUrgent ? 'bg-red-500/40 ring-1 ring-red-400/50' : 'bg-white/10'}`}>
                                                <p className="text-white/80 text-[10px] font-bold uppercase">Pagar antes</p>
                                                <p className="text-white text-sm font-extrabold">{daysPay}d</p>
                                                <p className="text-white/60 text-[10px]">{formatDate(card.fechaLimitePago || card.paymentDueDay || 25)}</p>
                                            </div>
                                            <div className="flex-1 rounded-xl px-3 py-2 text-center bg-white/10">
                                                <p className="text-white/80 text-[10px] font-bold uppercase">Pago mín</p>
                                                <p className="text-white text-sm font-extrabold">RD$ {formatMoney(minPaymentDOP)}</p>
                                                <p className="text-white/60 text-[10px]">US$ {formatMoney(minPaymentUSD)}</p>
                                            </div>
                                        </div>

                                        {/* Balance al Corte Warning */}
                                        {balCorte > 0 && (
                                            <div className={`mt-3 rounded-xl px-3 py-2 ${isUrgent ? 'bg-red-500/30 border border-red-400/30' : 'bg-white/10'}`}>
                                                <p className={`text-xs font-bold leading-snug ${isUrgent ? 'text-red-200' : 'text-amber-300'}`}>
                                                    {isUrgent ? '🚨' : '💡'} Totalero: Paga RD$ {formatMoney(balCorte)} (al corte) antes del {formatDate(card.fechaLimitePago || card.paymentDueDay || 25)}.
                                                </p>
                                            </div>
                                        )}

                                        {/* Expand toggle */}
                                        {hasCredimas && (
                                            <button onClick={() => setExpandedCard(isExpanded ? null : card.id)} className="w-full mt-3 flex items-center justify-center gap-1 text-white/50 text-xs">
                                                <span>{isExpanded ? 'Ocultar Credimás' : 'Ver Credimás'}</span>
                                                <span className={`material-symbols-rounded text-sm transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Credimás Section (expandable) */}
                                    {hasCredimas && isExpanded && (
                                        <div className="bg-gradient-to-r from-cyan-600 to-blue-700 rounded-b-[28px] -mt-4 pt-7 pb-5 px-6 shadow-md">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="material-symbols-rounded text-cyan-200 text-lg">add_card</span>
                                                <p className="text-white font-bold text-sm">Extra Crédito (Credimás)</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="bg-white/15 rounded-xl px-3 py-2">
                                                    <p className="text-white/70 text-[10px] font-bold uppercase">Aprobado</p>
                                                    <p className="text-white font-extrabold text-sm">RD$ {formatMoney(card.credimasLimiteAprobado)}</p>
                                                </div>
                                                <div className="bg-white/15 rounded-xl px-3 py-2">
                                                    <p className="text-white/70 text-[10px] font-bold uppercase">Disponible</p>
                                                    <p className="text-white font-extrabold text-sm">RD$ {formatMoney(card.credimasDisponible || 0)}</p>
                                                </div>
                                                <div className="bg-white/15 rounded-xl px-3 py-2">
                                                    <p className="text-white/70 text-[10px] font-bold uppercase">Adeudado</p>
                                                    <p className="text-white font-extrabold text-sm">RD$ {formatMoney(card.credimasTotalAdeudado || 0)}</p>
                                                </div>
                                                <div className="bg-amber-500/30 rounded-xl px-3 py-2">
                                                    <p className="text-white/70 text-[10px] font-bold uppercase">Cuota/Mes</p>
                                                    <p className="text-white font-extrabold text-sm">RD$ {formatMoney(card.credimasCuotaMensual || 0)}</p>
                                                </div>
                                            </div>
                                            <p className="text-cyan-200/70 text-[10px] mt-2 italic">⚠️ Usa Credimás solo para emergencias reales o bienes duraderos planificados.</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Empty State */}
                {cards.length === 0 && !showForm && (
                    <div className="text-center py-12">
                        <span className="material-symbols-rounded text-6xl text-gray-200">credit_card</span>
                        <p className="text-sm text-gray-400 mt-3">Aún no tienes tarjetas registradas.</p>
                        <button onClick={openAdd} className="mt-3 text-primary font-bold text-sm">+ Agregar tarjeta</button>
                    </div>
                )}

                {/* ══════════ DEBT PAYOFF ══════════ */}
                {totalDebt > 0 && (
                    <div className="bg-white rounded-[28px] p-6 shadow-sm">
                        <h3 className="text-[17px] font-bold text-gray-900 mb-1">Plan para Salir de Deuda</h3>
                        <p className="text-xs text-gray-400 mb-4">Pago extra mensual adicional a los mínimos</p>
                        <div className="flex items-center gap-3 mb-5">
                            <span className="text-sm font-bold text-gray-600">RD$</span>
                            <input type="number" value={extraPayment} onChange={e => setExtraPayment(e.target.value)} className="flex-1 bg-gray-50 rounded-xl px-4 py-2.5 text-sm font-bold outline-none" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4">
                                <p className="text-xs font-bold text-indigo-600 mb-2">⚡ Avalancha</p>
                                <p className="text-sm text-gray-500">Mayor tasa primero</p>
                                <p className="text-2xl font-extrabold text-gray-900 mt-2">{avalanche.months} <span className="text-sm font-semibold text-gray-400">meses</span></p>
                                <p className="text-[10px] text-gray-400 mt-1">Intereses: RD$ {formatMoney(avalanche.totalInterest)}</p>
                            </div>
                            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4">
                                <p className="text-xs font-bold text-emerald-600 mb-2">❄️ Bola de Nieve</p>
                                <p className="text-sm text-gray-500">Menor saldo primero</p>
                                <p className="text-2xl font-extrabold text-gray-900 mt-2">{snowball.months} <span className="text-sm font-semibold text-gray-400">meses</span></p>
                                <p className="text-[10px] text-gray-400 mt-1">Intereses: RD$ {formatMoney(snowball.totalInterest)}</p>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-3 text-center">
                            {avalanche.totalInterest < snowball.totalInterest
                                ? '⚡ Avalancha ahorra más en intereses'
                                : '❄️ Bola de Nieve ofrece victorias rápidas'}
                        </p>
                    </div>
                )}
            </div>

            {/* ══════════ ADD/EDIT FORM MODAL ══════════ */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-end justify-center">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowForm(false); setEditId(null); }} />
                    <div className="relative w-full max-w-md bg-white rounded-t-[32px] p-6 pb-8 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
                        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-5" />
                        <h2 className="text-xl font-extrabold text-gray-900 mb-5">{editId ? 'Editar Tarjeta' : 'Nueva Tarjeta'}</h2>

                        <div className="space-y-4">
                            {/* Name */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Nombre del Plástico</label>
                                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej. Visa Gold, MC Platinum" className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none" />
                            </div>

                            {/* Dual Limits */}
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Límites</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">Pesos (DOP)</label>
                                        <input type="number" value={form.limitePesos} onChange={e => setForm({ ...form, limitePesos: e.target.value })} placeholder="200,000" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">Dólares (USD)</label>
                                        <input type="number" value={form.limiteDolares} onChange={e => setForm({ ...form, limiteDolares: e.target.value })} placeholder="3,500" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                                    </div>
                                </div>
                            </div>

                            {/* Balances DOP */}
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Balances DOP</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">A la Fecha</label>
                                        <input type="number" value={form.balanceALaFecha} onChange={e => setForm({ ...form, balanceALaFecha: e.target.value })} placeholder="0" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">Al Corte</label>
                                        <input type="number" value={form.balanceAlCorte} onChange={e => setForm({ ...form, balanceAlCorte: e.target.value })} placeholder="0" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                                    </div>
                                </div>
                            </div>

                            {/* Balances USD */}
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Balances USD</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">A la Fecha (USD)</label>
                                        <input type="number" value={form.balanceDolaresALaFecha} onChange={e => setForm({ ...form, balanceDolaresALaFecha: e.target.value })} placeholder="0" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">Al Corte (USD)</label>
                                        <input type="number" value={form.balanceDolaresAlCorte} onChange={e => setForm({ ...form, balanceDolaresAlCorte: e.target.value })} placeholder="0" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                                    </div>
                                </div>
                            </div>

                            {/* Minimum Payments */}
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Pagos Mínimos</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">DOP</label>
                                        <input type="number" value={form.pagoMinimo} onChange={e => setForm({ ...form, pagoMinimo: e.target.value })} placeholder="500" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">USD</label>
                                        <input type="number" value={form.pagoMinimoUSD} onChange={e => setForm({ ...form, pagoMinimoUSD: e.target.value })} placeholder="25" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                                    </div>
                                </div>
                            </div>

                            {/* Rate & Cutoff */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] text-gray-400 mb-0.5 block">Tasa %/año</label>
                                    <input type="number" value={form.interestRate} onChange={e => setForm({ ...form, interestRate: e.target.value })} placeholder="40" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-400 mb-0.5 block">Día Corte</label>
                                    <input type="number" value={form.cutoffDay} onChange={e => setForm({ ...form, cutoffDay: e.target.value })} placeholder="15" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                                </div>
                            </div>

                            {/* Payment Due */}
                            <div>
                                <label className="text-[10px] text-gray-400 mb-0.5 block">Día Límite de Pago</label>
                                <input type="number" value={form.fechaLimitePago} onChange={e => setForm({ ...form, fechaLimitePago: e.target.value })} placeholder="25" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                            </div>

                            {/* Alerts Toggle */}
                            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between mt-2">
                                <div>
                                    <p className="text-sm font-bold text-gray-700">Notificaciones de Pago</p>
                                    <p className="text-[10px] text-gray-400">Recibir alertas de vencimiento (5 días antes)</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={form.notificacionesPago} onChange={e => setForm({ ...form, notificacionesPago: e.target.checked })} className="sr-only peer" />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900 border border-gray-100"></div>
                                </label>
                            </div>

                            {/* Credimás Section */}
                            <div className="border-t border-gray-100 pt-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="material-symbols-rounded text-cyan-500 text-lg">add_card</span>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Extra Crédito (Credimás)</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">Límite Aprobado</label>
                                        <input type="number" value={form.credimasLimiteAprobado} onChange={e => setForm({ ...form, credimasLimiteAprobado: e.target.value })} placeholder="0" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">Disponible</label>
                                        <input type="number" value={form.credimasDisponible} onChange={e => setForm({ ...form, credimasDisponible: e.target.value })} placeholder="0" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">Total Adeudado</label>
                                        <input type="number" value={form.credimasTotalAdeudado} onChange={e => setForm({ ...form, credimasTotalAdeudado: e.target.value })} placeholder="0" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 mb-0.5 block">Cuota Mensual</label>
                                        <input type="number" value={form.credimasCuotaMensual} onChange={e => setForm({ ...form, credimasCuotaMensual: e.target.value })} placeholder="0" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-6 space-y-3">
                            <button onClick={handleSave} disabled={saving || !form.name.trim()} className="w-full bg-gradient-to-r from-slate-800 to-slate-950 text-white font-bold py-4 rounded-2xl disabled:opacity-50 active:scale-[0.98] transition-transform">
                                {saving ? 'Guardando...' : editId ? 'Actualizar Tarjeta' : '+ Agregar Tarjeta'}
                            </button>
                            {editId && (
                                <button onClick={() => { handleDelete(editId); setShowForm(false); setEditId(null); }} className="w-full text-red-500 font-bold py-3 rounded-2xl bg-red-50 active:scale-[0.98] transition-transform">
                                    Eliminar Tarjeta
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════ PAYMENT MODAL ══════════ */}
            {paymentCard && (
                <div className="fixed inset-0 z-50 flex items-end justify-center">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPaymentCard(null)} />
                    <div className="relative w-full max-w-md bg-white rounded-t-[32px] p-6 pb-8 animate-in slide-in-from-bottom duration-300">
                        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-5" />
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Pago a</p>
                                <p className="text-lg font-extrabold text-gray-900">{paymentCard.name}</p>
                            </div>
                            <button onClick={() => setPaymentCard(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                <span className="material-symbols-rounded text-gray-400">close</span>
                            </button>
                        </div>

                        <div className="flex bg-gray-100 rounded-2xl p-1 mb-4">
                            <button
                                onClick={() => setPaymentCurrency('DOP')}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${paymentCurrency === 'DOP' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
                            >
                                DOP
                            </button>
                            <button
                                onClick={() => setPaymentCurrency('USD')}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${paymentCurrency === 'USD' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
                            >
                                USD
                            </button>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Monto a abonar</label>
                            <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
                                <span className="text-sm font-bold text-gray-500">{paymentCurrencyLabel}</span>
                                <input
                                    type="number"
                                    value={paymentAmount}
                                    onChange={(e) => setPaymentAmount(e.target.value)}
                                    placeholder="0"
                                    className="flex-1 bg-transparent text-sm font-semibold outline-none"
                                />
                            </div>
                            <p className="text-[10px] text-gray-400">Balance actual: {paymentCurrencyLabel} {formatMoney(paymentBalance)}</p>
                        </div>

                        <button
                            onClick={handlePayment}
                            disabled={processingPayment || !paymentAmount}
                            className="w-full mt-6 bg-gradient-to-r from-slate-800 to-slate-950 text-white font-bold py-4 rounded-2xl disabled:opacity-50 active:scale-[0.98] transition-transform"
                        >
                            {processingPayment ? 'Procesando...' : 'Registrar Pago'}
                        </button>
                    </div>
                </div>
            )}

            <BottomNav />
        </div>
    );
}

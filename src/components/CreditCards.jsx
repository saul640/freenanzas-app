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

// Avalanche: pay highest interest rate first
function calcAvalanche(cards, extraMonthly) {
    if (!cards.length || cards.every(c => (c.balanceALaFecha || c.balance || 0) <= 0)) return { months: 0, totalInterest: 0 };
    const working = cards.filter(c => (c.balanceALaFecha || c.balance || 0) > 0)
        .map(c => ({ ...c, remaining: (c.balanceALaFecha || c.balance || 0) + (c.credimasTotalAdeudado || 0) }))
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
            const pay = Math.min(c.pagoMinimo || 500, c.remaining);
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
    if (!cards.length || cards.every(c => (c.balanceALaFecha || c.balance || 0) <= 0)) return { months: 0, totalInterest: 0 };
    const working = cards.filter(c => (c.balanceALaFecha || c.balance || 0) > 0)
        .map(c => ({ ...c, remaining: (c.balanceALaFecha || c.balance || 0) + (c.credimasTotalAdeudado || 0) }))
        .sort((a, b) => (a.balanceALaFecha || a.balance || 0) - (b.balanceALaFecha || b.balance || 0));
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
            const pay = Math.min(c.pagoMinimo || 500, c.remaining);
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
    pagoMinimo: '', fechaLimitePago: '25', cutoffDay: '15', interestRate: '40',
    credimasLimiteAprobado: '', credimasDisponible: '', credimasTotalAdeudado: '', credimasCuotaMensual: '',
};

export default function CreditCards() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [cards, setCards] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editId, setEditId] = useState(null);
    const [extraPayment, setExtraPayment] = useState('2000');
    const [form, setForm] = useState(EMPTY_FORM);
    const [expandedCard, setExpandedCard] = useState(null);

    useEffect(() => {
        if (!currentUser || !db) return;
        const ref = collection(db, 'users', currentUser.uid, 'creditCards');
        return onSnapshot(ref, snap => {
            setCards(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [currentUser]);

    const formatMoney = useCallback(n => new Intl.NumberFormat('es-DO').format(n), []);

    const openAdd = () => { setEditId(null); setForm(EMPTY_FORM); setShowForm(true); };
    const openEdit = (card) => {
        setEditId(card.id);
        setForm({
            name: card.name || '', limitePesos: String(card.limitePesos || card.limit || ''),
            limiteDolares: String(card.limiteDolares || ''), balanceALaFecha: String(card.balanceALaFecha || card.balance || ''),
            balanceAlCorte: String(card.balanceAlCorte || ''), pagoMinimo: String(card.pagoMinimo || card.minPayment || ''),
            fechaLimitePago: String(card.fechaLimitePago || card.paymentDueDay || '25'),
            cutoffDay: String(card.cutoffDay || '15'), interestRate: String(card.interestRate || '40'),
            credimasLimiteAprobado: String(card.credimasLimiteAprobado || ''),
            credimasDisponible: String(card.credimasDisponible || ''),
            credimasTotalAdeudado: String(card.credimasTotalAdeudado || ''),
            credimasCuotaMensual: String(card.credimasCuotaMensual || ''),
        });
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.name.trim() || !currentUser) return;
        setSaving(true);
        const data = {
            name: form.name.trim(),
            limitePesos: parseFloat(form.limitePesos) || 0,
            limiteDolares: parseFloat(form.limiteDolares) || 0,
            balanceALaFecha: parseFloat(form.balanceALaFecha) || 0,
            balanceAlCorte: parseFloat(form.balanceAlCorte) || 0,
            pagoMinimo: parseFloat(form.pagoMinimo) || 0,
            fechaLimitePago: parseInt(form.fechaLimitePago) || 25,
            cutoffDay: parseInt(form.cutoffDay) || 15,
            interestRate: parseFloat(form.interestRate) || 0,
            // Legacy compat
            limit: parseFloat(form.limitePesos) || 0,
            balance: parseFloat(form.balanceALaFecha) || 0,
            paymentDueDay: parseInt(form.fechaLimitePago) || 25,
            minPayment: parseFloat(form.pagoMinimo) || 0,
            // Credimás
            credimasLimiteAprobado: parseFloat(form.credimasLimiteAprobado) || 0,
            credimasDisponible: parseFloat(form.credimasDisponible) || 0,
            credimasTotalAdeudado: parseFloat(form.credimasTotalAdeudado) || 0,
            credimasCuotaMensual: parseFloat(form.credimasCuotaMensual) || 0,
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
        if (!currentUser) return;
        await deleteDoc(doc(db, 'users', currentUser.uid, 'creditCards', id));
    };

    const totalDebt = useMemo(() => cards.reduce((s, c) => s + (c.balanceALaFecha || c.balance || 0) + (c.credimasTotalAdeudado || 0), 0), [cards]);
    const totalLimit = useMemo(() => cards.reduce((s, c) => s + (c.limitePesos || c.limit || 0), 0), [cards]);
    const totalCredimas = useMemo(() => cards.reduce((s, c) => s + (c.credimasCuotaMensual || 0), 0), [cards]);
    const avalanche = useMemo(() => calcAvalanche(cards, parseFloat(extraPayment) || 2000), [cards, extraPayment]);
    const snowball = useMemo(() => calcSnowball(cards, parseFloat(extraPayment) || 2000), [cards, extraPayment]);

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
                    <div className="flex gap-3 mt-3">
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

                {/* ══════════ CARD LIST ══════════ */}
                {cards.length > 0 && (
                    <div className="space-y-4">
                        {cards.map((card, i) => {
                            const bal = card.balanceALaFecha || card.balance || 0;
                            const limPesos = card.limitePesos || card.limit || 0;
                            const limDolares = card.limiteDolares || 0;
                            const balCorte = card.balanceAlCorte || 0;
                            const usagePesos = limPesos > 0 ? Math.round((bal / limPesos) * 100) : 0;
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
                                                <button onClick={() => openEdit(card)} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center active:scale-90 transition-transform">
                                                    <span className="material-symbols-rounded text-white/70 text-lg">edit</span>
                                                </button>
                                                <span className="material-symbols-rounded text-3xl text-white/30">credit_card</span>
                                            </div>
                                        </div>

                                        {/* Dual Limits */}
                                        <div className="space-y-2 mb-3">
                                            {/* Pesos */}
                                            <div>
                                                <div className="flex justify-between text-white/60 text-[10px] font-semibold mb-1">
                                                    <span>Límite DOP</span>
                                                    <span>{usagePesos}% · RD$ {formatMoney(limPesos)}</span>
                                                </div>
                                                <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full transition-all duration-700 ${usagePesos > 80 ? 'bg-red-400' : usagePesos > 50 ? 'bg-amber-400' : 'bg-white'}`} style={{ width: `${Math.min(usagePesos, 100)}%` }} />
                                                </div>
                                            </div>
                                            {/* Dólares */}
                                            {limDolares > 0 && (
                                                <div>
                                                    <div className="flex justify-between text-white/60 text-[10px] font-semibold mb-1">
                                                        <span>Límite USD</span>
                                                        <span>US$ {formatMoney(limDolares)}</span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                        <div className="h-full rounded-full bg-cyan-300/60" style={{ width: '0%' }} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Dates & Alerts */}
                                        <div className="flex gap-2">
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
                                                <p className="text-white text-sm font-extrabold">RD$ {formatMoney(card.pagoMinimo || card.minPayment || 0)}</p>
                                            </div>
                                        </div>

                                        {/* Balance al Corte Warning */}
                                        {balCorte > 0 && (
                                            <div className={`mt-3 rounded-xl px-3 py-2 ${isUrgent ? 'bg-red-500/30 border border-red-400/30' : 'bg-white/10'}`}>
                                                <p className={`text-xs font-bold ${isUrgent ? 'text-red-200' : 'text-amber-300'}`}>
                                                    {isUrgent ? '🚨' : '💡'} Totalero: Paga RD$ {formatMoney(balCorte)} (balance al corte) antes del {formatDate(card.fechaLimitePago || card.paymentDueDay || 25)} para evitar intereses.
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

                            {/* Balances */}
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Balances</p>
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

                            {/* Payment & Rate */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="text-[10px] text-gray-400 mb-0.5 block">Pago Mín.</label>
                                    <input type="number" value={form.pagoMinimo} onChange={e => setForm({ ...form, pagoMinimo: e.target.value })} placeholder="500" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium outline-none" />
                                </div>
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

            <BottomNav />
        </div>
    );
}

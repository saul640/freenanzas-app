import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
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
    if (!cards.length || cards.every(c => c.balance <= 0)) return { months: 0, totalInterest: 0, steps: [] };
    const working = cards.filter(c => c.balance > 0).map(c => ({ ...c, remaining: c.balance })).sort((a, b) => b.interestRate - a.interestRate);
    let months = 0, totalInterest = 0;
    const steps = [];
    while (working.some(c => c.remaining > 0) && months < 120) {
        months++;
        let extra = extraMonthly;
        working.forEach(c => {
            if (c.remaining <= 0) return;
            const interest = c.remaining * (c.interestRate / 100 / 12);
            totalInterest += interest;
            c.remaining += interest;
        });
        // Pay minimums
        working.forEach(c => {
            if (c.remaining <= 0) return;
            const pay = Math.min(c.minPayment || 500, c.remaining);
            c.remaining -= pay;
        });
        // Extra to highest rate
        for (const c of working) {
            if (c.remaining <= 0 || extra <= 0) continue;
            const pay = Math.min(extra, c.remaining);
            c.remaining -= pay;
            extra -= pay;
        }
        if (months % 3 === 0 || months <= 3) {
            steps.push({ month: months, total: working.reduce((s, c) => s + Math.max(c.remaining, 0), 0) });
        }
    }
    return { months, totalInterest: Math.round(totalInterest), steps };
}

// Snowball: pay smallest balance first
function calcSnowball(cards, extraMonthly) {
    if (!cards.length || cards.every(c => c.balance <= 0)) return { months: 0, totalInterest: 0, steps: [] };
    const working = cards.filter(c => c.balance > 0).map(c => ({ ...c, remaining: c.balance })).sort((a, b) => a.balance - b.balance);
    let months = 0, totalInterest = 0;
    const steps = [];
    while (working.some(c => c.remaining > 0) && months < 120) {
        months++;
        let extra = extraMonthly;
        working.forEach(c => {
            if (c.remaining <= 0) return;
            const interest = c.remaining * (c.interestRate / 100 / 12);
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
        if (months % 3 === 0 || months <= 3) {
            steps.push({ month: months, total: working.reduce((s, c) => s + Math.max(c.remaining, 0), 0) });
        }
    }
    return { months, totalInterest: Math.round(totalInterest), steps };
}

export default function CreditCards() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [cards, setCards] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [extraPayment, setExtraPayment] = useState('2000');
    const [form, setForm] = useState({ name: '', limit: '', balance: '', cutoffDay: '15', paymentDueDay: '25', interestRate: '40', minPayment: '500' });

    useEffect(() => {
        if (!currentUser || !db) return;
        const ref = collection(db, 'users', currentUser.uid, 'creditCards');
        const unsub = onSnapshot(ref, snap => {
            setCards(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, [currentUser]);

    const formatMoney = useCallback(n => new Intl.NumberFormat('es-DO').format(n), []);

    const handleSave = async () => {
        if (!form.name.trim() || !form.limit || !currentUser) return;
        setSaving(true);
        await addDoc(collection(db, 'users', currentUser.uid, 'creditCards'), {
            name: form.name.trim(),
            limit: parseFloat(form.limit) || 0,
            balance: parseFloat(form.balance) || 0,
            cutoffDay: parseInt(form.cutoffDay) || 15,
            paymentDueDay: parseInt(form.paymentDueDay) || 25,
            interestRate: parseFloat(form.interestRate) || 0,
            minPayment: parseFloat(form.minPayment) || 500,
            createdAt: serverTimestamp(),
        });
        setShowForm(false);
        setForm({ name: '', limit: '', balance: '', cutoffDay: '15', paymentDueDay: '25', interestRate: '40', minPayment: '500' });
        setSaving(false);
    };

    const totalDebt = useMemo(() => cards.reduce((s, c) => s + (c.balance || 0), 0), [cards]);
    const totalLimit = useMemo(() => cards.reduce((s, c) => s + (c.limit || 0), 0), [cards]);
    const avalanche = useMemo(() => calcAvalanche(cards, parseFloat(extraPayment) || 2000), [cards, extraPayment]);
    const snowball = useMemo(() => calcSnowball(cards, parseFloat(extraPayment) || 2000), [cards, extraPayment]);

    return (
        <div className="flex flex-col min-h-screen bg-[#f5f7f6]">
            <header className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-[#f5f7f6]/90 backdrop-blur-md px-6 pt-12 pb-4 flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-black/5 active:scale-95 transition-all"><span className="material-symbols-rounded text-2xl text-gray-800">arrow_back_ios_new</span></button>
                <h1 className="text-xl font-bold text-gray-900">Tarjetas de Crédito</h1>
                <button onClick={() => setShowForm(!showForm)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary/10 hover:bg-primary/20 active:scale-95 transition-all"><span className="material-symbols-rounded text-2xl text-primary">{showForm ? 'close' : 'add'}</span></button>
            </header>

            <div className="pt-28 pb-28 px-5 space-y-5">
                {/* Summary */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-950 rounded-[28px] p-6 shadow-lg relative overflow-hidden">
                    <div className="absolute -top-8 -right-8 w-28 h-28 bg-white/5 rounded-full blur-2xl" />
                    <p className="text-white/60 text-xs font-bold uppercase tracking-wider">Deuda Total</p>
                    <p className="text-3xl font-extrabold text-white mt-1">RD$ {formatMoney(totalDebt)}</p>
                    <p className="text-white/50 text-xs mt-1">Crédito disponible: RD$ {formatMoney(Math.max(totalLimit - totalDebt, 0))}</p>
                    {totalDebt === 0 && <span className="inline-block mt-2 bg-green-500/20 text-green-300 text-xs font-bold px-3 py-1 rounded-full">🎉 Totalero — Sin deuda</span>}
                </div>

                {/* Add Form */}
                {showForm && (
                    <div className="bg-white rounded-[28px] p-5 shadow-sm space-y-3 animate-in slide-in-from-top duration-300">
                        <h3 className="font-bold text-gray-900">Nueva Tarjeta</h3>
                        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre (ej. Visa Gold)" className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none" />
                        <div className="grid grid-cols-2 gap-3">
                            <input type="number" value={form.limit} onChange={e => setForm({ ...form, limit: e.target.value })} placeholder="Límite" className="bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none" />
                            <input type="number" value={form.balance} onChange={e => setForm({ ...form, balance: e.target.value })} placeholder="Saldo actual" className="bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <input type="number" value={form.cutoffDay} onChange={e => setForm({ ...form, cutoffDay: e.target.value })} placeholder="Día corte" className="bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none" />
                            <input type="number" value={form.paymentDueDay} onChange={e => setForm({ ...form, paymentDueDay: e.target.value })} placeholder="Día pago" className="bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <input type="number" value={form.interestRate} onChange={e => setForm({ ...form, interestRate: e.target.value })} placeholder="Tasa %/año" className="bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none" />
                            <input type="number" value={form.minPayment} onChange={e => setForm({ ...form, minPayment: e.target.value })} placeholder="Pago mínimo" className="bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none" />
                        </div>
                        <button onClick={handleSave} disabled={saving || !form.name.trim()} className="w-full bg-primary text-black font-bold py-3.5 rounded-2xl disabled:opacity-50 active:scale-[0.98] transition-transform">{saving ? 'Guardando...' : 'Guardar Tarjeta'}</button>
                    </div>
                )}

                {/* Card List */}
                {cards.length > 0 && (
                    <div className="space-y-4">
                        {cards.map((card, i) => {
                            const usage = card.limit > 0 ? Math.round((card.balance / card.limit) * 100) : 0;
                            const daysCut = daysUntil(card.cutoffDay);
                            const daysPay = daysUntil(card.paymentDueDay);
                            return (
                                <div key={card.id} className={`bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]} rounded-[28px] p-6 shadow-lg relative overflow-hidden`}>
                                    <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-white/5 rounded-full blur-xl" />
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <p className="text-white/70 text-xs font-bold uppercase tracking-wider">{card.name}</p>
                                            <p className="text-2xl font-extrabold text-white mt-1">RD$ {formatMoney(card.balance)}</p>
                                        </div>
                                        <span className="material-symbols-rounded text-3xl text-white/30">credit_card</span>
                                    </div>

                                    {/* Usage bar */}
                                    <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden mb-3">
                                        <div className={`h-full rounded-full transition-all duration-700 ${usage > 80 ? 'bg-red-400' : usage > 50 ? 'bg-amber-400' : 'bg-white'}`} style={{ width: `${Math.min(usage, 100)}%` }} />
                                    </div>

                                    <div className="flex justify-between text-white/70 text-xs font-semibold">
                                        <span>{usage}% usado de RD$ {formatMoney(card.limit)}</span>
                                        <span>Tasa: {card.interestRate}%</span>
                                    </div>

                                    {/* Alerts */}
                                    <div className="flex gap-2 mt-4">
                                        <div className={`flex-1 rounded-xl px-3 py-2 text-center ${daysCut <= 5 ? 'bg-red-500/30' : 'bg-white/10'}`}>
                                            <p className="text-white/80 text-[10px] font-bold uppercase">Corte</p>
                                            <p className="text-white text-sm font-extrabold">{daysCut} días</p>
                                            <p className="text-white/60 text-[10px]">{formatDate(card.cutoffDay)}</p>
                                        </div>
                                        <div className={`flex-1 rounded-xl px-3 py-2 text-center ${daysPay <= 5 ? 'bg-red-500/30' : 'bg-white/10'}`}>
                                            <p className="text-white/80 text-[10px] font-bold uppercase">Pagar antes</p>
                                            <p className="text-white text-sm font-extrabold">{daysPay} días</p>
                                            <p className="text-white/60 text-[10px]">{formatDate(card.paymentDueDay)}</p>
                                        </div>
                                        <div className="flex-1 rounded-xl px-3 py-2 text-center bg-white/10">
                                            <p className="text-white/80 text-[10px] font-bold uppercase">Pago mín</p>
                                            <p className="text-white text-sm font-extrabold">RD$ {formatMoney(card.minPayment || 0)}</p>
                                        </div>
                                    </div>

                                    {card.balance > 0 && (
                                        <div className="mt-3 bg-white/10 rounded-xl px-3 py-2">
                                            <p className="text-amber-300 text-xs font-bold">💡 Totalero: Paga RD$ {formatMoney(card.balance)} antes del {formatDate(card.paymentDueDay)} para evitar intereses.</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {cards.length === 0 && !showForm && (
                    <div className="text-center py-12">
                        <span className="material-symbols-rounded text-6xl text-gray-200">credit_card</span>
                        <p className="text-sm text-gray-400 mt-3">Aún no tienes tarjetas registradas.</p>
                    </div>
                )}

                {/* Debt Payoff Plan */}
                {totalDebt > 0 && (
                    <div className="bg-white rounded-[28px] p-6 shadow-sm">
                        <h3 className="text-[17px] font-bold text-gray-900 mb-1">Plan para Salir de Deuda</h3>
                        <p className="text-xs text-gray-400 mb-4">Pago extra mensual adicional a los mínimos</p>

                        <div className="flex items-center gap-3 mb-5">
                            <span className="text-sm font-bold text-gray-600">RD$</span>
                            <input type="number" value={extraPayment} onChange={e => setExtraPayment(e.target.value)} className="flex-1 bg-gray-50 rounded-xl px-4 py-2.5 text-sm font-bold outline-none" />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {/* Avalanche */}
                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4">
                                <p className="text-xs font-bold text-indigo-600 mb-2">⚡ Avalancha</p>
                                <p className="text-sm text-gray-500">Mayor tasa primero</p>
                                <p className="text-2xl font-extrabold text-gray-900 mt-2">{avalanche.months} <span className="text-sm font-semibold text-gray-400">meses</span></p>
                                <p className="text-[10px] text-gray-400 mt-1">Intereses: RD$ {formatMoney(avalanche.totalInterest)}</p>
                            </div>
                            {/* Snowball */}
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
            <BottomNav />
        </div>
    );
}

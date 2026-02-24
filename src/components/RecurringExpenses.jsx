import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, addDoc, onSnapshot, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from './BottomNav';

const FREQUENCIES = [
    { id: 'weekly', label: 'Semanal', days: 7 },
    { id: 'biweekly', label: 'Quincenal', days: 14 },
    { id: 'monthly', label: 'Mensual', days: 30 },
];

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function getUserTimezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'America/Santo_Domingo'; }
}

/** Generate a month key like "2026-02" */
function monthKey(year, month) {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** Get current month key */
function currentMonthKey() {
    const d = new Date();
    return monthKey(d.getFullYear(), d.getMonth());
}

/**
 * Get all due month keys for a recurring item from its start date until a target month.
 * This handles weekly/biweekly/monthly frequencies properly.
 */
function getDueMonthKeys(startDate, frequency, upToYear, upToMonth) {
    const result = new Set();
    const start = new Date(startDate + 'T12:00:00');
    const freq = FREQUENCIES.find(f => f.id === frequency);
    if (!freq) return result;
    const d = new Date(start);
    const limit = new Date(upToYear, upToMonth + 1, 0); // last day of target month
    for (let i = 0; i < 500 && d <= limit; i++) {
        result.add(monthKey(d.getFullYear(), d.getMonth()));
        d.setDate(d.getDate() + freq.days);
    }
    return result;
}

/**
 * Calculate the carry-over (unpaid months count) for a recurring item.
 * Checks all months from startDate up to (but NOT including) the current month.
 * Any past month that is NOT in paidMonths is considered "unpaid" and carries over.
 */
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
        // Only count PAST months, not the current month
        if (mk < curKey && !paidSet.has(mk)) unpaid++;
    });

    return { count: unpaid, amount: unpaid * (item.amount || 0) };
}

/**
 * Determine the payment status for a recurring item in the CURRENT month
 * Returns: 'paid' | 'pending' | 'overdue'
 */
function getPaymentStatus(item) {
    if (!item.active) return 'inactive';
    const curKey = currentMonthKey();
    const paidSet = new Set(item.paidMonths || []);

    if (paidSet.has(curKey)) return 'paid';

    // Check if item is due this month
    const now = new Date();
    const startStr = item.startDate || now.toISOString().split('T')[0];
    const freq = item.frequency || 'monthly';
    const dueKeys = getDueMonthKeys(startStr, freq, now.getFullYear(), now.getMonth());

    // For monthly items, always consider them due every month after start
    if (!dueKeys.has(curKey)) {
        // Fallback: if item is monthly and start month <= current month, consider it due
        const startDate = new Date(startStr + 'T12:00:00');
        if (freq === 'monthly' && startDate <= now) {
            // monthly items are always due
        } else {
            return 'not-due';
        }
    }

    // Due this month but not paid — check if overdue
    const rawDueDay = item.dueDay !== undefined && item.dueDay !== null ? Number(item.dueDay) : null;
    const dueDay = (rawDueDay && rawDueDay >= 1 && rawDueDay <= 31) ? rawDueDay : 15;
    const todayDay = now.getDate();
    if (todayDay > dueDay) return 'overdue';

    return 'pending';
}

function getMonthDays(year, month) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    return { startDay: first.getDay(), totalDays: last.getDate() };
}

// ─── Status styling helpers ───
const STATUS_CONFIG = {
    paid: { label: 'Pagado', bg: 'bg-green-100', text: 'text-green-700', icon: 'check_circle', dot: 'bg-green-500' },
    pending: { label: 'Pendiente', bg: 'bg-amber-100', text: 'text-amber-700', icon: 'schedule', dot: 'bg-amber-500' },
    overdue: { label: 'Vencido', bg: 'bg-red-100', text: 'text-red-700', icon: 'error', dot: 'bg-red-500' },
    inactive: { label: 'Pausado', bg: 'bg-gray-100', text: 'text-gray-400', icon: 'pause_circle', dot: 'bg-gray-400' },
    'not-due': { label: 'No aplica', bg: 'bg-gray-50', text: 'text-gray-400', icon: 'remove_circle', dot: 'bg-gray-300' },
};

export default function RecurringExpenses() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [recurring, setRecurring] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', amount: '', category: 'Servicios', frequency: 'monthly', startDate: new Date().toISOString().split('T')[0], dueDay: '15' });
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const today = new Date();
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [viewYear, setViewYear] = useState(today.getFullYear());

    const [creditCards, setCreditCards] = useState([]);

    // ─── Listen to recurring items ───
    useEffect(() => {
        if (!currentUser || !db) return;
        const ref = collection(db, 'users', currentUser.uid, 'recurring');
        const unsub = onSnapshot(ref, snap => {
            setRecurring(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.name));
        });
        return unsub;
    }, [currentUser]);

    // ─── Listen to credit cards ───
    useEffect(() => {
        if (!currentUser || !db) return;
        return onSnapshot(collection(db, 'users', currentUser.uid, 'creditCards'), snap => {
            setCreditCards(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [currentUser]);

    // ─── Auto-generate Credit Card Recurring Payments ───
    useEffect(() => {
        if (!currentUser || !db || creditCards.length === 0) return;

        const curMonth = currentMonthKey();
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');

        creditCards.forEach(card => {
            const existing = recurring.find(r => r.type === 'credit_card' && r.cardId === card.id);
            const fallbackAmount = Number(card.pagoMinimoDOP || card.pagoMinimo || card.balanceDOP || card.balanceALaFecha || 0);

            if (!existing) {
                const dueDay = parseInt(card.fechaLimitePago || 15) || 15;
                addDoc(collection(db, 'users', currentUser.uid, 'recurring'), {
                    type: 'credit_card',
                    cardId: card.id,
                    name: `TC ${card.name || 'Tarjeta'}`,
                    amount: fallbackAmount,
                    category: 'Tarjetas',
                    frequency: 'monthly',
                    startDate: `${year}-${month}-${String(dueDay).padStart(2, '0')}`,
                    dueDay: dueDay,
                    active: true,
                    paidMonths: [],
                    lastAutoMonth: curMonth,
                    createdAt: serverTimestamp(),
                    timezone: getUserTimezone(),
                }).catch(console.error);
            } else {
                // Auto update amount for a new month if it hasn't been paid yet
                if (existing.lastAutoMonth !== curMonth && !(existing.paidMonths || []).includes(curMonth)) {
                    updateDoc(doc(db, 'users', currentUser.uid, 'recurring', existing.id), {
                        amount: fallbackAmount,
                        lastAutoMonth: curMonth
                    }).catch(console.error);
                }
            }
        });
    }, [creditCards, recurring, currentUser]);

    // ─── Calculate enriched items with status and carry-over (memoized) ───
    const enrichedItems = useMemo(() => {
        return recurring.map(item => {
            const status = getPaymentStatus(item);
            const carryOver = calcCarryOver(item);
            const totalDue = (item.amount || 0) + carryOver.amount;
            return { ...item, status, carryOver, totalDue };
        });
    }, [recurring]);

    // ─── Calendar dots with overdue coloring ───
    const calendarDots = useMemo(() => {
        const dots = {};
        const { totalDays } = getMonthDays(viewYear, viewMonth);
        enrichedItems.forEach(r => {
            if (!r.active) return;
            const start = r.startDate ? new Date(r.startDate + 'T12:00:00') : new Date();
            const freq = FREQUENCIES.find(f => f.id === r.frequency);
            if (!freq) return;
            const d = new Date(start);
            for (let i = 0; i < 200; i++) {
                if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
                    const day = d.getDate();
                    if (day >= 1 && day <= totalDays) {
                        if (!dots[day]) dots[day] = [];
                        dots[day].push({ name: r.name, amount: r.amount, status: r.status, category: r.category });
                    }
                }
                if (d.getFullYear() > viewYear || (d.getFullYear() === viewYear && d.getMonth() > viewMonth)) break;
                d.setDate(d.getDate() + freq.days);
            }
        });
        return dots;
    }, [enrichedItems, viewMonth, viewYear]);

    const { startDay, totalDays } = getMonthDays(viewYear, viewMonth);

    const formatMoney = useCallback(n => new Intl.NumberFormat('es-DO').format(n), []);

    const resetForm = () => {
        setFormData({ name: '', amount: '', category: 'Servicios', frequency: 'monthly', startDate: new Date().toISOString().split('T')[0], dueDay: '15' });
        setEditingItem(null);
        setShowForm(false);
    };

    // ─── Open edit mode ───
    const startEdit = (item) => {
        setEditingItem(item);
        setFormData({
            name: item.name || '',
            amount: String(item.amount || ''),
            category: item.category || 'Servicios',
            frequency: item.frequency || 'monthly',
            startDate: item.startDate || new Date().toISOString().split('T')[0],
            dueDay: String(item.dueDay || '15'),
        });
        setShowForm(true);
    };

    // ─── Save (create or update) ───
    const handleSave = async () => {
        if (!formData.name.trim() || !formData.amount || !currentUser) return;
        setSaving(true);
        try {
            const payload = {
                name: formData.name.trim(),
                amount: parseFloat(formData.amount),
                category: formData.category,
                frequency: formData.frequency,
                startDate: formData.startDate,
                dueDay: parseInt(formData.dueDay) || 15,
                timezone: getUserTimezone(),
            };

            if (editingItem) {
                await updateDoc(doc(db, 'users', currentUser.uid, 'recurring', editingItem.id), payload);
            } else {
                await addDoc(collection(db, 'users', currentUser.uid, 'recurring'), {
                    ...payload,
                    active: true,
                    paidMonths: [],
                    createdAt: serverTimestamp(),
                });
            }
            resetForm();
        } catch (e) { /* intentionally empty */ }
        setSaving(false);
    };

    // ─── Delete recurring ───
    const handleDelete = async (itemId) => {
        if (!currentUser || !db) return;
        await deleteDoc(doc(db, 'users', currentUser.uid, 'recurring', itemId));
        setConfirmDelete(null);
    };

    // ─── Toggle active/paused ───
    const toggleActive = async (item) => {
        if (!currentUser || !db) return;
        await updateDoc(doc(db, 'users', currentUser.uid, 'recurring', item.id), { active: !item.active });
    };
    // ─── Mark as paid/unpaid for current month ───
    const togglePaid = async (item) => {
        if (!currentUser || !db) return;
        const curKey = currentMonthKey();
        const paidMonths = [...(item.paidMonths || [])];
        const isPaying = !paidMonths.includes(curKey);

        if (!isPaying) {
            // Unmark paid
            const idx = paidMonths.indexOf(curKey);
            paidMonths.splice(idx, 1);

            // Revert credit card payment is not implemented here to avoid complexity
        } else {
            // Mark paid
            paidMonths.push(curKey);

            // Deduct from Credit Card active balance
            if (item.type === 'credit_card' && item.cardId) {
                const card = creditCards.find(c => c.id === item.cardId);
                if (card) {
                    const currentBalance = Number(card.balanceDOP || card.balanceALaFecha || card.balance || 0);
                    const newBalance = Math.max(0, currentBalance - item.amount);
                    const cardRef = doc(db, 'users', currentUser.uid, 'creditCards', item.cardId);
                    await updateDoc(cardRef, {
                        ...(card.balanceDOP !== undefined && { balanceDOP: newBalance }),
                        ...(card.balanceALaFecha !== undefined && { balanceALaFecha: newBalance }),
                        ...(card.balance !== undefined && { balance: newBalance })
                    }).catch(console.error);
                }
            }
        }

        await updateDoc(doc(db, 'users', currentUser.uid, 'recurring', item.id), { paidMonths });
    };

    // ─── Mark all previous months as paid (clear carry-over) ───
    const payAllCarryOver = async (item) => {
        if (!currentUser || !db || item.carryOver.count === 0) return;
        const now = new Date();
        const curKey = currentMonthKey();
        const dueKeys = getDueMonthKeys(item.startDate || now.toISOString().split('T')[0], item.frequency, now.getFullYear(), now.getMonth());
        const paidMonths = new Set(item.paidMonths || []);

        dueKeys.forEach(mk => {
            if (mk < curKey) paidMonths.add(mk);
        });

        await updateDoc(doc(db, 'users', currentUser.uid, 'recurring', item.id), { paidMonths: Array.from(paidMonths) });
    };

    const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1); };
    const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1); };

    // ─── Totals (memoized) ───
    const { totalMonthly, totalCarryOver, overdueCount } = useMemo(() => {
        let monthly = 0, carry = 0, pending = 0, overdue = 0;
        enrichedItems.forEach(r => {
            if (!r.active) return;
            monthly += r.amount || 0;
            carry += r.carryOver.amount;
            if (r.status === 'pending' || r.status === 'overdue') pending += r.totalDue;
            if (r.status === 'overdue') overdue++;
        });
        return { totalMonthly: monthly, totalCarryOver: carry, totalPending: pending, overdueCount: overdue };
    }, [enrichedItems]);

    return (
        <div className="flex flex-col min-h-screen bg-[#f5f7f6]">
            <header className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-[#f5f7f6]/90 backdrop-blur-md px-6 pt-12 pb-4 flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-black/5 active:scale-95 transition-all">
                    <span className="material-symbols-rounded text-2xl text-gray-800">arrow_back_ios_new</span>
                </button>
                <h1 className="text-xl font-bold text-gray-900">Pagos Recurrentes</h1>
                <button onClick={() => { if (showForm) resetForm(); else setShowForm(true); }} className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary/10 hover:bg-primary/20 active:scale-95 transition-all">
                    <span className="material-symbols-rounded text-2xl text-primary">{showForm ? 'close' : 'add'}</span>
                </button>
            </header>

            <div className="pt-28 pb-28 px-5 space-y-5">
                {/* Calendar */}
                <div className="bg-white rounded-[28px] p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center justify-between mb-4">
                        <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-gray-100 active:scale-95"><span className="material-symbols-rounded text-gray-600">chevron_left</span></button>
                        <h3 className="text-lg font-bold text-gray-900">{MONTHS[viewMonth]} {viewYear}</h3>
                        <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-gray-100 active:scale-95"><span className="material-symbols-rounded text-gray-600">chevron_right</span></button>
                    </div>

                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {WEEKDAYS.map(d => <div key={d} className="text-center text-[11px] font-bold text-gray-400 uppercase">{d}</div>)}
                    </div>

                    {/* Days grid — dots colored by status */}
                    <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: startDay }).map((_, i) => <div key={`e-${i}`} />)}
                        {Array.from({ length: totalDays }).map((_, i) => {
                            const day = i + 1;
                            const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                            const dotItems = calendarDots[day];
                            const hasOverdue = dotItems?.some(d => d.status === 'overdue');
                            return (
                                <div key={day} className={`relative flex flex-col items-center justify-center h-10 rounded-xl text-sm font-semibold transition-colors ${isToday ? 'bg-primary text-black' : hasOverdue ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : dotItems ? 'bg-indigo-50 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}>
                                    {day}
                                    {dotItems && (
                                        <div className="flex gap-0.5 absolute bottom-0.5">
                                            {dotItems.slice(0, 3).map((d, di) => (
                                                <span key={di} className={`w-1.5 h-1.5 rounded-full ${d.status === 'overdue' ? 'bg-red-500' : d.status === 'paid' ? 'bg-green-500' : isToday ? 'bg-black/60' : 'bg-indigo-400'}`} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Summary Card */}
                <div className={`rounded-3xl p-5 shadow-lg ${overdueCount > 0 ? 'bg-gradient-to-r from-red-500 to-rose-600' : 'bg-gradient-to-r from-indigo-500 to-purple-600'}`}>
                    <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">Total Comprometido Mensual</p>
                    <p className="text-3xl font-extrabold text-white">RD$ {formatMoney(totalMonthly)}</p>
                    <p className="text-white/70 text-xs mt-1">{enrichedItems.filter(r => r.active).length} pagos activos · TZ: {getUserTimezone()}</p>

                    {totalCarryOver > 0 && (
                        <div className="mt-3 bg-white/15 rounded-xl px-4 py-2">
                            <div className="flex justify-between items-center">
                                <span className="text-white/90 text-xs font-bold">⚠️ Saldo vencido arrastrado</span>
                                <span className="text-white text-sm font-extrabold">+ RD$ {formatMoney(totalCarryOver)}</span>
                            </div>
                            <p className="text-white/70 text-[10px] mt-0.5">De meses anteriores no pagados</p>
                        </div>
                    )}
                    {totalCarryOver > 0 && (
                        <div className="mt-2 bg-white/10 rounded-xl px-4 py-2 flex justify-between items-center">
                            <span className="text-white text-xs font-bold">Total pendiente real:</span>
                            <span className="text-white text-lg font-extrabold">RD$ {formatMoney(totalMonthly + totalCarryOver)}</span>
                        </div>
                    )}
                    {overdueCount > 0 && (
                        <p className="text-white text-xs font-bold mt-2">🔴 {overdueCount} pago{overdueCount > 1 ? 's' : ''} vencido{overdueCount > 1 ? 's' : ''} este mes</p>
                    )}
                </div>

                {/* Create Form */}
                {showForm && (
                    <div className="bg-white rounded-[28px] p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] space-y-4 animate-in slide-in-from-top duration-300">
                        <h3 className="font-bold text-gray-900">{editingItem ? 'Editar Pago Recurrente' : 'Nuevo Pago Recurrente'}</h3>
                        <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Nombre (ej. Netflix, Luz)" className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/30 outline-none border-none" />
                        <input type="number" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="Monto (RD$)" className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/30 outline-none border-none" />
                        <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/30 outline-none border-none">
                            {['Servicios', 'Renta', 'Transporte', 'Educación', 'Salud', 'Ocio', 'Comida', 'Otros'].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <div className="flex gap-2">
                            {FREQUENCIES.map(f => (
                                <button key={f.id} type="button" onClick={() => setFormData({ ...formData, frequency: f.id })} className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${formData.frequency === f.id ? 'bg-primary text-black' : 'bg-gray-100 text-gray-500'}`}>{f.label}</button>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block px-1">Fecha inicio</label>
                                <input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/30 outline-none border-none" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block px-1">Día límite pago</label>
                                <input type="number" min="1" max="31" value={formData.dueDay} onChange={e => setFormData({ ...formData, dueDay: e.target.value })} placeholder="15" className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/30 outline-none border-none" />
                            </div>
                        </div>
                        <button onClick={handleSave} disabled={saving || !formData.name.trim() || !formData.amount} className="w-full bg-primary text-black font-bold py-3.5 rounded-2xl disabled:opacity-50 active:scale-[0.98] transition-transform">{saving ? 'Guardando...' : editingItem ? 'Actualizar' : 'Guardar Recurrente'}</button>
                        {editingItem && <button onClick={resetForm} className="w-full text-gray-400 font-bold py-2 text-sm">Cancelar</button>}
                    </div>
                )}

                {/* List with statuses */}
                <div>
                    {(() => {
                        const creditCardItems = enrichedItems.filter(r => r.type === 'credit_card');
                        const regularItems = enrichedItems.filter(r => r.type !== 'credit_card');

                        const renderItem = (r) => {
                            const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
                            const isPaidThisMonth = r.status === 'paid';
                            const isOverdue = r.status === 'overdue';
                            const hasCarryOver = r.carryOver.count > 0;

                            return (
                                <div key={r.id} className={`bg-white rounded-[24px] p-5 shadow-sm transition-all ${isOverdue ? 'ring-2 ring-red-300 bg-red-50/40' : isPaidThisMonth ? 'ring-1 ring-green-200 bg-green-50/30' : ''} ${!r.active ? 'opacity-50' : ''}`}>
                                    <div className="flex items-center gap-4">
                                        <button onClick={() => togglePaid(r)} disabled={!r.active || r.status === 'not-due'} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shrink-0 active:scale-90 ${isPaidThisMonth ? 'bg-green-100' : isOverdue ? 'bg-red-100' : 'bg-indigo-100'}`}>
                                            <span className={`material-symbols-rounded text-2xl ${isPaidThisMonth ? 'text-green-600' : isOverdue ? 'text-red-500' : 'text-indigo-500'}`}>
                                                {isPaidThisMonth ? 'check_circle' : 'radio_button_unchecked'}
                                            </span>
                                        </button>

                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-gray-900 truncate">{r.name}</h4>
                                            <p className="text-xs text-gray-400">{FREQUENCIES.find(f => f.id === r.frequency)?.label || r.frequency} · {r.category} · Vence día {r.dueDay || '15'}</p>
                                            <span className={`inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                                {cfg.label}
                                            </span>
                                        </div>

                                        <div className="text-right shrink-0">
                                            <p className={`font-extrabold ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>RD$ {formatMoney(r.amount)}</p>
                                            <div className="flex gap-1 mt-1 justify-end">
                                                <button onClick={() => startEdit(r)} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 active:scale-95">Editar</button>
                                                {r.type !== 'credit_card' && (
                                                    <button onClick={() => setConfirmDelete(r.id)} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500 active:scale-95">
                                                        <span className="material-symbols-rounded text-[14px] leading-none">delete</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {hasCarryOver && r.active && (
                                        <div className="mt-3 bg-red-50 rounded-xl px-4 py-3 border border-red-100">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="text-[10px] text-red-600 font-bold uppercase">Arrastre de saldo vencido</p>
                                                    <p className="text-xs text-red-800 mt-0.5">Cuota actual: <b>RD$ {formatMoney(r.amount)}</b></p>
                                                    <p className="text-xs text-red-800">Saldo anterior ({r.carryOver.count} mes{r.carryOver.count > 1 ? 'es' : ''}): <b>RD$ {formatMoney(r.carryOver.amount)}</b></p>
                                                    <p className="text-sm text-red-900 font-extrabold mt-1">Total a pagar: RD$ {formatMoney(r.totalDue)}</p>
                                                </div>
                                                <button onClick={() => payAllCarryOver(r)} className="bg-red-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-transform shrink-0 mt-1">
                                                    Saldar
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {confirmDelete === r.id && r.type !== 'credit_card' && (
                                        <div className="mt-3 bg-red-50 rounded-xl px-4 py-3 border border-red-200 flex items-center justify-between">
                                            <p className="text-xs text-red-700 font-bold">¿Eliminar este pago?</p>
                                            <div className="flex gap-2">
                                                <button onClick={() => setConfirmDelete(null)} className="text-xs font-bold px-3 py-1 rounded-lg bg-gray-200 text-gray-600">No</button>
                                                <button onClick={() => handleDelete(r.id)} className="text-xs font-bold px-3 py-1 rounded-lg bg-red-600 text-white active:scale-95">Sí, eliminar</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        };

                        return (
                            <>
                                {creditCardItems.length > 0 && (
                                    <div className="mb-6">
                                        <h3 className="text-[17px] font-bold text-gray-900 mb-3 px-1">Tarjetas de Crédito</h3>
                                        <div className="space-y-3">
                                            {creditCardItems.map(renderItem)}
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <h3 className="text-[17px] font-bold text-gray-900 mb-3 px-1">Mis Pagos Fijos</h3>
                                    {regularItems.length === 0 ? (
                                        <p className="text-center text-sm text-gray-400 py-8">Aún no tienes pagos recurrentes.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {regularItems.map(renderItem)}
                                        </div>
                                    )}
                                </div>
                            </>
                        );
                    })()}
                </div>
            </div>
            <BottomNav />
        </div>
    );
}

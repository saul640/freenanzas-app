import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, addDoc, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
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

function getNextDate(startDate, frequency) {
    const d = new Date(startDate);
    const now = new Date();
    const freq = FREQUENCIES.find(f => f.id === frequency);
    if (!freq) return d;
    while (d <= now) { d.setDate(d.getDate() + freq.days); }
    return d;
}

function getMonthDays(year, month) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDay = first.getDay();
    const totalDays = last.getDate();
    return { startDay, totalDays };
}

export default function RecurringExpenses() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [recurring, setRecurring] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', amount: '', category: 'Servicios', frequency: 'monthly', startDate: new Date().toISOString().split('T')[0] });
    const [saving, setSaving] = useState(false);

    const today = new Date();
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [viewYear, setViewYear] = useState(today.getFullYear());

    // ─── Listen to recurring items ───
    useEffect(() => {
        if (!currentUser || !db) return;
        const ref = collection(db, 'users', currentUser.uid, 'recurring');
        const unsub = onSnapshot(ref, snap => {
            setRecurring(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.name));
        });
        return unsub;
    }, [currentUser]);

    // ─── Calculate calendar dots ───
    const calendarDots = useMemo(() => {
        const dots = {};
        const { totalDays } = getMonthDays(viewYear, viewMonth);
        recurring.forEach(r => {
            if (!r.active) return;
            const start = r.startDate ? new Date(r.startDate + 'T12:00:00') : new Date();
            const freq = FREQUENCIES.find(f => f.id === r.frequency);
            if (!freq) return;
            const d = new Date(start);
            // Search forward from start, but limit to reasonable iterations
            for (let i = 0; i < 200; i++) {
                if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
                    const day = d.getDate();
                    if (day >= 1 && day <= totalDays) {
                        if (!dots[day]) dots[day] = [];
                        dots[day].push({ name: r.name, amount: r.amount, category: r.category });
                    }
                }
                if (d.getFullYear() > viewYear || (d.getFullYear() === viewYear && d.getMonth() > viewMonth)) break;
                d.setDate(d.getDate() + freq.days);
            }
        });
        return dots;
    }, [recurring, viewMonth, viewYear]);

    const { startDay, totalDays } = getMonthDays(viewYear, viewMonth);

    const handleSave = async () => {
        if (!formData.name.trim() || !formData.amount || !currentUser) return;
        setSaving(true);
        try {
            await addDoc(collection(db, 'users', currentUser.uid, 'recurring'), {
                name: formData.name.trim(),
                amount: parseFloat(formData.amount),
                category: formData.category,
                frequency: formData.frequency,
                startDate: formData.startDate,
                timezone: getUserTimezone(),
                active: true,
                createdAt: serverTimestamp(),
            });
            setShowForm(false);
            setFormData({ name: '', amount: '', category: 'Servicios', frequency: 'monthly', startDate: new Date().toISOString().split('T')[0] });
        } catch (e) { console.error(e); }
        setSaving(false);
    };

    const toggleActive = async (item) => {
        if (!currentUser || !db) return;
        await updateDoc(doc(db, 'users', currentUser.uid, 'recurring', item.id), { active: !item.active });
    };

    const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1); };
    const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1); };

    const totalMonthly = useMemo(() => recurring.filter(r => r.active).reduce((s, r) => s + (r.amount || 0), 0), [recurring]);

    return (
        <div className="flex flex-col min-h-screen bg-[#f5f7f6]">
            <header className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-[#f5f7f6]/90 backdrop-blur-md px-6 pt-12 pb-4 flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-black/5 active:scale-95 transition-all">
                    <span className="material-symbols-rounded text-2xl text-gray-800">arrow_back_ios_new</span>
                </button>
                <h1 className="text-xl font-bold text-gray-900">Pagos Recurrentes</h1>
                <button onClick={() => setShowForm(!showForm)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary/10 hover:bg-primary/20 active:scale-95 transition-all">
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

                    {/* Days grid */}
                    <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: startDay }).map((_, i) => <div key={`e-${i}`} />)}
                        {Array.from({ length: totalDays }).map((_, i) => {
                            const day = i + 1;
                            const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                            const hasDots = calendarDots[day];
                            return (
                                <div key={day} className={`relative flex flex-col items-center justify-center h-10 rounded-xl text-sm font-semibold transition-colors ${isToday ? 'bg-primary text-black' : hasDots ? 'bg-indigo-50 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}>
                                    {day}
                                    {hasDots && (
                                        <div className="flex gap-0.5 absolute bottom-0.5">
                                            {hasDots.slice(0, 3).map((_, di) => <span key={di} className={`w-1 h-1 rounded-full ${isToday ? 'bg-black/60' : 'bg-indigo-400'}`} />)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Summary */}
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl p-5 shadow-lg">
                    <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">Total Comprometido Mensual</p>
                    <p className="text-3xl font-extrabold text-white">RD$ {new Intl.NumberFormat('es-DO').format(totalMonthly)}</p>
                    <p className="text-white/70 text-xs mt-1">{recurring.filter(r => r.active).length} pagos activos · TZ: {getUserTimezone()}</p>
                </div>

                {/* Create Form */}
                {showForm && (
                    <div className="bg-white rounded-[28px] p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] space-y-4 animate-in slide-in-from-top duration-300">
                        <h3 className="font-bold text-gray-900">Nuevo Pago Recurrente</h3>
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
                        <input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/30 outline-none border-none" />
                        <button onClick={handleSave} disabled={saving || !formData.name.trim() || !formData.amount} className="w-full bg-primary text-black font-bold py-3.5 rounded-2xl disabled:opacity-50 active:scale-[0.98] transition-transform">{saving ? 'Guardando...' : 'Guardar Recurrente'}</button>
                    </div>
                )}

                {/* List */}
                <div>
                    <h3 className="text-[17px] font-bold text-gray-900 mb-3 px-1">Mis Pagos</h3>
                    {recurring.length === 0 ? (
                        <p className="text-center text-sm text-gray-400 py-8">Aún no tienes pagos recurrentes.</p>
                    ) : (
                        <div className="space-y-3">
                            {recurring.map(r => (
                                <div key={r.id} className={`bg-white rounded-[24px] p-5 shadow-sm flex items-center gap-4 transition-opacity ${r.active ? '' : 'opacity-50'}`}>
                                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center">
                                        <span className="material-symbols-rounded text-indigo-500 text-2xl">event_repeat</span>
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-gray-900">{r.name}</h4>
                                        <p className="text-xs text-gray-400">{FREQUENCIES.find(f => f.id === r.frequency)?.label || r.frequency} · {r.category}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-extrabold text-gray-900">RD$ {new Intl.NumberFormat('es-DO').format(r.amount)}</p>
                                        <button onClick={() => toggleActive(r)} className={`text-[10px] font-bold mt-1 px-2 py-0.5 rounded-full ${r.active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>{r.active ? 'Activo' : 'Pausado'}</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <BottomNav />
        </div>
    );
}

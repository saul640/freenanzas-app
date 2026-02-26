import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, doc, setDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useLoans } from '../hooks/useLoans';
import { calcAhorroRecomendado } from '../lib/gemini';
import BottomNav from './BottomNav';
import PaywallModal from './PaywallModal';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const DEFAULT_CATEGORIES = ['Comida', 'Transporte', 'Servicios', 'Renta', 'Ocio', 'Salud', 'Educación', 'Otros'];
const CURRENT_MONTH_KEY = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

function getBarColor(pct) {
    if (pct >= 90) return { bar: 'bg-red-500', text: 'text-red-600', label: '¡Cuidado!' };
    if (pct >= 70) return { bar: 'bg-amber-500', text: 'text-amber-600', label: 'Atención' };
    return { bar: 'bg-primary', text: 'text-primary', label: 'Bien' };
}

const getCardBalanceDOP = (card) => card.balanceDOP ?? card.balanceALaFecha ?? card.balance ?? 0;

export default function MonthlyBudget() {
    const navigate = useNavigate();
    const { currentUser, userData } = useAuth();
    const isPro = userData?.isPro === true || userData?.isPro === undefined;
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
            }
        });
        return unsub;
    }, [currentUser, monthKey]);

    // ─── Load transactions for current month ───
    useEffect(() => {
        if (!currentUser || !db) return;
        const q = query(collection(db, 'transactions'), where('userId', '==', currentUser.uid));
        const unsub = onSnapshot(q, snap => {
            const now = new Date();
            const thisMonth = now.getMonth();
            const thisYear = now.getFullYear();
            const txs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(tx => {
                if (tx.type !== 'expense') return false;
                const txDate = tx.timestamp?.toDate ? tx.timestamp.toDate() : tx.date ? new Date(tx.date) : null;
                return txDate && txDate.getMonth() === thisMonth && txDate.getFullYear() === thisYear;
            });
            setTransactions(txs);
        });
        return unsub;
    }, [currentUser]);

    const totalSpent = useMemo(() => transactions.reduce((s, t) => s + (t.amount || 0), 0), [transactions]);

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
            setRecurring(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.active));
        });
    }, [currentUser]);

    const totalRecurrentesPendientes = useMemo(() => {
        return recurring.reduce((sum, item) => {
            const startStr = item.startDate ? item.startDate.substring(0, 7) : null;
            if (startStr && startStr > monthKey) return sum; // Not started yet

            const paidSet = new Set(item.paidMonths || []);
            if (!paidSet.has(monthKey)) {
                return sum + (item.amount || 0);
            }
            return sum;
        }, 0);
    }, [recurring, monthKey]);

    const totalCardDebt = useMemo(() => creditCards.reduce((s, c) => s + getCardBalanceDOP(c), 0), [creditCards]);
    const credimasDebt = useMemo(() => creditCards.reduce((s, c) => s + (c.credimasTotalAdeudado || 0), 0), [creditCards]);
    const totalDeudaGlobal = totalCardDebt + (loans.reduce((s, l) => s + (l.balancePendiente || 0), 0)) + credimasDebt;
    const ahorroRecomendado = useMemo(() => calcAhorroRecomendado(monthlyIncome, totalDeudaGlobal), [monthlyIncome, totalDeudaGlobal]);
    const disponibleReal = Math.max(globalLimit - totalSpent - totalCuotasPendientes - totalRecurrentesPendientes - ahorroRecomendado, 0);

    const spendingByCategory = useMemo(() => {
        const map = {};
        transactions.forEach(tx => {
            const cat = tx.category || 'Otros';
            map[cat] = (map[cat] || 0) + (tx.amount || 0);
        });
        return map;
    }, [transactions]);

    const allCategories = useMemo(() => {
        const set = new Set([...DEFAULT_CATEGORIES, ...Object.keys(categoryLimits), ...Object.keys(spendingByCategory)]);
        return Array.from(set);
    }, [categoryLimits, spendingByCategory]);

    const formatMoney = useCallback((n) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n), []);

    const startEditing = () => {
        setTempGlobal(String(globalLimit || ''));
        setTempCats({ ...categoryLimits });
        setEditing(true);
    };

    const handleSave = async () => {
        if (!currentUser || !db) return;
        setSaving(true);
        const parsed = parseFloat(tempGlobal) || 0;
        const parsedCats = {};
        Object.entries(tempCats).forEach(([k, v]) => { const n = parseFloat(v); if (n > 0) parsedCats[k] = n; });
        await setDoc(doc(db, 'users', currentUser.uid, 'budgets', monthKey), { globalLimit: parsed, categoryLimits: parsedCats, updatedAt: new Date().toISOString() });
        setEditing(false);
        setSaving(false);
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
            </div>

            <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} />
            <BottomNav />
        </div>
    );
}

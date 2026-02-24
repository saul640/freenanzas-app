import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, doc, updateDoc, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';

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

export default function PendingPayments() {
    const { currentUser } = useAuth();
    const [recurring, setRecurring] = useState([]);
    const [transactions, setTransactions] = useState([]);

    useEffect(() => {
        if (!currentUser || !db) {
            setRecurring([]);
            setTransactions([]);
            return;
        }

        const unsubRecurring = onSnapshot(collection(db, 'users', currentUser.uid, 'recurring'), snap => {
            setRecurring(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        const unsubTx = onSnapshot(collection(db, 'users', currentUser.uid, 'transactions'), snap => {
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(tx => tx.estado === 'pendiente' || tx.status === 'pendiente'));
        });

        return () => { unsubRecurring(); unsubTx(); };
    }, [currentUser]);

    const formatMoney = useCallback(n => new Intl.NumberFormat('es-DO').format(n), []);

    const pendingItems = useMemo(() => {
        const items = [];
        const now = new Date();

        recurring.forEach(item => {
            const rName = item.name;
            if (!rName) return;
            const status = getPaymentStatus(item);
            if (status === 'pending' || status === 'overdue') {
                const carryOver = calcCarryOver(item);
                let totalDue = (item.amount || 0) + carryOver.amount;

                const abonado = Number(item.pagos_abonados || 0);
                totalDue -= abonado;

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

                const baseAmount = Number(tx.amount || 0);
                const abonado = Number(tx.pagos_abonados || 0);
                const totalDue = baseAmount - abonado;

                if (totalDue > 0) {
                    items.push({
                        id: tx.id,
                        type: 'transaction',
                        sourceItem: tx,
                        name: tx.description || tx.category || 'Gasto Pendiente',
                        amount: totalDue,
                        originalDueDay: txDate.getDate(),
                        daysLeft: isOverdue ? 0 : daysUntil(txDate.getDate()),
                        isOverdue: isOverdue,
                        isNearDue: !isOverdue && (daysUntil(txDate.getDate()) <= 3),
                        category: tx.category || 'Gastos'
                    });
                }
            }
        });

        return items.sort((a, b) => {
            if (a.isOverdue && !b.isOverdue) return -1;
            if (!a.isOverdue && b.isOverdue) return 1;
            if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
            return b.amount - a.amount;
        });
    }, [recurring, transactions]);

    const [selectedPayment, setSelectedPayment] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentProcessing, setPaymentProcessing] = useState(false);

    const handleOpenPayment = (pItem) => {
        setSelectedPayment(pItem);
        setPaymentAmount(pItem.amount.toString());
    };

    const handleConfirmPayment = async () => {
        if (!currentUser || !db || !selectedPayment) return;
        const amountToPay = Number(paymentAmount);
        if (isNaN(amountToPay) || amountToPay <= 0) return;

        setPaymentProcessing(true);
        try {
            const isPartial = amountToPay < selectedPayment.amount;

            // 1. Transaction creation
            const txData = {
                userId: currentUser.uid,
                type: 'expense',
                amount: amountToPay,
                category: selectedPayment.category || 'Gastos',
                date: new Date().toISOString().split('T')[0],
                note: `Pago ${isPartial ? 'parcial' : 'total'} de ${selectedPayment.name}`,
                timestamp: serverTimestamp()
            };
            await addDoc(collection(db, 'transactions'), txData);

            // 2. Original item update
            if (selectedPayment.type === 'recurring') {
                const itemRef = doc(db, 'users', currentUser.uid, 'recurring', selectedPayment.id);
                if (isPartial) {
                    const currentAbonado = Number(selectedPayment.sourceItem.pagos_abonados || 0);
                    await updateDoc(itemRef, { pagos_abonados: currentAbonado + amountToPay });
                } else {
                    const curKey = currentMonthKey();
                    const dueKeys = Array.from(getDueMonthKeys(selectedPayment.sourceItem.startDate || new Date().toISOString().split('T')[0], selectedPayment.sourceItem.frequency || 'monthly', new Date().getFullYear(), new Date().getMonth()));
                    const toAdd = dueKeys.filter(k => k <= curKey);

                    if (!toAdd.includes(curKey)) toAdd.push(curKey);

                    const paidArr = selectedPayment.sourceItem.paidMonths || [];
                    const newPaid = Array.from(new Set([...paidArr, ...toAdd]));
                    await updateDoc(itemRef, { paidMonths: newPaid, pagos_abonados: 0 });
                }
            } else if (selectedPayment.type === 'transaction') {
                const itemRef = doc(db, 'users', currentUser.uid, 'transactions', selectedPayment.id);
                if (isPartial) {
                    const currentAbonado = Number(selectedPayment.sourceItem.pagos_abonados || 0);
                    await updateDoc(itemRef, { pagos_abonados: currentAbonado + amountToPay });
                } else {
                    await updateDoc(itemRef, { estado: 'pagado', status: 'pagado', pagos_abonados: 0 });
                }
            }

            setSelectedPayment(null);
            setPaymentAmount('');
        } catch (e) {
            console.error('Error procesando pago:', e);
        } finally {
            setPaymentProcessing(false);
        }
    };

    if (pendingItems.length === 0) return null;

    return (
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
                            <button onClick={() => handleOpenPayment(pItem)} className="w-10 h-10 rounded-full bg-green-100 hover:bg-green-200 flex items-center justify-center transition-colors shrink-0">
                                <span className="material-symbols-rounded text-[20px] text-green-600 font-bold">check</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {selectedPayment && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !paymentProcessing && setSelectedPayment(null)} />
                    <div className="relative w-full max-w-md bg-white rounded-[32px] p-6 shadow-xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-xl font-extrabold text-gray-900 mb-2">Pago de Deuda</h3>
                        <p className="text-sm font-medium text-gray-500 mb-6">Estás a punto de abonar a <strong className="text-gray-800">{selectedPayment.name}</strong>.</p>

                        <div className="bg-gray-50 rounded-2xl p-4 mb-6">
                            <p className="text-[13px] font-bold text-gray-500 uppercase tracking-wider mb-2">Monto Total Adeudado</p>
                            <p className="text-2xl font-extrabold text-gray-900">RD$ {formatMoney(selectedPayment.amount)}</p>
                        </div>

                        <div className="mb-6">
                            <label className="text-[13px] font-bold text-gray-500 uppercase tracking-wider mb-2 block">¿Cuánto deseas pagar hoy?</label>
                            <div className="flex items-center bg-white border-2 border-primary/20 focus-within:border-primary rounded-2xl px-4 py-3 transition-colors">
                                <span className="text-xl font-bold text-gray-400 mr-2">RD$</span>
                                <input
                                    type="number"
                                    value={paymentAmount}
                                    onChange={(e) => setPaymentAmount(e.target.value)}
                                    className="w-full text-xl font-extrabold text-gray-900 bg-transparent border-none p-0 focus:ring-0 outline-none"
                                    autoFocus
                                    disabled={paymentProcessing}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={() => setSelectedPayment(null)}
                                disabled={paymentProcessing}
                                className="flex-1 py-3.5 rounded-2xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmPayment}
                                disabled={paymentProcessing || !paymentAmount || Number(paymentAmount) <= 0}
                                className="flex-1 py-3.5 rounded-2xl font-bold text-black bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center"
                            >
                                {paymentProcessing ? <span className="material-symbols-rounded animate-spin">progress_activity</span> : 'Confirmar Pago'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

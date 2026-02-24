import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, doc, updateDoc, onSnapshot } from 'firebase/firestore';
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
                            <button onClick={() => handleMarkAsPaid(pItem)} className="w-10 h-10 rounded-full bg-green-100 hover:bg-green-200 flex items-center justify-center transition-colors shrink-0">
                                <span className="material-symbols-rounded text-[20px] text-green-600 font-bold">check</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

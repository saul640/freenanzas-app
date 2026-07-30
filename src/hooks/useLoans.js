import { useState, useEffect, useCallback } from 'react';
import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { buildPaymentTransaction, getAutomaticPaymentId, getMonthKey } from '../lib/paymentTransactions';

/**
 * Custom hook for managing loans in Firestore.
 * Collection: users/{uid}/loans
 */
export function useLoans(userId) {
    const [loans, setLoans] = useState([]);
    const [loading, setLoading] = useState(true);

    // Real-time subscription
    useEffect(() => {
        if (!userId || !db) return;

        const colRef = collection(db, 'users', userId, 'loans');
        const unsub = onSnapshot(colRef, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Sort by diaDePago ascending
            data.sort((a, b) => (a.diaDePago || 0) - (b.diaDePago || 0));
            setLoans(data);
            setLoading(false);
        }, (err) => {
            console.error('useLoans listener error:', err);
            setLoading(false);
        });

        return unsub;
    }, [userId]);

    const addLoan = useCallback(async (loan) => {
        if (!userId || !db) return;
        const colRef = collection(db, 'users', userId, 'loans');
        await addDoc(colRef, {
            nombrePrestamo: loan.nombrePrestamo || '',
            montoTotalAcordado: Number(loan.montoTotalAcordado) || 0,
            balancePendiente: Number(loan.balancePendiente) || Number(loan.montoTotalAcordado) || 0,
            tasaInteres: Number(loan.tasaInteres) || 0,
            cuotaMensual: Number(loan.cuotaMensual) || 0,
            diaDePago: Number(loan.diaDePago) || 1,
            pagadoEsteMes: false,
            fechaUltimoPago: null,
            createdAt: serverTimestamp(),
        });
    }, [userId]);

    const updateLoan = useCallback(async (loanId, updates) => {
        if (!userId || !db) return;
        const ref = doc(db, 'users', userId, 'loans', loanId);
        await updateDoc(ref, updates);
    }, [userId]);

    const deleteLoan = useCallback(async (loanId) => {
        if (!userId || !db) return;
        const ref = doc(db, 'users', userId, 'loans', loanId);
        await deleteDoc(ref);
    }, [userId]);

    const markAsPaid = useCallback(async (loan) => {
        if (!userId || !db) return;
        const ref = doc(db, 'users', userId, 'loans', loan.id);
        const monthKey = getMonthKey();
        const paymentRef = doc(db, 'transactions', getAutomaticPaymentId(userId, 'loan', loan.id, monthKey));
        const batch = writeBatch(db);
        const newBalance = Math.max((loan.balancePendiente || 0) - (loan.cuotaMensual || 0), 0);
        batch.update(ref, {
            pagadoEsteMes: true,
            balancePendiente: newBalance,
            fechaUltimoPago: new Date().toISOString(),
        });
        if (Number(loan.cuotaMensual) > 0) {
            batch.set(paymentRef, buildPaymentTransaction({
                userId,
                amount: loan.cuotaMensual,
                category: 'Préstamos',
                note: `Cuota de préstamo: ${loan.nombrePrestamo || 'Préstamo'}`,
                sourceType: 'loan',
                sourceId: loan.id,
                extra: { loanId: loan.id, paymentStatus: 'paid' },
            }));
        }
        await batch.commit();
    }, [userId]);

    const undoPaid = useCallback(async (loan) => {
        if (!userId || !db) return;
        const ref = doc(db, 'users', userId, 'loans', loan.id);
        const monthKey = getMonthKey();
        const paymentRef = doc(db, 'transactions', getAutomaticPaymentId(userId, 'loan', loan.id, monthKey));
        const paymentSnapshot = await getDoc(paymentRef);
        const batch = writeBatch(db);
        batch.update(ref, {
            pagadoEsteMes: false,
            balancePendiente: (loan.balancePendiente || 0) + (loan.cuotaMensual || 0),
            fechaUltimoPago: null,
        });
        if (paymentSnapshot.exists()) batch.delete(paymentRef);
        await batch.commit();
    }, [userId]);

    // Derived values
    const totalDeuda = loans.reduce((s, l) => s + (l.balancePendiente || 0), 0);
    const totalCuotasMensuales = loans.reduce((s, l) => s + (l.cuotaMensual || 0), 0);
    const totalCuotasPendientes = loans.filter(l => !l.pagadoEsteMes).reduce((s, l) => s + (l.cuotaMensual || 0), 0);

    return {
        loans,
        loading,
        addLoan,
        updateLoan,
        deleteLoan,
        markAsPaid,
        undoPaid,
        totalDeuda,
        totalCuotasMensuales,
        totalCuotasPendientes,
    };
}

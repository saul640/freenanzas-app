import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import { DEFAULT_BUDGETS, getCategoryById } from '../data/categories'
import { getMonthKey } from '../utils/date'

export const ensureUserProfile = async (user) => {
  if (!user?.uid) return
  const userRef = doc(db, 'users', user.uid)
  const snapshot = await getDoc(userRef)

  if (!snapshot.exists()) {
    await setDoc(userRef, {
      userId: user.uid,
      displayName: user.displayName ?? 'Invitado',
      email: user.email ?? '',
      emergencyGoal: 100000,
      currency: 'DOP',
      createdAt: serverTimestamp(),
    })
  }
}

export const subscribeUserProfile = (userId, onData, onError) => {
  if (!userId) return () => { }
  const userRef = doc(db, 'users', userId)
  return onSnapshot(
    userRef,
    (snapshot) => onData(snapshot.exists() ? snapshot.data() : null),
    onError,
  )
}

export const addTransaction = async ({ userId, type, amount, categoryId }) => {
  const now = new Date()
  const category = getCategoryById(categoryId)

  return addDoc(collection(db, 'users', userId, 'transactions'), {
    userId,
    type,
    amount,
    categoryId,
    categoryLabel: category?.label ?? 'Sin categoria',
    date: now.toISOString().slice(0, 10),
    monthKey: getMonthKey(now),
    timestamp: serverTimestamp(),
  })
}

export const subscribeTransactions = (userId, onData, onError) => {
  if (!userId) return () => { }
  const transactionsRef = collection(db, 'users', userId, 'transactions')
  const q = query(
    transactionsRef,
    orderBy('timestamp', 'desc'),
  )

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => {
        const docData = docSnapshot.data()
        return {
          id: docSnapshot.id,
          ...docData,
          createdAt: docData.timestamp?.toDate?.() ?? null,
        }
      })

      onData(data)
    },
    onError,
  )
}

export const seedBudgets = async (userId, monthKey) => {
  if (!userId || !monthKey) return
  const batch = writeBatch(db)

  DEFAULT_BUDGETS.forEach((budget) => {
    const budgetRef = doc(db, 'users', userId, 'budgets', `${userId}_${monthKey}_${budget.categoryId}`)
    batch.set(budgetRef, {
      userId,
      monthKey,
      categoryId: budget.categoryId,
      limit: budget.limit,
      createdAt: serverTimestamp(),
    })
  })

  await batch.commit()
}

export const subscribeBudgets = (userId, monthKey, onData, onError) => {
  if (!userId || !monthKey) return () => { }
  const budgetsRef = collection(db, 'users', userId, 'budgets')
  const q = query(
    budgetsRef,
    where('monthKey', '==', monthKey),
  )

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))

      onData(data)
    },
    onError,
  )
}

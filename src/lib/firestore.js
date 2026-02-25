import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  limit,
  startAfter,
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

  return addDoc(collection(db, 'transactions'), {
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

export const subscribeTransactions = (userId, onData, onError, limitCount = 20) => {
  if (!userId) return () => { }
  const transactionsRef = collection(db, 'transactions')
  const q = query(
    transactionsRef,
    where('userId', '==', userId),
    orderBy('timestamp', 'desc'),
    limit(limitCount),
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
      const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null
      onData(data, lastVisible, snapshot.docs.length < limitCount)
    },
    onError,
  )
}

/**
 * Fetch next page of transactions (cursor-based pagination).
 * Returns { data, lastDoc, isLastPage }
 */
export const fetchMoreTransactions = async (userId, lastDoc, limitCount = 20) => {
  if (!userId || !lastDoc) return { data: [], lastDoc: null, isLastPage: true }
  const transactionsRef = collection(db, 'transactions')
  const q = query(
    transactionsRef,
    where('userId', '==', userId),
    orderBy('timestamp', 'desc'),
    startAfter(lastDoc),
    limit(limitCount),
  )
  const snapshot = await getDocs(q)
  const data = snapshot.docs.map((docSnapshot) => {
    const docData = docSnapshot.data()
    return {
      id: docSnapshot.id,
      ...docData,
      createdAt: docData.timestamp?.toDate?.() ?? null,
    }
  })
  const newLastDoc = snapshot.docs[snapshot.docs.length - 1] || null
  return { data, lastDoc: newLastDoc, isLastPage: snapshot.docs.length < limitCount }
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

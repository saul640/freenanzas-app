import { useEffect, useRef, useState } from 'react'
import { DEFAULT_BUDGETS } from '../data/categories'
import { seedBudgets, subscribeBudgets } from '../lib/firestore'

export const useBudgets = (userId, monthKey) => {
  const [budgets, setBudgets] = useState(DEFAULT_BUDGETS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const hasSeeded = useRef(false)

  useEffect(() => {
    if (!userId || !monthKey) {
      setBudgets(DEFAULT_BUDGETS)
      setLoading(false)
      return
    }

    setLoading(true)
    const unsubscribe = subscribeBudgets(
      userId,
      monthKey,
      (data) => {
        if (data.length === 0 && !hasSeeded.current) {
          hasSeeded.current = true
          seedBudgets(userId, monthKey).catch((err) => setError(err))
          setBudgets(DEFAULT_BUDGETS)
          setLoading(false)
          return
        }

        setBudgets(data)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      },
    )

    return () => unsubscribe?.()
  }, [userId, monthKey])

  return { budgets, loading, error }
}

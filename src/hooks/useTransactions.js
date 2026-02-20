import { useEffect, useState } from 'react'
import { subscribeTransactions } from '../lib/firestore'

export const useTransactions = (userId) => {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!userId) {
      setTransactions([])
      setLoading(false)
      return
    }

    setLoading(true)
    const unsubscribe = subscribeTransactions(
      userId,
      (data) => {
        setTransactions(data)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      },
    )

    return () => unsubscribe?.()
  }, [userId])

  return { transactions, loading, error }
}

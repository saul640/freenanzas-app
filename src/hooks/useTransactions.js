import { useEffect, useState, useCallback, useRef } from 'react'
import { subscribeTransactions, fetchMoreTransactions } from '../lib/firestore'

const PAGE_SIZE = 20

export const useTransactions = (userId) => {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const lastDocRef = useRef(null)

  useEffect(() => {
    if (!userId) return

    Promise.resolve().then(() => setLoading(true))
    const unsubscribe = subscribeTransactions(
      userId,
      (data, lastVisible, isLastPage) => {
        setTransactions(data)
        lastDocRef.current = lastVisible
        setHasMore(!isLastPage)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      },
      PAGE_SIZE,
    )

    return () => {
      unsubscribe?.()
      setTransactions([])
      setLoading(false)
      lastDocRef.current = null
      setHasMore(false)
    }
  }, [userId])

  const loadMore = useCallback(async () => {
    if (!userId || !lastDocRef.current || loadingMore) return
    try {
      setLoadingMore(true)
      const result = await fetchMoreTransactions(userId, lastDocRef.current, PAGE_SIZE)
      setTransactions(prev => {
        // Deduplicate by id
        const existingIds = new Set(prev.map(t => t.id))
        const newItems = result.data.filter(t => !existingIds.has(t.id))
        return [...prev, ...newItems]
      })
      lastDocRef.current = result.lastDoc
      setHasMore(!result.isLastPage)
    } catch (err) {
      setError(err)
    } finally {
      setLoadingMore(false)
    }
  }, [userId, loadingMore])

  return { transactions, loading, loadingMore, error, hasMore, loadMore }
}

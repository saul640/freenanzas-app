import { useEffect, useState } from 'react'
import { subscribeUserProfile } from '../lib/firestore'

export const useUserProfile = (userId) => {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const unsubscribe = subscribeUserProfile(
      userId,
      (data) => {
        setProfile(data)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      },
    )

    return () => unsubscribe?.()
  }, [userId])

  return { profile, loading, error }
}

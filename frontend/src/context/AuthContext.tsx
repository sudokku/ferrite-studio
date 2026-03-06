import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getMe, type UserProfile } from '@/api/auth'

interface AuthContextValue {
  user: UserProfile | null
  loading: boolean
  setUser: (u: UserProfile | null) => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  setUser: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMe().then((u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

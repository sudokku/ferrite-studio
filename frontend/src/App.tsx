import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { Layout } from '@/components/Layout'
import { ArchitectPage } from '@/pages/ArchitectPage'
import { DatasetPage } from '@/pages/DatasetPage'
import { TrainPage } from '@/pages/TrainPage'
import { EvaluatePage } from '@/pages/EvaluatePage'
import { TestPage } from '@/pages/TestPage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { LibraryPage } from '@/pages/LibraryPage'
import { AdminPage } from '@/pages/AdminPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes under the sidebar layout */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/architect" replace />} />
        <Route path="architect" element={<ArchitectPage />} />
        <Route path="dataset" element={<DatasetPage />} />
        <Route path="train" element={<TrainPage />} />
        <Route path="evaluate" element={<EvaluatePage />} />
        <Route path="test" element={<TestPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

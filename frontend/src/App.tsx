import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { ArchitectPage } from '@/pages/ArchitectPage'
import { DatasetPage } from '@/pages/DatasetPage'
import { TrainPage } from '@/pages/TrainPage'
import { EvaluatePage } from '@/pages/EvaluatePage'
import { TestPage } from '@/pages/TestPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/architect" replace />} />
            <Route path="architect" element={<ArchitectPage />} />
            <Route path="dataset" element={<DatasetPage />} />
            <Route path="train" element={<TrainPage />} />
            <Route path="evaluate" element={<EvaluatePage />} />
            <Route path="test" element={<TestPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

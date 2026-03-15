import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { WikiLinkProvider } from '@/contexts/WikiLinkContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { Login } from '@/pages/Login'
import { DiarioCampo } from '@/pages/DiarioCampo'
import { Bookmarks } from '@/pages/Bookmarks'
import { Fichamentos } from '@/pages/Fichamentos'
import { Planos } from '@/pages/Planos'
import { ListasSimples } from '@/pages/ListasSimples'
import { Tarefas } from '@/pages/Tarefas'
import { MapaConhecimento } from '@/pages/MapaConhecimento'
import { NotFound } from '@/pages/NotFound'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>
          <WikiLinkProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/diario" replace />} />
              <Route path="/diario" element={<DiarioCampo />} />
              <Route path="/bookmarks" element={<Bookmarks />} />
              <Route path="/fichamentos" element={<Fichamentos />} />
              <Route path="/planos" element={<Planos />} />
              <Route path="/listas" element={<ListasSimples />} />
              <Route path="/tarefas" element={<Tarefas />} />
              <Route path="/mapa" element={<MapaConhecimento />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </WikiLinkProvider>
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

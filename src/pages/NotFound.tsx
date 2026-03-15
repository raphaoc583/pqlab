import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <p className="text-6xl font-bold text-gray-200 mb-4">404</p>
      <h1 className="text-xl font-semibold text-gray-700 mb-2">Página não encontrada</h1>
      <p className="text-gray-400 mb-6">A página que você procura não existe.</p>
      <Button asChild>
        <Link to="/diario">
          <Home className="w-4 h-4" />
          Voltar ao início
        </Link>
      </Button>
    </div>
  )
}

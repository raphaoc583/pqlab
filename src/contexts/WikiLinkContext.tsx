import { createContext, useContext, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

export function extractWikiLinks(text: string): string[] {
  return Array.from(text.matchAll(/\[\[([^\]]+)\]\]/g), (m) => m[1])
}

export interface WikiEntry {
  id: string
  title: string
  route: string
  module: 'diario' | 'bookmarks' | 'fichamentos' | 'tarefas' | 'planos' | 'listas'
  wikiLinks: string[]
}

interface WikiLinkContextType {
  register: (entries: WikiEntry[]) => void
  navigate: (title: string) => void
  getEntries: () => WikiEntry[]
}

const WikiLinkContext = createContext<WikiLinkContextType>({
  register: () => {},
  navigate: () => {},
  getEntries: () => [],
})

export function WikiLinkProvider({ children }: { children: React.ReactNode }) {
  // Keyed by title.toLowerCase() — for navigate()
  const registry = useRef<Map<string, WikiEntry>>(new Map())
  // Keyed by `${module}:${id}` — for getEntries(), avoids collisions between modules
  const allEntries = useRef<Map<string, WikiEntry>>(new Map())
  const nav = useNavigate()

  const register = useCallback((entries: WikiEntry[]) => {
    entries.forEach((e) => {
      registry.current.set(e.title.toLowerCase(), e)
      allEntries.current.set(`${e.module}:${e.id}`, e)
    })
  }, [])

  const navigate = useCallback(
    (title: string) => {
      const entry = registry.current.get(title.toLowerCase())
      if (entry) nav(entry.route)
    },
    [nav],
  )

  const getEntries = useCallback(() => Array.from(allEntries.current.values()), [])

  return (
    <WikiLinkContext.Provider value={{ register, navigate, getEntries }}>
      {children}
    </WikiLinkContext.Provider>
  )
}

export const useWikiLinks = () => useContext(WikiLinkContext)

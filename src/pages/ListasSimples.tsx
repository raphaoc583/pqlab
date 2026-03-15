import { useState, useEffect, useMemo } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import {
  List, Plus, Edit2, Trash2, GripVertical, X,
  ChevronDown, ChevronUp, FolderPlus, LayoutGrid, List as ListIcon, Star, Network,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ToastContainer } from '@/components/ui/toast'
import { MarkdownEditor, MarkdownRenderer } from '@/components/shared/MarkdownEditor'
import { useAuth } from '@/contexts/AuthContext'
import { useWikiLinks } from '@/contexts/WikiLinkContext'
import { useToast } from '@/hooks/useToast'
import { loadListasSimples, saveListaSimples, deleteListaSimples } from '@/lib/storage'
import { formatDate } from '@/lib/utils'
import type { ListaSimples, ListaSimpleItem, ListaGrupo } from '@/types'

// ─── Demo data ────────────────────────────────────────────────────────────

const DEMO: ListaSimples[] = [
  {
    id: '1', title: 'Leituras do semestre', description: 'Textos sobre [[memória coletiva]] e [[identidade]] para ler este semestre',
    grupos: [
      { id: 'g1', title: 'Teóricos clássicos', order: 0 },
      { id: 'g2', title: 'Contemporâneos', order: 1 },
    ],
    items: [
      { id: 'i1', title: 'A Imaginação Sociológica – C. Wright Mills', order: 0, grupoId: 'g1' },
      { id: 'i2', title: 'Economia e Sociedade – Max Weber (cap. 1)', order: 1, grupoId: 'g1' },
      { id: 'i3', title: 'O Capital – Marx (livro I, cap. 1)', order: 2, grupoId: 'g1' },
      { id: 'i4', title: 'Modernidade e Ambivalência – Bauman', order: 0, grupoId: 'g2' },
      { id: 'i5', title: 'A Distinção – Pierre Bourdieu', description: 'Análise do capital cultural e [[identidade]] de classe', order: 1, grupoId: 'g2' },
      { id: 'i6', title: 'Dicionário de Ciências Sociais – IUPERJ', order: 5 },
    ],
    created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
  },
]

// ─── Item detail dialog ────────────────────────────────────────────────────

function ItemDetailDialog({
  open, onClose, onSave, initial, grupos,
}: {
  open: boolean; onClose: () => void; onSave: (item: ListaSimpleItem) => void;
  initial?: ListaSimpleItem; grupos: ListaGrupo[];
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [grupoId, setGrupoId] = useState(initial?.grupoId ?? '')

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? '')
      setDescription(initial?.description ?? '')
      setGrupoId(initial?.grupoId ?? '')
    }
  }, [open, initial])

  function handleSave() {
    if (!title.trim()) return
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description || undefined,
      order: initial?.order ?? 0,
      grupoId: grupoId || undefined,
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar item' : 'Novo item'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do item" autoFocus />
          </div>
          {grupos.length > 0 && (
            <div className="space-y-1.5">
              <Label>Grupo</Label>
              <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500">
                <option value="">Sem grupo</option>
                {grupos.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <MarkdownEditor value={description} onChange={setDescription} placeholder="Notas sobre este item..." minHeight={120} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            {initial ? 'Salvar' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Lista editor ──────────────────────────────────────────────────────────

function ListaEditor({ lista, onSave, onClose }: { lista: ListaSimples; onSave: (l: ListaSimples) => void; onClose: () => void }) {
  const [current, setCurrent] = useState<ListaSimples>(lista)
  const [quickAdd, setQuickAdd] = useState('')
  const [newGrupo, setNewGrupo] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ListaSimpleItem | undefined>()
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [editorTab, setEditorTab] = useState<'items' | 'map'>('items')

  function toggleExpand(id: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    const items = Array.from(current.items)
    const [moved] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, moved)
    setCurrent((prev) => ({ ...prev, items: items.map((item, i) => ({ ...item, order: i })) }))
  }

  function handleQuickAdd() {
    if (!quickAdd.trim()) return
    const newItem: ListaSimpleItem = {
      id: crypto.randomUUID(),
      title: quickAdd.trim(),
      order: current.items.length,
    }
    setCurrent((prev) => ({ ...prev, items: [...prev.items, newItem] }))
    setQuickAdd('')
  }

  function addGrupo() {
    if (!newGrupo.trim()) return
    const g: ListaGrupo = { id: crypto.randomUUID(), title: newGrupo.trim(), order: current.grupos.length }
    setCurrent((prev) => ({ ...prev, grupos: [...prev.grupos, g] }))
    setNewGrupo('')
  }

  function handleItemTitleChange(id: string, newTitle: string) {
    setCurrent((prev) => ({
      ...prev,
      items: prev.items.map((item) => item.id === id ? { ...item, title: newTitle } : item),
    }))
  }

  function handleItemSave(item: ListaSimpleItem) {
    setCurrent((prev) => {
      const idx = prev.items.findIndex((x) => x.id === item.id)
      if (idx >= 0) {
        const next = [...prev.items]; next[idx] = item; return { ...prev, items: next }
      }
      return { ...prev, items: [...prev.items, { ...item, order: prev.items.length }] }
    })
  }

  async function handleSave() {
    setSaving(true)
    await onSave({ ...current, updated_at: new Date().toISOString() })
    setSaving(false)
  }

  const total = current.items.length
  const allItemsOrdered = [...current.items].sort((a, b) => a.order - b.order)
  const ungrouped = allItemsOrdered.filter((i) => !i.grupoId)
  const grouped = current.grupos.map((g) => ({
    group: g,
    items: allItemsOrdered.filter((i) => i.grupoId === g.id),
  }))

  function renderItem(item: ListaSimpleItem, dragIndex: number) {
    const isExpanded = expandedItems.has(item.id)
    return (
      <Draggable key={item.id} draggableId={item.id} index={dragIndex}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className="flex flex-col border rounded-lg overflow-hidden bg-white transition-all cursor-grab active:cursor-grabbing"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <GripVertical className="w-3.5 h-3.5 text-gray-300 shrink-0" />
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
              <input
                value={item.title}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); handleItemTitleChange(item.id, e.target.value) }}
                className="flex-1 text-sm font-medium text-gray-900 bg-transparent focus:outline-none cursor-text"
                placeholder="Título do item"
              />
              {item.description && (
                <button onClick={(e) => { e.stopPropagation(); toggleExpand(item.id) }}
                  className="p-1 text-gray-400 hover:text-gray-600 shrink-0">
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); setEditingItem(item); setDetailOpen(true) }}
                className="p-1 text-gray-400 hover:text-green-600 shrink-0">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); setCurrent((prev) => ({ ...prev, items: prev.items.filter((x) => x.id !== item.id) })) }}
                className="p-1 text-gray-400 hover:text-red-500 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {isExpanded && item.description && (
              <div className="px-8 pb-3 border-t border-gray-100">
                <MarkdownRenderer content={item.description} className="text-sm" />
              </div>
            )}
          </div>
        )}
      </Draggable>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <input
              value={current.title}
              onChange={(e) => setCurrent((prev) => ({ ...prev, title: e.target.value }))}
              className="text-lg font-bold text-gray-900 bg-transparent focus:outline-none focus:border-b border-orange-300 w-full"
              placeholder="Título da lista"
            />
            <p className="text-sm text-gray-500 mt-0.5">{total} item{total !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex border border-orange-200 rounded-md overflow-hidden bg-white/70">
            <button onClick={() => setEditorTab('items')}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${editorTab === 'items' ? 'bg-orange-500 text-white' : 'text-orange-600 hover:bg-orange-50'}`}>
              Itens
            </button>
            <button onClick={() => setEditorTab('map')}
              className={`px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors ${editorTab === 'map' ? 'bg-orange-500 text-white' : 'text-orange-600 hover:bg-orange-50'}`}>
              <Network className="w-3.5 h-3.5" /> Mapa
            </button>
          </div>
        </div>
      </div>

      {editorTab === 'map' ? (
        <ListaMindMap
          lista={current}
          onItemClick={(item) => { setEditingItem(item); setDetailOpen(true) }}
        />
      ) : (
      <>
      {/* Quick-add bar */}
      <div className="flex gap-2">
        <Input
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          placeholder="Adicionar item... (Enter para criar)"
          onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd() }}
          className="flex-1"
        />
        <Button size="sm" onClick={handleQuickAdd} disabled={!quickAdd.trim()} variant="outline">
          <Plus className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setEditingItem(undefined); setDetailOpen(true) }} title="Novo item com notas">
          <Edit2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Groups */}
      <div className="flex items-center gap-2 flex-wrap">
        <FolderPlus className="w-4 h-4 text-gray-400" />
        {current.grupos.map((g) => (
          <div key={g.id} className="flex items-center gap-1 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1">
            <span className="text-xs text-orange-700 font-medium">{g.title}</span>
            <button onClick={() => setCurrent((prev) => ({
              ...prev,
              grupos: prev.grupos.filter((x) => x.id !== g.id),
              items: prev.items.map((item) => item.grupoId === g.id ? { ...item, grupoId: undefined } : item),
            }))} className="text-orange-400 hover:text-red-500">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <div className="flex gap-1">
          <Input value={newGrupo} onChange={(e) => setNewGrupo(e.target.value)} placeholder="Novo grupo" className="h-7 text-xs w-28"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGrupo() } }} />
          <Button size="sm" onClick={addGrupo} disabled={!newGrupo.trim()} className="h-7 text-xs px-2">
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Items DnD */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="items">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
              {grouped.map((g) => g.items.length > 0 && (
                <div key={g.group.id}>
                  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide px-1 mb-1">{g.group.title}</p>
                  {g.items.map((item) => renderItem(item, allItemsOrdered.findIndex((x) => x.id === item.id)))}
                </div>
              ))}
              {ungrouped.length > 0 && (
                <div>
                  {current.grupos.length > 0 && (
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-1">Sem grupo</p>
                  )}
                  {ungrouped.map((item) => renderItem(item, allItemsOrdered.findIndex((x) => x.id === item.id)))}
                </div>
              )}
              {current.items.length === 0 && (
                <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                  <List className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum item. Digite acima e pressione Enter.</p>
                </div>
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      </>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onClose}>Voltar</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      <ItemDetailDialog
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setEditingItem(undefined) }}
        onSave={handleItemSave}
        initial={editingItem}
        grupos={current.grupos}
      />
    </div>
  )
}

// ─── Mind map ──────────────────────────────────────────────────────────────

function extractWikiLinks(text: string): string[] {
  return Array.from(text.matchAll(/\[\[([^\]]+)\]\]/g), (m) => m[1])
}

interface SimNode { id: string; label: string; isRoot: boolean }
interface SimEdge { source: string; target: string; isMain: boolean }

function computeLayout(
  nodes: SimNode[], edges: SimEdge[], width: number, height: number,
): Map<string, { x: number; y: number }> {
  const cx = width / 2, cy = height / 2
  const itemNodes = nodes.filter((n) => !n.isRoot)
  const positions = new Map<string, { x: number; y: number }>()

  nodes.forEach((node) => {
    if (node.isRoot) { positions.set(node.id, { x: cx, y: cy }); return }
    const idx = itemNodes.findIndex((n) => n.id === node.id)
    const angle = (2 * Math.PI * idx) / Math.max(itemNodes.length, 1) - Math.PI / 2
    const r = Math.min(width, height) * 0.36
    positions.set(node.id, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r })
  })

  const wikiEdges = edges.filter((e) => !e.isMain)
  if (wikiEdges.length > 0) {
    for (let iter = 0; iter < 200; iter++) {
      const forces = new Map<string, { fx: number; fy: number }>()
      nodes.forEach((n) => forces.set(n.id, { fx: 0, fy: 0 }))
      const cooling = Math.max(0, 1 - iter / 220)

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const pi = positions.get(nodes[i].id)!
          const pj = positions.get(nodes[j].id)!
          const dx = pi.x - pj.x, dy = pi.y - pj.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = 5000 / (dist * dist)
          const fi = forces.get(nodes[i].id)!, fj = forces.get(nodes[j].id)!
          fi.fx += (dx / dist) * force; fi.fy += (dy / dist) * force
          fj.fx -= (dx / dist) * force; fj.fy -= (dy / dist) * force
        }
      }

      edges.forEach(({ source, target, isMain }) => {
        const ps = positions.get(source), pt = positions.get(target)
        if (!ps || !pt) return
        const dx = pt.x - ps.x, dy = pt.y - ps.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const ideal = isMain ? 160 : 90
        const k = isMain ? 0.02 : 0.07
        const force = (dist - ideal) * k
        const fs = forces.get(source)!, ft = forces.get(target)!
        fs.fx += (dx / dist) * force; fs.fy += (dy / dist) * force
        ft.fx -= (dx / dist) * force; ft.fy -= (dy / dist) * force
      })

      nodes.forEach((node) => {
        if (node.isRoot) { positions.set(node.id, { x: cx, y: cy }); return }
        const p = positions.get(node.id)!, f = forces.get(node.id)!
        f.fx += (cx - p.x) * 0.01; f.fy += (cy - p.y) * 0.01
        positions.set(node.id, {
          x: Math.max(50, Math.min(width - 50, p.x + f.fx * cooling)),
          y: Math.max(35, Math.min(height - 35, p.y + f.fy * cooling)),
        })
      })
    }
  }

  return positions
}

function ListaMindMap({ lista, onItemClick }: {
  lista: ListaSimples
  onItemClick: (item: ListaSimpleItem) => void
}) {
  const W = 700, H = 430

  const nodes: SimNode[] = useMemo(() => [
    { id: 'root', label: lista.title, isRoot: true },
    ...lista.items.map((item) => ({ id: item.id, label: item.title, isRoot: false })),
  ], [lista.title, lista.items])

  const edges: SimEdge[] = useMemo(() => {
    const result: SimEdge[] = []
    lista.items.forEach((item) => result.push({ source: 'root', target: item.id, isMain: true }))
    lista.items.forEach((item) => {
      extractWikiLinks(item.description ?? '').forEach((title) => {
        const target = lista.items.find((i) => i.title.toLowerCase() === title.toLowerCase())
        if (target) result.push({ source: item.id, target: target.id, isMain: false })
      })
    })
    return result
  }, [lista.items])

  const positions = useMemo(() => computeLayout(nodes, edges, W, H), [nodes, edges])

  const hasWikiEdges = edges.some((e) => !e.isMain)

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
      {!hasWikiEdges && lista.items.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
          Adicione <code className="bg-amber-100 px-1 rounded">[[título do item]]</code> nas notas dos itens para criar conexões no mapa.
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {/* Edges */}
        {edges.map((edge, i) => {
          const ps = positions.get(edge.source), pt = positions.get(edge.target)
          if (!ps || !pt) return null
          return (
            <line key={i}
              x1={ps.x} y1={ps.y} x2={pt.x} y2={pt.y}
              stroke={edge.isMain ? '#d1d5db' : '#f97316'}
              strokeWidth={edge.isMain ? 1 : 2}
              strokeDasharray={edge.isMain ? '4 3' : undefined}
              strokeOpacity={edge.isMain ? 0.6 : 0.85}
            />
          )
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const p = positions.get(node.id)
          if (!p) return null

          if (node.isRoot) {
            return (
              <g key={node.id} transform={`translate(${p.x},${p.y})`}>
                <circle r={38} fill="#f97316" stroke="#ea580c" strokeWidth={2} />
                <text textAnchor="middle" dominantBaseline="middle" fill="white"
                  fontSize={11} fontWeight="bold">
                  {node.label.length > 22 ? node.label.slice(0, 21) + '…' : node.label}
                </text>
              </g>
            )
          }

          const item = lista.items.find((i) => i.id === node.id)
          const hasLinks = extractWikiLinks(item?.description ?? '').length > 0
          const isLinked = edges.some((e) => !e.isMain && (e.source === node.id || e.target === node.id))

          return (
            <g key={node.id} transform={`translate(${p.x},${p.y})`}
              onClick={() => item && onItemClick(item)}
              style={{ cursor: 'pointer' }}>
              <circle r={30}
                fill={isLinked ? '#fff7ed' : 'white'}
                stroke={isLinked ? '#fb923c' : '#e5e7eb'}
                strokeWidth={isLinked ? 2 : 1}
              />
              {hasLinks && (
                <circle r={5} cx={22} cy={-22} fill="#fb923c" />
              )}
              <text textAnchor="middle" dominantBaseline="middle"
                fill="#374151" fontSize={9.5}>
                {node.label.length > 20 ? node.label.slice(0, 19) + '…' : node.label}
              </text>
            </g>
          )
        })}

        {lista.items.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="#9ca3af" fontSize={13}>
            Nenhum item nesta lista ainda.
          </text>
        )}
      </svg>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

export function ListasSimples() {
  const { isDemoMode } = useAuth()
  const { toasts, toast, dismiss } = useToast()
  const { register } = useWikiLinks()
  const [listas, setListas] = useState<ListaSimples[]>(isDemoMode ? DEMO : [])
  const [loading, setLoading] = useState(!isDemoMode)
  const [editing, setEditing] = useState<ListaSimples | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list')
  const [onlyStarred, setOnlyStarred] = useState(false)
  const [newListTitle, setNewListTitle] = useState('')

  useEffect(() => {
    if (isDemoMode) return
    loadListasSimples()
      .then((data) => { setListas(data); setLoading(false) })
      .catch((err: Error) => {
        toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' })
        setLoading(false)
      })
  }, [isDemoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    register(listas.map((l) => ({
      id: l.id, title: l.title, route: '/listas',
      module: 'listas' as const,
      wikiLinks: [
        ...extractWikiLinks(l.description ?? ''),
        ...l.items.flatMap((i) => extractWikiLinks(i.description ?? '')),
      ],
    })))
  }, [listas, register])

  function handleCreateList() {
    if (!newListTitle.trim()) return
    const now = new Date().toISOString()
    const newLista: ListaSimples = {
      id: crypto.randomUUID(), title: newListTitle.trim(),
      grupos: [], items: [], created_at: now, updated_at: now,
    }
    setNewListTitle('')
    setEditing(newLista)
  }

  async function handleSave(l: ListaSimples) {
    if (!isDemoMode) {
      try { await saveListaSimples(l) } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' }); return
      }
    }
    setListas((prev) => {
      const idx = prev.findIndex((x) => x.id === l.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = l; return next }
      return [l, ...prev]
    })
    setEditing(null)
    toast({ title: 'Lista salva' })
  }

  async function handleToggleStar(lista: ListaSimples) {
    const updated = { ...lista, starred: !lista.starred, updated_at: new Date().toISOString() }
    if (!isDemoMode) {
      try { await saveListaSimples(updated) } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' }); return
      }
    }
    setListas((prev) => prev.map((l) => l.id === lista.id ? updated : l))
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta lista?')) return
    if (!isDemoMode) {
      try { await deleteListaSimples(id) } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast({ title: 'Erro ao excluir', description: msg, variant: 'destructive' }); return
      }
    }
    setListas((prev) => prev.filter((l) => l.id !== id))
    toast({ title: 'Lista excluída' })
  }

  if (editing) {
    return (
      <div className="animate-fade-in space-y-6">
        <ToastContainer toasts={toasts} onDismiss={dismiss} />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <List className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{editing.title || 'Nova lista'}</h1>
            <p className="text-sm text-gray-500">Editando lista</p>
          </div>
        </div>
        <ListaEditor lista={editing} onSave={handleSave} onClose={() => setEditing(null)} />
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <List className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Listas e Memorandos</h1>
            <p className="text-sm text-gray-500">{listas.length} lista{listas.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex border border-gray-200 rounded-md overflow-hidden">
          <button onClick={() => setViewMode('list')}
            className={`px-2.5 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-green-50 text-green-600' : 'text-gray-500 hover:bg-gray-50'}`}>
            <ListIcon className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('cards')}
            className={`px-2.5 py-1.5 transition-colors ${viewMode === 'cards' ? 'bg-green-50 text-green-600' : 'text-gray-500 hover:bg-gray-50'}`}>
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick-create bar */}
      <div className="flex gap-2">
        <Input
          value={newListTitle}
          onChange={(e) => setNewListTitle(e.target.value)}
          placeholder="Nova lista... (Enter para criar)"
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreateList() }}
          className="flex-1"
        />
        <Button
          variant={onlyStarred ? 'default' : 'outline'}
          onClick={() => setOnlyStarred((v) => !v)}
          className={onlyStarred ? 'bg-amber-400 hover:bg-amber-500 border-amber-400' : ''}
          title="Mostrar apenas favoritas"
        >
          <Star className={`w-4 h-4 ${onlyStarred ? 'fill-white text-white' : 'text-amber-400'}`} />
        </Button>
        <Button onClick={handleCreateList} disabled={!newListTitle.trim()}>
          <Plus className="w-4 h-4" /> Criar
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
      ) : listas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <List className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma lista ainda. Digite acima para criar a primeira!</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listas.filter((l) => !onlyStarred || l.starred).map((lista) => (
            <Card key={lista.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setEditing(lista)}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900">{lista.title}</h3>
                    {lista.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{lista.description}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-gray-400">{lista.items.length} item{lista.items.length !== 1 ? 's' : ''}</span>
                      {lista.grupos.length > 0 && (
                        <Badge variant="secondary" className="text-xs">{lista.grupos.length} grupo{lista.grupos.length > 1 ? 's' : ''}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">{formatDate(lista.updated_at.split('T')[0])}</p>
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleToggleStar(lista)}
                      className={`p-1.5 rounded-md transition-colors ${lista.starred ? 'text-amber-400 hover:text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
                      title={lista.starred ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}>
                      <Star className={`w-4 h-4 ${lista.starred ? 'fill-amber-400' : ''}`} />
                    </button>
                    <button onClick={() => setEditing(lista)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(lista.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        // List view (default)
        <Card>
          <CardContent className="pt-3 pb-2">
            {listas.filter((l) => !onlyStarred || l.starred).map((lista) => (
              <div key={lista.id} className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0 group cursor-pointer"
                onClick={() => setEditing(lista)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-medium text-gray-900 truncate">{lista.title}</p>
                    <span className="text-xs text-gray-400 shrink-0">{lista.items.length} itens</span>
                  </div>
                  {lista.description && <p className="text-xs text-gray-500 truncate mt-0.5">{lista.description}</p>}
                </div>
                <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => handleToggleStar(lista)}
                    className={`p-1.5 rounded-md transition-colors ${lista.starred ? 'text-amber-400 hover:text-amber-500' : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-amber-400'}`}
                    title={lista.starred ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}>
                    <Star className={`w-3.5 h-3.5 ${lista.starred ? 'fill-amber-400' : ''}`} />
                  </button>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditing(lista)} className="p-1.5 text-gray-400 hover:text-green-600 rounded-md transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(lista.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-md transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

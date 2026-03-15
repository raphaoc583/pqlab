import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Network } from 'lucide-react'
import { useWikiLinks } from '@/contexts/WikiLinkContext'
import type { WikiEntry } from '@/contexts/WikiLinkContext'

// ─── Types ─────────────────────────────────────────────────────────────────

type NodeType = 'content' | 'concept'

interface GraphNode {
  id: string
  label: string
  type: NodeType
  module?: WikiEntry['module']
  x: number
  y: number
  vx: number
  vy: number
  pinned: boolean
}

interface GraphEdge {
  source: string
  target: string
}

// ─── Colors ────────────────────────────────────────────────────────────────

const MODULE_COLOR: Record<WikiEntry['module'], string> = {
  diario: '#f59e0b',
  listas: '#f97316',
  tarefas: '#ec4899',
  bookmarks: '#3b82f6',
  fichamentos: '#22c55e',
  planos: '#a855f7',
}

const MODULE_LABEL: Record<WikiEntry['module'], string> = {
  diario: 'Diário de Campo',
  listas: 'Listas e Memorandos',
  tarefas: 'Tarefas',
  bookmarks: 'Favoritos',
  fichamentos: 'Fichamentos',
  planos: 'Planos',
}

const CONCEPT_COLOR = '#94a3b8'
const NODE_RADIUS_CONTENT = 10
const NODE_RADIUS_CONCEPT = 7

// ─── Graph builder ─────────────────────────────────────────────────────────

function buildGraph(
  entries: WikiEntry[],
  W: number,
  H: number,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const withLinks = entries.filter((e) => e.wikiLinks.length > 0).slice(0, 200)

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const conceptSet = new Set<string>()

  const cx = W / 2
  const cy = H / 2

  withLinks.forEach((entry, i) => {
    const angle = (i / withLinks.length) * 2 * Math.PI
    const r = Math.min(W, H) * 0.2 + Math.random() * Math.min(W, H) * 0.1
    const nodeId = `content:${entry.module}:${entry.id}`
    nodes.push({
      id: nodeId,
      label: entry.title,
      type: 'content',
      module: entry.module,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      vx: 0, vy: 0, pinned: false,
    })

    entry.wikiLinks.forEach((link) => {
      const conceptId = `concept:${link.toLowerCase()}`
      if (!conceptSet.has(conceptId)) {
        conceptSet.add(conceptId)
        nodes.push({
          id: conceptId,
          label: link,
          type: 'concept',
          x: cx + (Math.random() - 0.5) * Math.min(W, H) * 0.3,
          y: cy + (Math.random() - 0.5) * Math.min(W, H) * 0.3,
          vx: 0, vy: 0, pinned: false,
        })
      }
      edges.push({ source: nodeId, target: conceptId })
    })
  })

  return { nodes, edges }
}

// ─── Force simulation hook ─────────────────────────────────────────────────

function useForceSimulation(
  initialNodes: GraphNode[],
  edges: GraphEdge[],
  W: number,
  H: number,
) {
  const nodesRef = useRef<GraphNode[]>(initialNodes)
  const [tick, setTick] = useState(0)
  const frameRef = useRef(0)
  const activeRef = useRef(true)
  const frameCountRef = useRef(0)

  useEffect(() => {
    nodesRef.current = initialNodes.map((n) => ({ ...n }))
  }, [initialNodes])

  useEffect(() => {
    activeRef.current = true

    function step() {
      if (!activeRef.current) return
      const nodes = nodesRef.current
      const nodeMap = new Map(nodes.map((n) => [n.id, n]))
      const cx = W / 2
      const cy = H / 2

      // Repulsion (O(n²) — acceptable for ≤ 300 nodes)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]
          const b = nodes[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const d2 = dx * dx + dy * dy + 1
          const d = Math.sqrt(d2)
          const force = 3000 / d2
          const fx = (dx / d) * force
          const fy = (dy / d) * force
          if (!a.pinned) { a.vx -= fx; a.vy -= fy }
          if (!b.pinned) { b.vx += fx; b.vy += fy }
        }
      }

      // Spring (edges)
      edges.forEach(({ source, target }) => {
        const a = nodeMap.get(source)
        const b = nodeMap.get(target)
        if (!a || !b) return
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const restLen = 120
        const stretch = d - restLen
        const k = 0.04
        const fx = (dx / d) * stretch * k
        const fy = (dy / d) * stretch * k
        if (!a.pinned) { a.vx += fx; a.vy += fy }
        if (!b.pinned) { b.vx -= fx; b.vy -= fy }
      })

      // Gravity toward center
      nodes.forEach((n) => {
        if (n.pinned) return
        n.vx += (cx - n.x) * 0.002
        n.vy += (cy - n.y) * 0.002
      })

      // Integrate + damp
      nodes.forEach((n) => {
        if (n.pinned) return
        n.vx *= 0.85
        n.vy *= 0.85
        n.x += n.vx
        n.y += n.vy
        // Clamp to canvas
        n.x = Math.max(16, Math.min(W - 16, n.x))
        n.y = Math.max(16, Math.min(H - 16, n.y))
      })

      frameCountRef.current++
      if (frameCountRef.current % 3 === 0) setTick((t) => t + 1)

      frameRef.current = requestAnimationFrame(step)
    }

    frameRef.current = requestAnimationFrame(step)
    return () => {
      activeRef.current = false
      cancelAnimationFrame(frameRef.current)
    }
  }, [edges, W, H])

  return { nodesRef, tick }
}

// ─── Main component ─────────────────────────────────────────────────────────

export function MapaConhecimento() {
  const { getEntries } = useWikiLinks()
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 900, h: 600 })

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setSize({ w: rect.width || 900, h: rect.height || 600 })
      }
    }
    update()
    const ro = new ResizeObserver(update)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const entries = getEntries()
  const { nodes: initNodes, edges } = useMemo(
    () => buildGraph(entries, size.w, size.h),
    // rebuild only when entry ids or size change, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries.map((e) => e.id).join(','), size.w, size.h],
  )

  const { nodesRef, tick } = useForceSimulation(initNodes, edges, size.w, size.h)

  // Drag state
  const dragRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    const node = nodesRef.current.find((n) => n.id === nodeId)
    if (!node) return
    node.pinned = true
    dragRef.current = { nodeId, offsetX: e.clientX - node.x, offsetY: e.clientY - node.y }
  }, [nodesRef])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return
    const node = nodesRef.current.find((n) => n.id === dragRef.current!.nodeId)
    if (!node) return
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    node.x = e.clientX - rect.left
    node.y = e.clientY - rect.top
    node.vx = 0
    node.vy = 0
  }, [nodesRef])

  const handleMouseUp = useCallback(() => {
    if (!dragRef.current) return
    const node = nodesRef.current.find((n) => n.id === dragRef.current!.nodeId)
    if (node) node.pinned = false
    dragRef.current = null
  }, [nodesRef])

  const nodes = nodesRef.current
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  if (entries.length === 0 || initNodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <Network className="w-16 h-16 text-indigo-300" />
        <h2 className="text-xl font-semibold text-gray-700">Nenhuma conexão encontrada</h2>
        <p className="text-sm text-gray-500 max-w-md">
          Para visualizar o mapa de conhecimento, adicione{' '}
          <span className="font-mono bg-orange-50 border border-orange-200 text-orange-700 px-1.5 py-0.5 rounded text-xs">
            [[links internos]]
          </span>{' '}
          nos campos de texto dos seus conteúdos. Dois itens que compartilham o mesmo link interno
          ficam conectados neste mapa.
        </p>
      </div>
    )
  }

  const usedModules = [...new Set(
    nodes.filter((n) => n.type === 'content' && n.module).map((n) => n.module!)
  )]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-white">
        <Network className="w-5 h-5 text-indigo-600" />
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Visualização em Mapa</h1>
          <p className="text-xs text-gray-500">
            {nodes.filter((n) => n.type === 'content').length} conteúdos ·{' '}
            {nodes.filter((n) => n.type === 'concept').length} conceitos ·{' '}
            {edges.length} conexões
          </p>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative bg-gray-50 overflow-hidden">
        <svg
          width={size.w}
          height={size.h}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: dragRef.current ? 'grabbing' : 'default' }}
        >
          {/* Edges */}
          <g>
            {edges.map((e, i) => {
              const s = nodeMap.get(e.source)
              const t = nodeMap.get(e.target)
              if (!s || !t) return null
              return (
                <line
                  key={i}
                  x1={s.x} y1={s.y}
                  x2={t.x} y2={t.y}
                  stroke="#cbd5e1"
                  strokeWidth={1}
                  strokeOpacity={0.6}
                />
              )
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map((node) => {
              const r = node.type === 'content' ? NODE_RADIUS_CONTENT : NODE_RADIUS_CONCEPT
              const fill = node.type === 'concept'
                ? CONCEPT_COLOR
                : MODULE_COLOR[node.module!] ?? CONCEPT_COLOR
              const maxLabel = 18
              const label = node.label.length > maxLabel
                ? node.label.slice(0, maxLabel - 1) + '…'
                : node.label

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  onMouseDown={(e) => handleMouseDown(e, node.id)}
                  style={{ cursor: 'grab' }}
                >
                  <circle
                    r={r}
                    fill={fill}
                    stroke="white"
                    strokeWidth={1.5}
                    fillOpacity={node.type === 'concept' ? 0.7 : 1}
                  />
                  <text
                    y={r + 11}
                    textAnchor="middle"
                    fontSize={node.type === 'concept' ? 9 : 10}
                    fill={node.type === 'concept' ? '#64748b' : '#1e293b'}
                    fontWeight={node.type === 'content' ? '500' : 'normal'}
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                  >
                    {label}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>

        {/* Legend */}
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 shadow-sm p-3 text-xs space-y-1.5">
          <p className="font-semibold text-gray-700 mb-2">Legenda</p>
          {usedModules.map((m) => (
            <div key={m} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: MODULE_COLOR[m] }} />
              <span className="text-gray-600">{MODULE_LABEL[m]}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-slate-300" style={{ background: CONCEPT_COLOR, opacity: 0.7 }} />
            <span className="text-gray-500">Conceito / Link interno</span>
          </div>
        </div>

        {/* Hint */}
        <p className="absolute top-3 left-4 text-xs text-gray-400 select-none">
          Arraste os nós para reorganizar
        </p>
      </div>
    </div>
  )
}

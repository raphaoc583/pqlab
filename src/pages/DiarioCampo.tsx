import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { BookOpen, Plus, Search, Edit2, Trash2, Download, FileText, Table2, Image as ImageIcon, Calendar, ChevronDown, ChevronUp, X, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ToastContainer } from '@/components/ui/toast'
import { MarkdownEditor, MarkdownRenderer } from '@/components/shared/MarkdownEditor'
import { useAuth } from '@/contexts/AuthContext'
import { useWikiLinks, extractWikiLinks } from '@/contexts/WikiLinkContext'
import { useToast } from '@/hooks/useToast'
import { loadDiario, saveDiarioEntry, deleteDiarioEntry, uploadAnexo } from '@/lib/storage'
import { formatDate, todayISO } from '@/lib/utils'
import type { DiarioEntry, Anexo } from '@/types'

// ─── Demo data ────────────────────────────────────────────────────────────

const DEMO: DiarioEntry[] = [
  {
    id: '1', date: '2026-03-10', title: 'Visita ao arquivo histórico',
    content: '## Observações\n\nPrimeira visita ao arquivo. Encontrei documentos do século XIX relacionados à [[memória coletiva]] e à temática da pesquisa.\n\n- Caixa 14: cartas de 1887\n- Caixa 22: registros paroquiais\n\nRelação com [[arquivo histórico]] e [[identidade]] local.\n\n> "A memória é o tesouro e guardião de todas as coisas." — Cícero',
    attachments: [], created_at: '2026-03-10T10:00:00Z', updated_at: '2026-03-10T10:00:00Z',
  },
  {
    id: '2', date: '2026-03-05', title: 'Entrevista com informante #1',
    content: '## Perfil\n\nIdade: 72 anos. Natural de Campos dos Goytacazes.\n\n## Pontos principais\n\nFalou sobre as práticas da [[memória coletiva]] da comunidade nos anos 60. Importante: mencionar a questão da [[identidade]] e da terra.',
    attachments: [], created_at: '2026-03-05T14:30:00Z', updated_at: '2026-03-05T14:30:00Z',
  },
]

// ─── Export helpers ────────────────────────────────────────────────────────

function toPlainText(md: string) {
  return md.replace(/[#*_~`>[\]]/g, '').replace(/\n+/g, ' ').trim().slice(0, 200)
}

function exportXLS(entries: DiarioEntry[]) {
  const wb = XLSX.utils.book_new()
  const rows = entries.map((e) => ({
    Data: formatDate(e.date),
    Título: e.title,
    Conteúdo: toPlainText(e.content),
    Criado: new Date(e.created_at).toLocaleString('pt-BR'),
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Diário')
  XLSX.writeFile(wb, 'diario-campo.xlsx')
}

function exportPDF(entries: DiarioEntry[]) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('Diário de Campo', 14, 20)
  autoTable(doc, {
    startY: 28,
    head: [['Data', 'Título', 'Descrição']],
    body: entries.map((e) => [formatDate(e.date), e.title, toPlainText(e.content)]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [79, 70, 229] },
  })
  doc.save('diario-campo.pdf')
}

function exportMarkdown(entries: DiarioEntry[]) {
  const md = entries
    .map((e) => `# ${e.title}\n\n**Data:** ${formatDate(e.date)}\n\n${e.content}\n\n---`)
    .join('\n\n')
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'diario-campo.md'; a.click()
  URL.revokeObjectURL(url)
}

function exportEntryMarkdown(entry: DiarioEntry) {
  const md = `# ${entry.title}\n\n**Data:** ${formatDate(entry.date)}\n\n${entry.content}`
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `diario-${entry.date}-${entry.id}.md`; a.click()
  URL.revokeObjectURL(url)
}

function exportEntryPDF(entry: DiarioEntry) {
  const doc = new jsPDF()
  doc.setFontSize(16); doc.text(entry.title, 14, 20)
  doc.setFontSize(10); doc.setTextColor(100)
  doc.text(`Data: ${formatDate(entry.date)}`, 14, 30)
  doc.setTextColor(0)
  const lines = doc.splitTextToSize(toPlainText(entry.content), 180)
  doc.setFontSize(11)
  doc.text(lines, 14, 42)
  doc.save(`diario-${entry.date}.pdf`)
}

// ─── Entry form dialog ────────────────────────────────────────────────────

interface EntryFormProps {
  open: boolean
  onClose: () => void
  onSave: (entry: DiarioEntry) => void
  initial?: DiarioEntry
  isDemoMode: boolean
  entryId?: string
}

function EntryForm({ open, onClose, onSave, initial, isDemoMode, entryId }: EntryFormProps) {
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [attachments, setAttachments] = useState<Anexo[]>(initial?.attachments ?? [])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setDate(initial?.date ?? todayISO())
      setTitle(initial?.title ?? '')
      setContent(initial?.content ?? '')
      setAttachments(initial?.attachments ?? [])
    }
  }, [open, initial])

  const id = entryId ?? initial?.id ?? crypto.randomUUID()

  async function handleImageUpload(file: File): Promise<string> {
    if (isDemoMode) return URL.createObjectURL(file)
    setUploading(true)
    try {
      const anexo = await uploadAnexo('diario', id, file)
      setAttachments((prev) => [...prev, anexo])
      return anexo.url ?? ''
    } finally {
      setUploading(false)
    }
  }

  async function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    if (isDemoMode) {
      const fakes = files.map((f) => ({ id: crypto.randomUUID(), name: f.name, size: f.size, type: f.type, path: '', url: URL.createObjectURL(f) }))
      setAttachments((prev) => [...prev, ...fakes])
      return
    }
    setUploading(true)
    try {
      const uploaded = await Promise.all(files.map((f) => uploadAnexo('diario', id, f)))
      setAttachments((prev) => [...prev, ...uploaded])
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function handleSubmit() {
    if (!title.trim()) return
    const now = new Date().toISOString()
    onSave({
      id,
      date,
      title: title.trim(),
      content,
      attachments,
      created_at: initial?.created_at ?? now,
      updated_at: now,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar entrada' : 'Nova entrada no diário'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="entry-date">Data</Label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  id="entry-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-title">Título</Label>
              <Input
                id="entry-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título da entrada"
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Conteúdo</Label>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="Escreva suas anotações de campo..."
              minHeight={300}
              onImageUpload={handleImageUpload}
            />
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Anexos</Label>
              <div className="flex gap-2">
                <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={handleFileAttach} />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <ImageIcon className="w-3.5 h-3.5" />
                  {uploading ? 'Enviando...' : 'Anexar arquivo'}
                </Button>
              </div>
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <div key={a.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                    {a.type.startsWith('image/') && a.url && (
                      <img src={a.url} alt={a.name} className="w-8 h-8 rounded object-cover" />
                    )}
                    <span className="text-xs text-gray-700 max-w-[120px] truncate">{a.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!title.trim()}>
            {initial ? 'Salvar alterações' : 'Criar entrada'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

export function DiarioCampo() {
  const { isDemoMode } = useAuth()
  const { toasts, toast, dismiss } = useToast()
  const { register } = useWikiLinks()
  const [entries, setEntries] = useState<DiarioEntry[]>(isDemoMode ? DEMO : [])
  const [loading, setLoading] = useState(!isDemoMode)
  const [search, setSearch] = useState('')
  const [onlyStarred, setOnlyStarred] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DiarioEntry | undefined>()
  const [newId] = useState(() => crypto.randomUUID())
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (isDemoMode) return
    loadDiario()
      .then((data) => { setEntries(data); setLoading(false) })
      .catch((err: Error) => {
        toast({ title: 'Erro ao carregar diário', description: err.message, variant: 'destructive' })
        setLoading(false)
      })
  }, [isDemoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    register(entries.map((e) => ({
      id: e.id, title: e.title, route: '/diario',
      module: 'diario' as const,
      wikiLinks: extractWikiLinks(e.content),
    })))
  }, [entries, register])

  const filtered = entries.filter((e) => {
    if (onlyStarred && !e.starred) return false
    if (!search) return true
    const q = search.toLowerCase()
    return e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q) || e.date.includes(q)
  })

  async function handleSave(entry: DiarioEntry) {
    if (!isDemoMode) {
      try {
        await saveDiarioEntry(entry)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' })
        return
      }
    }
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === entry.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = entry
        return next.sort((a, b) => b.date.localeCompare(a.date))
      }
      return [entry, ...prev].sort((a, b) => b.date.localeCompare(a.date))
    })
    setFormOpen(false)
    setEditing(undefined)
    toast({ title: editing ? 'Entrada atualizada' : 'Entrada criada' })
  }

  async function handleToggleStar(entry: DiarioEntry) {
    const updated = { ...entry, starred: !entry.starred, updated_at: new Date().toISOString() }
    if (!isDemoMode) {
      try { await saveDiarioEntry(updated) } catch { /* silent */ }
    }
    setEntries((prev) => prev.map((e) => e.id === updated.id ? updated : e))
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta entrada?')) return
    if (!isDemoMode) {
      try { await deleteDiarioEntry(id) } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast({ title: 'Erro ao excluir', description: msg, variant: 'destructive' }); return
      }
    }
    setEntries((prev) => prev.filter((e) => e.id !== id))
    toast({ title: 'Entrada excluída' })
  }

  return (
    <div className="animate-fade-in space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Diário de Campo</h1>
            <p className="text-sm text-gray-500">{entries.length} {entries.length === 1 ? 'entrada' : 'entradas'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportXLS(filtered)}>
            <Table2 className="w-4 h-4" /> XLS
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF(filtered)}>
            <Download className="w-4 h-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportMarkdown(filtered)}>
            <FileText className="w-4 h-4" /> .md
          </Button>
          <Button onClick={() => { setEditing(undefined); setFormOpen(true) }}>
            <Plus className="w-4 h-4" /> Nova entrada
          </Button>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar entradas..." className="pl-9" />
        </div>
        <button
          onClick={() => setOnlyStarred((v) => !v)}
          title={onlyStarred ? 'Mostrar todas' : 'Somente favoritas'}
          className={`flex items-center gap-1.5 px-3 rounded-md border text-sm font-medium transition-colors ${
            onlyStarred
              ? 'bg-amber-50 border-amber-300 text-amber-600'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          <Star className={`w-4 h-4 ${onlyStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
          Favoritas
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-amber-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? 'Nenhuma entrada encontrada.' : 'Nenhuma entrada ainda. Crie a primeira!'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => {
            const expanded = expandedId === entry.id
            const imageAttachments = entry.attachments.filter((a) => a.type.startsWith('image/'))
            return (
              <Card key={entry.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs shrink-0">
                          {formatDate(entry.date)}
                        </Badge>
                        {entry.attachments.length > 0 && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {entry.attachments.length} anexo{entry.attachments.length > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-900">{entry.title}</h3>
                      {!expanded && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{toPlainText(entry.content)}</p>
                      )}
                      {/* Image thumbnails */}
                      {imageAttachments.length > 0 && !expanded && (
                        <div className="flex gap-2 mt-2">
                          {imageAttachments.slice(0, 4).map((a) => (
                            a.url && (
                              <img key={a.id} src={a.url} alt={a.name} className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                            )
                          ))}
                          {imageAttachments.length > 4 && (
                            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                              +{imageAttachments.length - 4}
                            </div>
                          )}
                        </div>
                      )}
                      {expanded && (
                        <div className="mt-3">
                          <MarkdownRenderer content={entry.content} />
                          {entry.attachments.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-xs font-medium text-gray-500 mb-2">Anexos</p>
                              <div className="flex flex-wrap gap-2">
                                {entry.attachments.map((a) => (
                                  <a key={a.id} href={a.url ?? '#'} target="_blank" rel="noreferrer"
                                    className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-100 transition-colors">
                                    {a.type.startsWith('image/') && a.url && (
                                      <img src={a.url} alt={a.name} className="w-8 h-8 rounded object-cover" />
                                    )}
                                    <span className="text-xs text-gray-700 max-w-[120px] truncate">{a.name}</span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <button
                        onClick={() => handleToggleStar(entry)}
                        title={entry.starred ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                        className="p-1.5 rounded-md transition-colors hover:bg-amber-50"
                      >
                        <Star className={`w-4 h-4 ${entry.starred ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-amber-400'}`} />
                      </button>
                      <button
                        onClick={() => exportEntryMarkdown(entry)}
                        title="Exportar .md"
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => exportEntryPDF(entry)}
                        title="Exportar PDF"
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setEditing(entry); setFormOpen(true) }}
                        title="Editar"
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        title="Excluir"
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setExpandedId(expanded ? null : entry.id)}
                        title={expanded ? 'Recolher' : 'Expandir'}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                      >
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Form dialog */}
      <EntryForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(undefined) }}
        onSave={handleSave}
        initial={editing}
        isDemoMode={isDemoMode}
        entryId={editing ? editing.id : newId}
      />
    </div>
  )
}

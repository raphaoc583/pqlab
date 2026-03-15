import { useState, useEffect, useRef } from 'react'
import {
  Bookmark, Plus, Search, LayoutGrid, List as ListIcon, Edit2, Trash2,
  ExternalLink, Rss, Link2, FileText, X, Globe, BookOpen, Calendar,
  RefreshCw, ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToastContainer } from '@/components/ui/toast'
import { useAuth } from '@/contexts/AuthContext'
import { useWikiLinks, extractWikiLinks } from '@/contexts/WikiLinkContext'
import { useToast } from '@/hooks/useToast'
import { loadBookmarks, saveBookmark, deleteBookmark, loadRssFeeds, saveRssFeed, deleteRssFeed, uploadAnexo } from '@/lib/storage'
import { formatDate } from '@/lib/utils'
import type { Bookmark as BookmarkType, RssFeed, RssItem, Anexo } from '@/types'

// ─── Demo data ────────────────────────────────────────────────────────────

const DEMO_BOOKMARKS: BookmarkType[] = [
  { id: '1', type: 'url', url: 'https://www.scielo.br', title: 'SciELO - Scientific Electronic Library Online', description: 'Biblioteca virtual que abrange uma coleção selecionada de periódicos científicos brasileiros.', image: 'https://www.scielo.br/img/revistas/logos/seriea.gif', tags: ['ciência', 'periódicos'], attachments: [], created_at: '2026-03-10T10:00:00Z', updated_at: '2026-03-10T10:00:00Z' },
  { id: '2', type: 'doi', doi: '10.1590/S0102-69092010000200002', url: 'https://doi.org/10.1590/S0102-69092010000200002', title: 'Metodologia da pesquisa qualitativa', description: 'Artigo sobre fundamentos da pesquisa qualitativa em ciências sociais.', authors: ['Turato, E. R.'], year: 2010, journal: 'Cadernos de Saúde Pública', tags: ['metodologia', 'qualitativa'], attachments: [], created_at: '2026-03-08T09:00:00Z', updated_at: '2026-03-08T09:00:00Z' },
  { id: '3', type: 'file', title: 'Relatório de campo 2025', description: 'PDF com relatório das atividades de campo do ano anterior.', attachments: [], created_at: '2026-03-01T15:00:00Z', updated_at: '2026-03-01T15:00:00Z' },
]

const DEMO_RSS: RssFeed[] = [
  { id: '1', url: 'https://export.arxiv.org/rss/cs.DL', title: 'arXiv – Digital Libraries', description: 'Novos artigos em Bibliotecas Digitais', created_at: '2026-03-01T00:00:00Z' },
]

// ─── Metadata fetchers ─────────────────────────────────────────────────────

async function fetchUrlMetadata(url: string): Promise<Partial<BookmarkType>> {
  try {
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
    const res = await fetch(proxy, { signal: AbortSignal.timeout(8000) })
    const data = await res.json() as { contents: string }
    const html = data.contents
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    const getMeta = (name: string) =>
      doc.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ??
      doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? ''

    const title = getMeta('og:title') || doc.title || url
    const description = getMeta('og:description') || getMeta('description') || ''
    const image = getMeta('og:image') || ''
    return { title, description, image }
  } catch {
    return { title: url }
  }
}

async function fetchDoiMetadata(doi: string): Promise<Partial<BookmarkType>> {
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json() as {
      message?: {
        title?: string[]
        abstract?: string
        author?: Array<{ given?: string; family?: string }>
        'published-print'?: { 'date-parts'?: number[][] }
        'published-online'?: { 'date-parts'?: number[][] }
        'container-title'?: string[]
        publisher?: string
      }
    }
    const msg = data.message ?? {}
    const title = (msg.title ?? [])[0] ?? doi
    const description = msg.abstract?.replace(/<[^>]+>/g, '') ?? ''
    const authors = (msg.author ?? []).map((a) => `${a.given ?? ''} ${a.family ?? ''}`.trim()).filter(Boolean)
    const yearParts = msg['published-print']?.['date-parts']?.[0] ?? msg['published-online']?.['date-parts']?.[0]
    const year = yearParts?.[0]
    const journal = msg['container-title']?.[0] ?? msg.publisher
    return { title, description, url: `https://doi.org/${doi}`, authors, year, journal }
  } catch {
    return { title: doi, url: `https://doi.org/${doi}` }
  }
}

function parseRssXml(xmlText: string, feedId: string): RssItem[] {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'application/xml')
    if (doc.querySelector('parsererror')) {
      // Try text/html as fallback parse mode
      const doc2 = parser.parseFromString(xmlText, 'text/html')
      if (!doc2.querySelector('item, entry')) return []
    }
    // RSS 2.0 items
    const rssItems = Array.from(doc.querySelectorAll('item'))
    if (rssItems.length > 0) {
      return rssItems.slice(0, 30).map((item) => ({
        id: crypto.randomUUID(), feedId,
        title: item.querySelector('title')?.textContent?.trim() ?? '',
        link: item.querySelector('link')?.textContent?.trim() ||
              item.querySelector('link')?.getAttribute('href') || '',
        description: item.querySelector('description')?.textContent
          ?.replace(/<[^>]+>/g, '').slice(0, 300).trim() ?? undefined,
        pubDate: item.querySelector('pubDate')?.textContent?.trim() ?? undefined,
        image: item.querySelector('enclosure[type^="image"]')?.getAttribute('url') ?? undefined,
        content: (item.querySelector('encoded') ?? item.getElementsByTagNameNS('http://purl.org/rss/1.0/modules/content/', 'encoded')[0])?.textContent ?? undefined,
      })).filter((i) => i.title)
    }
    // Atom entries
    const atomEntries = Array.from(doc.querySelectorAll('entry'))
    if (atomEntries.length > 0) {
      return atomEntries.slice(0, 30).map((entry) => ({
        id: crypto.randomUUID(), feedId,
        title: entry.querySelector('title')?.textContent?.trim() ?? '',
        link: entry.querySelector('link[rel="alternate"]')?.getAttribute('href') ||
              entry.querySelector('link')?.getAttribute('href') || '',
        description: entry.querySelector('summary, content')?.textContent
          ?.replace(/<[^>]+>/g, '').slice(0, 300).trim() ?? undefined,
        pubDate: entry.querySelector('published, updated')?.textContent?.trim() ?? undefined,
        image: undefined, content: undefined,
      })).filter((i) => i.title)
    }
  } catch { /* ignore */ }
  return []
}

async function fetchRssItems(feedUrl: string, feedId: string): Promise<RssItem[]> {
  function isChallengeHtml(text: string) {
    return text.includes('bunny-shield') || text.includes('Establishing a secure') ||
           text.includes('cf-browser-verification') || text.includes('Just a moment')
  }

  // Tier 1: codetabs.com CORS proxy — returns raw XML, very reliable
  try {
    const proxy = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(feedUrl)}`
    const res = await fetch(proxy, { signal: AbortSignal.timeout(12000) })
    if (res.ok) {
      const text = await res.text()
      if (!isChallengeHtml(text)) {
        const items = parseRssXml(text, feedId)
        if (items.length > 0) return items
      }
    }
  } catch { /* fall through */ }

  // Tier 2: rss2json.com — JSON API (no count param, free tier compatible)
  try {
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) })
    if (res.ok) {
      const data = await res.json() as {
        status: string
        items?: Array<{ title?: string; link?: string; pubDate?: string; description?: string; content?: string; thumbnail?: string }>
      }
      if (data.status === 'ok' && data.items?.length) {
        return data.items.map((item) => ({
          id: crypto.randomUUID(), feedId,
          title: item.title ?? '',
          link: item.link ?? '',
          description: item.description ? item.description.replace(/<[^>]+>/g, '').slice(0, 300).trim() : undefined,
          pubDate: item.pubDate ?? undefined,
          image: item.thumbnail ?? undefined,
          content: item.content ?? undefined,
        })).filter((i) => i.title)
      }
    }
  } catch { /* fall through */ }

  // Tier 3: allorigins /raw — direct XML response
  try {
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`
    const res = await fetch(proxy, { signal: AbortSignal.timeout(14000) })
    if (res.ok) {
      const text = await res.text()
      if (!isChallengeHtml(text)) {
        const items = parseRssXml(text, feedId)
        if (items.length > 0) return items
      }
    }
  } catch { /* fall through */ }

  // Tier 4: allorigins /get — JSON envelope
  try {
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(feedUrl)}`
    const res = await fetch(proxy, { signal: AbortSignal.timeout(14000) })
    if (res.ok) {
      const data = await res.json() as { contents: string }
      if (data.contents && !isChallengeHtml(data.contents)) {
        const items = parseRssXml(data.contents, feedId)
        if (items.length > 0) return items
      }
    }
  } catch { /* fall through */ }

  return []
}

// ─── Bookmark form dialog ──────────────────────────────────────────────────

interface BookmarkFormProps {
  open: boolean
  onClose: () => void
  onSave: (b: BookmarkType) => void
  initial?: BookmarkType
  isDemoMode: boolean
}

function BookmarkForm({ open, onClose, onSave, initial, isDemoMode }: BookmarkFormProps) {
  const [type, setType] = useState<'url' | 'doi' | 'file'>(
    initial?.type === 'rss' ? 'url' : (initial?.type ?? 'url')
  )
  const [urlInput, setUrlInput] = useState(initial?.url ?? '')
  const [doiInput, setDoiInput] = useState(initial?.doi ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [image, setImage] = useState(initial?.image ?? '')
  const [authorsInput, setAuthorsInput] = useState((initial?.authors ?? []).join('; '))
  const [year, setYear] = useState<string>(initial?.year?.toString() ?? '')
  const [journal, setJournal] = useState(initial?.journal ?? '')
  const [tagsInput, setTagsInput] = useState((initial?.tags ?? []).join(', '))
  const [attachments, setAttachments] = useState<Anexo[]>(initial?.attachments ?? [])
  const [fetching, setFetching] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const id = useRef(initial?.id ?? crypto.randomUUID()).current

  useEffect(() => {
    if (open) {
      setType(initial?.type === 'rss' ? 'url' : (initial?.type ?? 'url'))
      setUrlInput(initial?.url ?? '')
      setDoiInput(initial?.doi ?? '')
      setTitle(initial?.title ?? '')
      setDescription(initial?.description ?? '')
      setImage(initial?.image ?? '')
      setAuthorsInput((initial?.authors ?? []).join('; '))
      setYear(initial?.year?.toString() ?? '')
      setJournal(initial?.journal ?? '')
      setTagsInput((initial?.tags ?? []).join(', '))
      setAttachments(initial?.attachments ?? [])
    }
  }, [open, initial])

  async function handleFetch() {
    if (type === 'url' && urlInput) {
      setFetching(true)
      const meta = await fetchUrlMetadata(urlInput)
      if (meta.title) setTitle(meta.title)
      if (meta.description) setDescription(meta.description)
      if (meta.image) setImage(meta.image)
      setFetching(false)
    } else if (type === 'doi' && doiInput) {
      setFetching(true)
      const meta = await fetchDoiMetadata(doiInput)
      if (meta.title) setTitle(meta.title)
      if (meta.description) setDescription(meta.description)
      if (meta.url) setUrlInput(meta.url)
      if (meta.authors?.length) setAuthorsInput(meta.authors.join('; '))
      if (meta.year) setYear(String(meta.year))
      if (meta.journal) setJournal(meta.journal)
      setFetching(false)
    }
  }

  async function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    // Auto-set title from filename if empty
    if (!title.trim() && files[0]) {
      setTitle(files[0].name.replace(/\.[^.]+$/, ''))
    }
    if (isDemoMode) {
      const fakes = files.map((f) => ({
        id: crypto.randomUUID(), name: f.name, size: f.size, type: f.type, path: '', url: URL.createObjectURL(f),
      }))
      setAttachments((prev) => [...prev, ...fakes])
      e.target.value = ''; return
    }
    setUploading(true)
    try {
      const uploaded = await Promise.all(files.map((f) => uploadAnexo('bookmarks', id, f)))
      setAttachments((prev) => [...prev, ...uploaded])
    } finally { setUploading(false); e.target.value = '' }
  }

  function handleSubmit() {
    if (!title.trim()) return
    const now = new Date().toISOString()
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    const authors = authorsInput.split(';').map((a) => a.trim()).filter(Boolean)
    onSave({
      id, type,
      url: urlInput || undefined,
      doi: type === 'doi' ? doiInput || undefined : undefined,
      title: title.trim(),
      description: description || undefined,
      image: image || undefined,
      authors: authors.length ? authors : undefined,
      year: year ? parseInt(year) : undefined,
      journal: journal || undefined,
      tags,
      attachments,
      created_at: initial?.created_at ?? now,
      updated_at: now,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar favorito' : 'Novo favorito'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Type selector */}
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="flex gap-2">
              {(['url', 'doi', 'file'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${type === t ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {t === 'url' ? 'URL / Link' : t === 'doi' ? 'DOI' : 'Arquivo'}
                </button>
              ))}
            </div>
          </div>

          {type === 'url' && (
            <div className="space-y-1.5">
              <Label htmlFor="bm-url">URL</Label>
              <div className="flex gap-2">
                <Input id="bm-url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://..." className="flex-1" />
                <Button type="button" variant="outline" size="sm" onClick={handleFetch} disabled={!urlInput || fetching}>
                  {fetching ? '...' : 'Buscar'}
                </Button>
              </div>
            </div>
          )}

          {type === 'doi' && (
            <div className="space-y-1.5">
              <Label htmlFor="bm-doi">DOI</Label>
              <div className="flex gap-2">
                <Input id="bm-doi" value={doiInput} onChange={(e) => setDoiInput(e.target.value)} placeholder="10.xxxx/xxxxx" className="flex-1 font-mono" />
                <Button type="button" variant="outline" size="sm" onClick={handleFetch} disabled={!doiInput || fetching}>
                  {fetching ? '...' : 'Buscar'}
                </Button>
              </div>
              {(doiInput || initial?.doi) && (
                <p className="text-xs text-gray-400">URL: https://doi.org/{doiInput || initial?.doi}</p>
              )}
            </div>
          )}

          {type === 'file' && (
            <div className="space-y-1.5">
              <Label>Arquivo</Label>
              <div className="flex gap-2 items-center">
                <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleFileAttach} />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Enviando...' : 'Selecionar arquivo(s)'}
                </Button>
                {attachments.length > 0 && (
                  <span className="text-xs text-green-600">{attachments.length} arquivo(s) selecionado(s)</span>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="bm-title">Título *</Label>
            <Input id="bm-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do favorito" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bm-desc">Descrição</Label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição ou resumo..." rows={3}
              className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500" />
          </div>

          {/* Authors / Year / Journal for DOI or optional for others */}
          {(type === 'doi' || authorsInput || year || journal) && (
            <div className="space-y-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-xs font-semibold text-gray-500">Metadados bibliográficos</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Autor(es) (separados por ;)</Label>
                <Input value={authorsInput} onChange={(e) => setAuthorsInput(e.target.value)} placeholder="Sobrenome, Nome; Outro Autor" className="text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Ano</Label>
                  <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2024" className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Periódico / Livro</Label>
                  <Input value={journal} onChange={(e) => setJournal(e.target.value)} placeholder="Nome do periódico" className="text-sm" />
                </div>
              </div>
            </div>
          )}

          {image && (
            <div className="space-y-1.5">
              <Label>Pré-visualização</Label>
              <img src={image} alt="preview" className="w-full h-32 object-cover rounded-lg border border-gray-200"
                onError={() => setImage('')} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="bm-tags">Tags</Label>
            <Input id="bm-tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="tag1, tag2, tag3" />
          </div>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                  <span className="text-xs text-gray-700 max-w-[140px] truncate">{a.name}</span>
                  <button type="button" onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                    className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!title.trim()}>
            {initial ? 'Salvar' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── RSS Feed form ─────────────────────────────────────────────────────────

function RssFeedForm({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (f: RssFeed) => void }) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => { if (open) { setUrl(''); setTitle(''); setDescription('') } }, [open])

  function handleSubmit() {
    if (!url.trim() || !title.trim()) return
    const now = new Date().toISOString()
    onSave({ id: crypto.randomUUID(), url: url.trim(), title: title.trim(), description: description || undefined, created_at: now })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Assinar feed RSS</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rss-url">URL do feed</Label>
            <Input id="rss-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://exemplo.com/rss" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rss-title">Nome</Label>
            <Input id="rss-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome do feed" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rss-desc">Descrição (opcional)</Label>
            <Input id="rss-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!url.trim() || !title.trim()}>Assinar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Bookmark card ─────────────────────────────────────────────────────────

function BookmarkCard({ bookmark, onEdit, onDelete }: { bookmark: BookmarkType; onEdit: () => void; onDelete: () => void }) {
  const TypeIcon = bookmark.type === 'doi' ? BookOpen : bookmark.type === 'file' ? FileText : Globe

  return (
    <Card className="hover:shadow-md transition-shadow overflow-hidden">
      {bookmark.image && (
        <img src={bookmark.image} alt={bookmark.title} className="w-full h-36 object-cover"
          onError={(e) => (e.currentTarget.style.display = 'none')} />
      )}
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
            <TypeIcon className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 leading-snug line-clamp-2">{bookmark.title}</p>
            {(bookmark.authors?.length || bookmark.year || bookmark.journal) && (
              <p className="text-xs text-green-600 mt-0.5 line-clamp-1">
                {bookmark.authors?.slice(0, 2).join(', ')}{(bookmark.authors?.length ?? 0) > 2 ? ' et al.' : ''}
                {bookmark.year ? ` (${bookmark.year})` : ''}
                {bookmark.journal ? ` · ${bookmark.journal}` : ''}
              </p>
            )}
            {bookmark.description && (
              <p className="text-sm text-gray-500 mt-1 line-clamp-2">{bookmark.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {formatDate(bookmark.created_at.split('T')[0])}
              </span>
              {bookmark.doi && <Badge variant="outline" className="text-xs">DOI</Badge>}
              {(bookmark.tags ?? []).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1 ml-1 shrink-0">
            {bookmark.url && (
              <a href={bookmark.url} target="_blank" rel="noreferrer"
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors">
              <Edit2 className="w-4 h-4" />
            </button>
            <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        {bookmark.attachments.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1">
            {bookmark.attachments.map((a) => (
              <a key={a.id} href={a.url ?? '#'} target="_blank" rel="noreferrer"
                className="text-xs text-blue-600 hover:underline">{a.name}</a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BookmarkRow({ bookmark, onEdit, onDelete }: { bookmark: BookmarkType; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
        {bookmark.type === 'file' ? <FileText className="w-4 h-4 text-blue-600" /> : <Link2 className="w-4 h-4 text-blue-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{bookmark.title}</p>
        {(bookmark.authors?.length || bookmark.year || bookmark.journal) && (
          <p className="text-xs text-green-600 truncate">
            {bookmark.authors?.slice(0, 2).join(', ')}{(bookmark.authors?.length ?? 0) > 2 ? ' et al.' : ''}
            {bookmark.year ? ` (${bookmark.year})` : ''}
            {bookmark.journal ? ` · ${bookmark.journal}` : ''}
          </p>
        )}
        {bookmark.url && <p className="text-xs text-gray-400 truncate">{bookmark.url}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-gray-400 mr-2">{formatDate(bookmark.created_at.split('T')[0])}</span>
        {bookmark.url && (
          <a href={bookmark.url} target="_blank" rel="noreferrer" className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md transition-colors">
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-green-600 rounded-md transition-colors">
          <Edit2 className="w-4 h-4" />
        </button>
        <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded-md transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── RSS reader helpers ────────────────────────────────────────────────────

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

function ArticleDetail({ item, feedName, onBack }: { item: RssItem; feedName: string; onBack: () => void }) {
  const content = item.content ?? ''
  const hasContent = content.replace(/<[^>]+>/g, '').trim().length > 100

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">{feedName}</span>
          {item.pubDate && (
            <span className="text-xs text-gray-400">
              {new Date(item.pubDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </span>
          )}
          <a href={item.link} target="_blank" rel="noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center gap-0.5 ml-auto">
            <ExternalLink className="w-3 h-3" /> Abrir original
          </a>
        </div>
        <h1 className="text-xl font-bold text-gray-900 leading-snug mb-4">{item.title}</h1>
        {hasContent ? (
          <div className="prose text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
        ) : (
          <div>
            {item.description && <p className="text-gray-600 leading-relaxed mb-4">{item.description}</p>}
            <a href={item.link} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
              <ExternalLink className="w-4 h-4" /> Leia o artigo completo
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

export function Bookmarks() {
  const { isDemoMode } = useAuth()
  const { toasts, toast, dismiss } = useToast()
  const { register } = useWikiLinks()
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>(isDemoMode ? DEMO_BOOKMARKS : [])
  const [feeds, setFeeds] = useState<RssFeed[]>(isDemoMode ? DEMO_RSS : [])
  const [loading, setLoading] = useState(!isDemoMode)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')
  const [typeFilter, setTypeFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [rssFormOpen, setRssFormOpen] = useState(false)
  const [editing, setEditing] = useState<BookmarkType | undefined>()
  const [activeTab, setActiveTab] = useState('bookmarks')
  const [rssItems, setRssItems] = useState<Record<string, RssItem[]>>({})
  const [fetchingFeeds, setFetchingFeeds] = useState<Set<string>>(new Set())
  const [selectedFeed, setSelectedFeed] = useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<RssItem | null>(null)
  const rssInitFetchDone = useRef(false)

  useEffect(() => {
    if (isDemoMode) return
    Promise.all([loadBookmarks(), loadRssFeeds()])
      .then(([bms, fds]) => { setBookmarks(bms); setFeeds(fds); setLoading(false) })
      .catch((err: Error) => {
        toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' })
        setLoading(false)
      })
  }, [isDemoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    register(bookmarks.map((b) => ({
      id: b.id, title: b.title, route: '/bookmarks',
      module: 'bookmarks' as const,
      wikiLinks: extractWikiLinks(b.description ?? ''),
    })))
  }, [bookmarks, register])

  useEffect(() => {
    if (activeTab !== 'rss') return
    if (rssInitFetchDone.current) return
    if (feeds.length === 0) return
    rssInitFetchDone.current = true
    feeds.forEach((feed) => {
      setFetchingFeeds((prev) => new Set([...prev, feed.id]))
      fetchRssItems(feed.url, feed.id).then((items) => {
        setRssItems((prev) => ({ ...prev, [feed.id]: items }))
        setFetchingFeeds((prev) => { const next = new Set(prev); next.delete(feed.id); return next })
      })
    })
  }, [activeTab, feeds]) // eslint-disable-line react-hooks/exhaustive-deps

  const allTags = Array.from(new Set(bookmarks.flatMap((b) => b.tags ?? []))).sort()

  const filtered = bookmarks.filter((b) => {
    const matchSearch = !search ||
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      (b.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (b.url ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (b.authors ?? []).some((a) => a.toLowerCase().includes(search.toLowerCase()))
    const matchType = typeFilter === 'all' || b.type === typeFilter
    const matchTag = !tagFilter || (b.tags ?? []).includes(tagFilter)
    return matchSearch && matchType && matchTag
  })

  async function handleSave(b: BookmarkType) {
    if (!isDemoMode) {
      try { await saveBookmark(b) } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' }); return
      }
    }
    setBookmarks((prev) => {
      const idx = prev.findIndex((x) => x.id === b.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = b; return next }
      return [b, ...prev]
    })
    setFormOpen(false); setEditing(undefined)
    toast({ title: editing ? 'Favorito atualizado' : 'Favorito adicionado' })
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este favorito?')) return
    if (!isDemoMode) {
      try { await deleteBookmark(id) } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast({ title: 'Erro ao excluir', description: msg, variant: 'destructive' }); return
      }
    }
    setBookmarks((prev) => prev.filter((b) => b.id !== id))
    toast({ title: 'Favorito excluído' })
  }

  async function handleSaveFeed(feed: RssFeed) {
    if (!isDemoMode) {
      try { await saveRssFeed(feed) } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast({ title: 'Erro ao salvar feed', description: msg, variant: 'destructive' }); return
      }
    }
    setFeeds((prev) => [feed, ...prev])
    setRssFormOpen(false)
    toast({ title: 'Feed RSS adicionado' })
  }

  async function handleDeleteFeed(id: string) {
    if (!confirm('Remover este feed?')) return
    if (!isDemoMode) {
      try { await deleteRssFeed(id) } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast({ title: 'Erro ao excluir', description: msg, variant: 'destructive' }); return
      }
    }
    setFeeds((prev) => prev.filter((f) => f.id !== id))
    toast({ title: 'Feed removido' })
  }

  async function handleFetchFeed(feed: RssFeed) {
    setFetchingFeeds((prev) => new Set([...prev, feed.id]))
    const items = await fetchRssItems(feed.url, feed.id)
    setRssItems((prev) => ({ ...prev, [feed.id]: items }))
    setFetchingFeeds((prev) => { const next = new Set(prev); next.delete(feed.id); return next })
    if (items.length === 0) {
      toast({ title: 'Nenhum item encontrado', description: 'Verifique a URL do feed.', variant: 'destructive' })
    } else {
      toast({ title: `${items.length} artigos carregados` })
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Bookmark className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Favoritos</h1>
            <p className="text-sm text-gray-500">{bookmarks.length} item{bookmarks.length !== 1 ? 's' : ''} salvos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setRssFormOpen(true)}>
            <Rss className="w-4 h-4" /> RSS
          </Button>
          <Button onClick={() => { setEditing(undefined); setFormOpen(true) }}>
            <Plus className="w-4 h-4" /> Novo favorito
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="bookmarks">Favoritos ({bookmarks.length})</TabsTrigger>
          <TabsTrigger value="rss">RSS ({feeds.length})</TabsTrigger>
        </TabsList>

        {/* ─ Bookmarks tab ─ */}
        <TabsContent value="bookmarks" className="space-y-4 mt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar favoritos..." className="pl-9" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="url">URL</SelectItem>
                <SelectItem value="doi">DOI</SelectItem>
                <SelectItem value="file">Arquivo</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex border border-gray-200 rounded-md overflow-hidden">
              <button onClick={() => setViewMode('cards')}
                className={`px-2.5 py-1.5 transition-colors ${viewMode === 'cards' ? 'bg-green-50 text-green-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('list')}
                className={`px-2.5 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-green-50 text-green-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                <ListIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tag filter pills */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                    tagFilter === tag
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Bookmark className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{search ? 'Nenhum resultado encontrado.' : 'Nenhum favorito ainda. Adicione o primeiro!'}</p>
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((b) => (
                <BookmarkCard key={b.id} bookmark={b}
                  onEdit={() => { setEditing(b); setFormOpen(true) }}
                  onDelete={() => handleDelete(b.id)} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-4 pb-2">
                {filtered.map((b) => (
                  <BookmarkRow key={b.id} bookmark={b}
                    onEdit={() => { setEditing(b); setFormOpen(true) }}
                    onDelete={() => handleDelete(b.id)} />
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─ RSS tab ─ */}
        <TabsContent value="rss" className="mt-4">
          {feeds.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Rss className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum feed RSS assinado. Clique em RSS para adicionar.</p>
            </div>
          ) : (
            <div className="flex border border-gray-200 rounded-xl overflow-hidden min-h-[520px]">
              {/* Left: feeds sidebar */}
              <div className="w-52 border-r border-gray-200 bg-gray-50 flex flex-col flex-shrink-0">
                <div className="p-2.5 border-b border-gray-200">
                  <button
                    onClick={() => { setSelectedFeed(null); setSelectedArticle(null) }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedFeed === null ? 'bg-white shadow-sm font-semibold text-gray-900' : 'text-gray-600 hover:bg-white/70'}`}
                  >
                    Todos
                    <span className="ml-1.5 text-xs text-gray-400">
                      ({Object.values(rssItems).flat().length})
                    </span>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                  {feeds.map((feed) => (
                    <div
                      key={feed.id}
                      onClick={() => { setSelectedFeed(feed.id); setSelectedArticle(null) }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setSelectedFeed(feed.id); setSelectedArticle(null) } }}
                      className={`w-full cursor-pointer px-3 py-2 rounded-lg text-sm transition-colors group flex items-center gap-1.5 ${selectedFeed === feed.id ? 'bg-white shadow-sm font-semibold text-gray-900' : 'text-gray-600 hover:bg-white/70'}`}
                    >
                      <span className="flex-1 truncate">{feed.title}</span>
                      {fetchingFeeds.has(feed.id) ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-gray-400 flex-shrink-0" />
                      ) : (
                        <>
                          <span className="text-xs text-gray-400 flex-shrink-0">{rssItems[feed.id]?.length ?? 0}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleFetchFeed(feed) }}
                            className="p-0.5 text-gray-300 hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            title="Atualizar feed"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteFeed(feed.id) }}
                        className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        title="Remover feed"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="p-2.5 border-t border-gray-200">
                  <button
                    onClick={() => setRssFormOpen(true)}
                    className="w-full text-sm text-green-600 hover:text-green-700 flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-green-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar feed
                  </button>
                </div>
              </div>

              {/* Right: article list or detail */}
              {selectedArticle ? (
                <ArticleDetail
                  item={selectedArticle}
                  feedName={feeds.find((f) => f.id === selectedArticle.feedId)?.title ?? ''}
                  onBack={() => setSelectedArticle(null)}
                />
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {(() => {
                    const items = selectedFeed
                      ? (rssItems[selectedFeed] ?? [])
                      : Object.values(rssItems).flat()
                    if (items.length === 0) {
                      return (
                        <div className="flex items-center justify-center h-full py-16 text-gray-400">
                          <div className="text-center">
                            <Rss className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">
                              {fetchingFeeds.size > 0 ? 'Carregando artigos...' : 'Nenhum artigo encontrado.'}
                            </p>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div className="divide-y divide-gray-100">
                        {items.map((item) => {
                          const feedName = feeds.find((f) => f.id === item.feedId)?.title ?? ''
                          return (
                            <button
                              key={item.id}
                              onClick={() => setSelectedArticle(item)}
                              className="w-full text-left p-4 hover:bg-gray-50 transition-colors flex gap-3"
                            >
                              {item.image && (
                                <img src={item.image} alt="" className="w-20 h-14 object-cover rounded-lg flex-shrink-0"
                                  onError={(e) => (e.currentTarget.style.display = 'none')} />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">{feedName}</span>
                                  {item.pubDate && (
                                    <span className="text-xs text-gray-400">
                                      {new Date(item.pubDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{item.title}</p>
                                {item.description && (
                                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <BookmarkForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(undefined) }}
        onSave={handleSave}
        initial={editing}
        isDemoMode={isDemoMode}
      />
      <RssFeedForm open={rssFormOpen} onClose={() => setRssFormOpen(false)} onSave={handleSaveFeed} />
    </div>
  )
}

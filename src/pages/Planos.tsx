import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import {
  CalendarDays, Plus, Edit2, Trash2, Download, FileText, Table2, GripVertical,
  ChevronDown, ChevronUp, BookOpen, X, Check, Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToastContainer } from '@/components/ui/toast'
import { MarkdownEditor } from '@/components/shared/MarkdownEditor'
import { useAuth } from '@/contexts/AuthContext'
import { useWikiLinks, extractWikiLinks } from '@/contexts/WikiLinkContext'
import { useToast } from '@/hooks/useToast'
import { loadPlanos, savePlano, deletePlano } from '@/lib/storage'
import { formatDate, generateDates } from '@/lib/utils'
import type { Plano, PlanoAula, PlanoModulo, PlanoRef } from '@/types'

// ─── Demo data ────────────────────────────────────────────────────────────

const DEMO: Plano[] = [
  {
    id: '1', disciplina: 'Introdução à Sociologia', professores: ['João Silva'],
    ementa: 'Fundamentos da teoria sociológica clássica e contemporânea.',
    avaliacao: 'Prova (40%) + Trabalho final (60%)', periodo: '2026/1',
    recursos: ['https://classroom.google.com/c/abc123'],
    weekdays: [2], frequency: 'weekly',
    startDate: '2026-03-10', endDate: '2026-06-30',
    modulos: [
      { id: 'm1', title: 'Fundamentos', description: 'Teorias clássicas', order: 0 },
      { id: 'm2', title: 'Contemporâneos', description: 'Perspectivas atuais', order: 1 },
    ],
    aulas: [
      { id: 'a1', date: '2026-03-10', title: 'Apresentação do curso', description: 'Apresentação da disciplina, objetivos e avaliações.', order: 0, moduleId: 'm1', references: [{ id: 'r1', title: 'A Imaginação Sociológica', authors: ['Mills'], year: 1959, type: 'mandatory' }] },
      { id: 'a2', date: '2026-03-17', title: 'Marx e o materialismo histórico', description: 'Conceitos fundamentais do marxismo: materialismo, alienação, luta de classes.', order: 1, moduleId: 'm1', references: [] },
      { id: 'a3', date: '2026-03-24', title: 'Weber e a racionalização', description: 'Ação social, tipos ideais, ética protestante.', order: 2, moduleId: 'm1', references: [] },
    ],
    created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
  },
]

// ─── Weekday names ─────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const WEEKDAY_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

// ─── Export helpers ────────────────────────────────────────────────────────

function exportPlanoMarkdown(p: Plano) {
  const lines: string[] = [
    `# ${p.disciplina}`, '',
    `**Período:** ${p.periodo}  `,
    `**Integrantes:** ${p.professores.join(', ')}  `,
    `**Método:** ${p.avaliacao}`, '',
    '## Descrição', '', p.ementa, '',
    '## Plano de Aulas', '',
  ]
  for (const aula of p.aulas) {
    lines.push(`### ${formatDate(aula.date)} — ${aula.title}`, '')
    if (aula.description) lines.push(aula.description, '')
    if (aula.references.length > 0) {
      lines.push('**Referências:**')
      for (const r of aula.references) {
        lines.push(`- [${r.type === 'mandatory' ? 'Obrigatório' : 'Complementar'}] ${r.title}${r.authors?.length ? ` — ${r.authors.join(', ')}` : ''}${r.year ? ` (${r.year})` : ''}`)
      }
      lines.push('')
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `plano-${p.id}.md`; a.click(); URL.revokeObjectURL(url)
}

function exportPlanoXLS(p: Plano) {
  const wb = XLSX.utils.book_new()
  const rows = p.aulas.map((a) => ({
    Data: formatDate(a.date), Título: a.title,
    Descrição: a.description.replace(/[#*_~`]/g, '').slice(0, 200),
    Módulo: p.modulos.find((m) => m.id === a.moduleId)?.title ?? '',
    Obrigatórias: a.references.filter((r) => r.type === 'mandatory').map((r) => r.title).join('; '),
    Complementares: a.references.filter((r) => r.type === 'complementary').map((r) => r.title).join('; '),
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Aulas')
  XLSX.writeFile(wb, `plano-${p.id}.xlsx`)
}

function exportPlanoPDF(p: Plano) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 20
  const pageWidth = 210
  const pageHeight = 297
  const contentWidth = pageWidth - margin * 2
  let y = 0

  // ── Helper: lesson page running header (text only) ─────────────────────────
  function addLessonPageHeader() {
    y = 16
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(88, 28, 180)
    doc.text('PLANO DE AULAS', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(160, 160, 160)
    const shortTitle = p.disciplina.length > 50 ? p.disciplina.slice(0, 47) + '...' : p.disciplina
    doc.text(shortTitle, pageWidth - margin, y, { align: 'right' })
    y += 4
    doc.setDrawColor(210, 190, 240)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8
  }

  function ensureSpace(needed: number) {
    if (y + needed > 272) {
      doc.addPage()
      addLessonPageHeader()
    }
  }

  // ── Cover page (no background fill) ───────────────────────────────────────
  y = 40
  // "pqLAB" small centered
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(130, 90, 200)
  doc.text('pqLAB', pageWidth / 2, y, { align: 'center' })
  y += 7

  // Short ornamental line
  doc.setDrawColor(170, 130, 230)
  doc.setLineWidth(0.5)
  doc.line(pageWidth / 2 - 25, y, pageWidth / 2 + 25, y)
  y += 12

  // Course title
  const rawTitleLines = doc.splitTextToSize(p.disciplina || 'Plano de Curso', contentWidth)
  const titleFontSize = rawTitleLines.length > 2 ? 18 : 22
  doc.setFontSize(titleFontSize)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 5, 50)
  doc.text(rawTitleLines, pageWidth / 2, y, { align: 'center' })
  y += rawTitleLines.length * (titleFontSize * 0.4) + 8

  // Period
  if (p.periodo) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.setTextColor(110, 75, 175)
    doc.text(p.periodo, pageWidth / 2, y, { align: 'center' })
    y += 8
  }

  y += 8
  doc.setDrawColor(210, 190, 240)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageWidth - margin, y)
  y += 10

  // Professors
  if (p.professores.length > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(140, 140, 140)
    doc.text('INTEGRANTES', margin, y)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(35, 35, 35)
    doc.text(p.professores.join(', '), margin, y)
    y += 8
  }

  // Evaluation
  if (p.avaliacao) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(140, 140, 140)
    doc.text('MÉTODO', margin, y)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(35, 35, 35)
    const evalLines = doc.splitTextToSize(p.avaliacao, contentWidth)
    doc.text(evalLines, margin, y)
    y += evalLines.length * 4.5 + 8
  }

  // Ementa
  if (p.ementa) {
    doc.setDrawColor(220, 210, 240)
    doc.setLineWidth(0.2)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(140, 140, 140)
    doc.text('DESCRIÇÃO', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(60, 60, 60)
    const ementaLines = doc.splitTextToSize(p.ementa, contentWidth)
    doc.text(ementaLines, margin, y)
  }

  // ── Lesson plan pages ─────────────────────────────────────────────────────
  doc.addPage()
  addLessonPageHeader()

  let currentModuleId: string | undefined = '__none__'

  for (const aula of p.aulas) {
    ensureSpace(14)

    // Module label (text only, no background)
    if (aula.moduleId !== currentModuleId) {
      currentModuleId = aula.moduleId
      if (aula.moduleId) {
        const modulo = p.modulos.find((m) => m.id === aula.moduleId)
        if (modulo) {
          ensureSpace(10)
          // Small "MÓDULO" tag (stroke box, no fill)
          const tagLabel = 'MÓDULO'
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(6)
          doc.setTextColor(88, 28, 180)
          const tagW = doc.getTextWidth(tagLabel) + 3.5
          doc.setDrawColor(88, 28, 180)
          doc.setLineWidth(0.3)
          doc.roundedRect(margin, y - 3.8, tagW, 5, 0.8, 0.8, 'S')
          doc.text(tagLabel, margin + 1.75, y - 0.3)
          // Module title
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8.5)
          doc.setTextColor(60, 30, 140)
          doc.text(modulo.title, margin + tagW + 2.5, y)
          y += 7
        }
      }
    }

    // Date (colored text) + lesson title inline
    const dateStr = formatDate(aula.date)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(88, 28, 180)
    doc.text(dateStr, margin, y)

    const titleX = margin + doc.getTextWidth(dateStr) + 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(25, 25, 25)
    const aulaTitleLines = doc.splitTextToSize(aula.title || 'Aula sem título', contentWidth - (titleX - margin))
    doc.text(aulaTitleLines, titleX, y)
    y += Math.max(aulaTitleLines.length * 5, 5)

    // Description
    if (aula.description) {
      const clean = aula.description.replace(/[#*_~`>]/g, '').trim()
      if (clean) {
        const descLines = doc.splitTextToSize(clean, contentWidth - 4)
        ensureSpace(descLines.length * 4.3)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(80, 80, 80)
        doc.text(descLines, margin + 3, y)
        y += descLines.length * 4.3 + 1.5
      }
    }

    // References
    const mandatory = aula.references.filter((r) => r.type === 'mandatory')
    const complementary = aula.references.filter((r) => r.type === 'complementary')

    function drawRefTag(label: string, color: [number, number, number], xStart: number, yPos: number): number {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(5.5)
      doc.setTextColor(...color)
      const tw = doc.getTextWidth(label) + 3
      doc.setDrawColor(...color)
      doc.setLineWidth(0.25)
      doc.roundedRect(xStart, yPos - 3.5, tw, 4.5, 0.7, 0.7, 'S')
      doc.text(label, xStart + 1.5, yPos - 0.3)
      return xStart + tw + 2
    }

    if (mandatory.length > 0) {
      ensureSpace(6)
      const textX = drawRefTag('Leituras', [30, 80, 200], margin + 3, y)
      const refText = mandatory.map((r) => r.title + (r.year ? ` (${r.year})` : '')).join('; ')
      const lines = doc.splitTextToSize(refText, contentWidth - (textX - margin))
      ensureSpace(lines.length * 4)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(30, 80, 200)
      doc.text(lines, textX, y)
      y += lines.length * 4 + 1
    }
    if (complementary.length > 0) {
      ensureSpace(6)
      const textX = drawRefTag('Compl.', [180, 90, 20], margin + 3, y)
      const refText = complementary.map((r) => r.title + (r.year ? ` (${r.year})` : '')).join('; ')
      const lines = doc.splitTextToSize(refText, contentWidth - (textX - margin))
      ensureSpace(lines.length * 4)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(180, 90, 20)
      doc.text(lines, textX, y)
      y += lines.length * 4 + 1
    }

    y += 2
    doc.setDrawColor(225, 225, 225)
    doc.setLineWidth(0.2)
    doc.line(margin, y, pageWidth - margin, y)
    y += 5
  }

  // ── Page numbers on lesson pages only ─────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(180, 180, 180)
    doc.text(`${i - 1} / ${totalPages - 1}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
  }

  doc.save(`plano-${p.id}.pdf`)
}

// ─── Course setup wizard ───────────────────────────────────────────────────

interface SetupWizardProps {
  open: boolean
  onClose: () => void
  onSetup: (config: { weekdays: number[]; frequency: Plano['frequency']; startDate: string; endDate: string }) => void
}

function SetupWizard({ open, onClose, onSetup }: SetupWizardProps) {
  const [weekdays, setWeekdays] = useState<number[]>([2]) // Terça default
  const [frequency, setFrequency] = useState<Plano['frequency']>('weekly')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  function toggleDay(d: number) {
    setWeekdays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort())
  }

  const previewDates = startDate && endDate && weekdays.length > 0
    ? generateDates(startDate, endDate, weekdays, frequency)
    : []

  function handleConfirm() {
    if (!startDate || !endDate || weekdays.length === 0) return
    onSetup({ weekdays, frequency, startDate, endDate })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar calendário do curso</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Weekday selector (alarm-clock style) */}
          <div className="space-y-2">
            <Label>Dias da semana</Label>
            <div className="flex gap-2">
              {WEEKDAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-semibold border-2 transition-colors ${
                    weekdays.includes(i)
                      ? 'bg-purple-100 border-purple-400 text-purple-700'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Frequency selector */}
          <div className="space-y-1.5">
            <Label>Periodicidade</Label>
            <div className="grid grid-cols-3 gap-2">
              {([['weekly', 'Semanal'], ['biweekly', 'Quinzenal'], ['monthly', 'Mensal']] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setFrequency(val)}
                  className={`py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                    frequency === val
                      ? 'bg-purple-100 border-purple-400 text-purple-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sw-start">Início</Label>
              <Input id="sw-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sw-end">Fim</Label>
              <Input id="sw-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {previewDates.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-purple-700 mb-2">Prévia: {previewDates.length} aulas</p>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {previewDates.map((d) => (
                  <span key={d} className="text-xs bg-white border border-purple-200 rounded px-1.5 py-0.5 text-purple-600">{formatDate(d)}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!startDate || !endDate || weekdays.length === 0}>
            <Check className="w-4 h-4" /> Gerar calendário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Plano metadata dialog ─────────────────────────────────────────────────

interface PlanoMetaProps {
  open: boolean
  onClose: () => void
  onSave: (meta: Partial<Plano>) => void
  initial?: Plano
}

function PlanoMeta({ open, onClose, onSave, initial }: PlanoMetaProps) {
  const [disciplina, setDisciplina] = useState(initial?.disciplina ?? '')
  const [professores, setProfessores] = useState((initial?.professores ?? []).join(', '))
  const [ementa, setEmenta] = useState(initial?.ementa ?? '')
  const [avaliacao, setAvaliacao] = useState(initial?.avaliacao ?? '')
  const [periodo, setPeriodo] = useState(initial?.periodo ?? '')
  const [recursos, setRecursos] = useState((initial?.recursos ?? []).join('\n'))

  useEffect(() => {
    if (open) {
      setDisciplina(initial?.disciplina ?? '')
      setProfessores((initial?.professores ?? []).join(', '))
      setEmenta(initial?.ementa ?? '')
      setAvaliacao(initial?.avaliacao ?? '')
      setPeriodo(initial?.periodo ?? '')
      setRecursos((initial?.recursos ?? []).join('\n'))
    }
  }, [open, initial])

  function handleSave() {
    if (!disciplina.trim()) return
    onSave({
      disciplina: disciplina.trim(),
      professores: professores.split(',').map((p) => p.trim()).filter(Boolean),
      ementa,
      avaliacao,
      periodo,
      recursos: recursos.split('\n').map((r) => r.trim()).filter(Boolean),
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Informações do plano</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={disciplina} onChange={(e) => setDisciplina(e.target.value)} placeholder="Ex.: Introdução à Sociologia" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Integrantes</Label>
              <Input value={professores} onChange={(e) => setProfessores(e.target.value)} placeholder="Prof. A, Prof. B" />
            </div>
            <div className="space-y-1.5">
              <Label>Período letivo</Label>
              <Input value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="2026/1" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <textarea value={ementa} onChange={(e) => setEmenta(e.target.value)} rows={3} placeholder="Descrição..."
              className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500" />
          </div>
          <div className="space-y-1.5">
            <Label>Método</Label>
            <Input value={avaliacao} onChange={(e) => setAvaliacao(e.target.value)} placeholder="Ex.: Prova (50%) + Trabalho (50%)" />
          </div>
          <div className="space-y-1.5">
            <Label>Recursos adicionais (um por linha)</Label>
            <textarea value={recursos} onChange={(e) => setRecursos(e.target.value)} rows={3} placeholder="https://classroom.google.com/..."
              className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!disciplina.trim()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Reference adder ──────────────────────────────────────────────────────

function RefAdder({ refs, onChange }: { refs: PlanoRef[]; onChange: (refs: PlanoRef[]) => void }) {
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [year, setYear] = useState('')
  const [type, setType] = useState<PlanoRef['type']>('mandatory')

  function add() {
    if (!title.trim()) return
    onChange([...refs, {
      id: crypto.randomUUID(), title: title.trim(),
      authors: authors.split(',').map((a) => a.trim()).filter(Boolean),
      year: year ? parseInt(year) : undefined, type,
    }])
    setTitle(''); setAuthors(''); setYear('')
  }

  return (
    <div className="space-y-2">
      {refs.length > 0 && (
        <div className="space-y-1">
          {refs.map((r) => (
            <div key={r.id} className={`flex items-center gap-2 px-2 py-1 rounded text-xs border ${r.type === 'mandatory' ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-orange-50 border-orange-200 text-orange-800'}`}>
              <span className="flex-1 truncate">{r.title}{r.authors?.length ? ` — ${r.authors.join(', ')}` : ''}{r.year ? ` (${r.year})` : ''}</span>
              <button type="button" onClick={() => onChange(refs.filter((x) => x.id !== r.id))} className="opacity-60 hover:opacity-100">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5 items-end flex-wrap">
        <div className="flex-1 min-w-40">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da referência" className="h-8 text-xs" />
        </div>
        <Input value={authors} onChange={(e) => setAuthors(e.target.value)} placeholder="Autor(es)" className="h-8 text-xs w-28" />
        <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Ano" className="h-8 text-xs w-16" type="number" />
        <Select value={type} onValueChange={(v) => setType(v as PlanoRef['type'])}>
          <SelectTrigger className="h-8 text-xs w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mandatory">Obrigatória</SelectItem>
            <SelectItem value="complementary">Complementar</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" size="sm" onClick={add} disabled={!title.trim()} className="h-8 text-xs">
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    </div>
  )
}

// ─── Aula row (editable) ──────────────────────────────────────────────────

function AulaRow({
  aula, index, modulos, onChange, onDelete,
}: {
  aula: PlanoAula; index: number; modulos: PlanoModulo[];
  onChange: (updated: PlanoAula) => void; onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false)
  const [localTitle, setLocalTitle] = useState(aula.title)
  const [localDesc, setLocalDesc] = useState(aula.description)

  return (
    <Draggable draggableId={aula.id} index={index}>
      {(provided) => (
        <div ref={provided.innerRef} {...provided.draggableProps} className="border border-gray-200 rounded-lg bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <div {...provided.dragHandleProps} className="text-gray-300 hover:text-gray-500 cursor-grab">
              <GripVertical className="w-4 h-4" />
            </div>
            <span className="text-xs font-mono text-gray-400 w-20 shrink-0">{formatDate(aula.date)}</span>
            <input
              value={localTitle}
              onChange={(e) => { setLocalTitle(e.target.value); onChange({ ...aula, title: e.target.value }) }}
              placeholder="Título da aula"
              className="flex-1 text-sm font-medium text-gray-900 bg-transparent focus:outline-none focus:bg-white focus:border-b border-green-300 py-0.5"
            />
            <select
              value={aula.moduleId ?? ''}
              onChange={(e) => onChange({ ...aula, moduleId: e.target.value || undefined })}
              className="text-xs text-gray-500 bg-transparent border border-gray-200 rounded px-1 py-0.5 max-w-24"
            >
              <option value="">Sem módulo</option>
              {modulos.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
            <button onClick={() => setExpanded(!expanded)} className="p-1 text-gray-400 hover:text-gray-600">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          </div>

          {expanded && (
            <div className="px-3 pb-3 pt-0 space-y-3 border-t border-gray-100">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">Descrição</label>
                <MarkdownEditor
                  value={localDesc}
                  onChange={(v) => { setLocalDesc(v); onChange({ ...aula, description: v }) }}
                  placeholder="Descrição da aula..."
                  minHeight={120}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">Referências bibliográficas</label>
                <RefAdder refs={aula.references} onChange={(refs) => onChange({ ...aula, references: refs })} />
              </div>
            </div>
          )}
        </div>
      )}
    </Draggable>
  )
}

// ─── Plano editor ──────────────────────────────────────────────────────────

function PlanoEditor({ plano, onSave, onCancel }: { plano: Plano; onSave: (p: Plano) => void; onCancel: () => void }) {
  const [current, setCurrent] = useState<Plano>(plano)
  const [metaOpen, setMetaOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [newModulo, setNewModulo] = useState('')
  const [saving, setSaving] = useState(false)

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    const aulas = Array.from(current.aulas)
    const [moved] = aulas.splice(result.source.index, 1)
    aulas.splice(result.destination.index, 0, moved)
    // Reassign dates based on order but keep all original dates sorted
    const sortedDates = [...current.aulas].map((a) => a.date).sort()
    const reordered = aulas.map((a, i) => ({ ...a, order: i, date: sortedDates[i] ?? a.date }))
    setCurrent((prev) => ({ ...prev, aulas: reordered }))
  }

  function handleAulaChange(updated: PlanoAula) {
    setCurrent((prev) => ({
      ...prev,
      aulas: prev.aulas.map((a) => a.id === updated.id ? updated : a),
    }))
  }

  function handleAddModulo() {
    if (!newModulo.trim()) return
    const m: PlanoModulo = {
      id: crypto.randomUUID(),
      title: newModulo.trim(),
      order: current.modulos.length,
    }
    setCurrent((prev) => ({ ...prev, modulos: [...prev.modulos, m] }))
    setNewModulo('')
  }

  function handleSetup(config: { weekdays: number[]; frequency: Plano['frequency']; startDate: string; endDate: string }) {
    const dates = generateDates(config.startDate, config.endDate, config.weekdays, config.frequency)
    const aulas: PlanoAula[] = dates.map((d, i) => {
      const existing = current.aulas.find((a) => a.date === d)
      return existing ?? { id: crypto.randomUUID(), date: d, title: '', description: '', order: i, references: [] }
    })
    setCurrent((prev) => ({
      ...prev,
      weekdays: config.weekdays,
      frequency: config.frequency,
      startDate: config.startDate,
      endDate: config.endDate,
      aulas,
    }))
    setSetupOpen(false)
  }

  async function handleSave() {
    setSaving(true)
    await onSave({ ...current, updated_at: new Date().toISOString() })
    setSaving(false)
  }

  const weekdayLabel = current.weekdays.map((d) => WEEKDAY_FULL[d]).join(', ')
  const freqLabel = { weekly: 'Semanal', biweekly: 'Quinzenal', monthly: 'Mensal' }[current.frequency]

  return (
    <div className="space-y-4">
      {/* Plan header */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{current.disciplina || 'Sem título'}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {current.periodo && <span className="mr-3">Período: {current.periodo}</span>}
              {current.professores.length > 0 && <span>Integrantes: {current.professores.join(', ')}</span>}
            </p>
            {weekdayLabel && (
              <p className="text-xs text-gray-400 mt-1">
                {weekdayLabel} · {freqLabel} · {formatDate(current.startDate)} – {formatDate(current.endDate)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setMetaOpen(true)}>
              <Settings className="w-4 h-4" /> Informações
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSetupOpen(true)}>
              <CalendarDays className="w-4 h-4" /> Calendário
            </Button>
          </div>
        </div>
      </div>

      {/* Módulos */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Módulos</span>
          <div className="flex gap-2 flex-1">
            <Input value={newModulo} onChange={(e) => setNewModulo(e.target.value)} placeholder="Nome do módulo" className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddModulo() } }} />
            <Button size="sm" onClick={handleAddModulo} disabled={!newModulo.trim()} className="h-8">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        {current.modulos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {current.modulos.map((m) => (
              <div key={m.id} className="flex items-center gap-1 bg-purple-50 border border-purple-200 rounded-lg px-2 py-1">
                <span className="text-xs text-purple-700 font-medium">{m.title}</span>
                <button onClick={() => setCurrent((prev) => ({ ...prev, modulos: prev.modulos.filter((x) => x.id !== m.id), aulas: prev.aulas.map((a) => a.moduleId === m.id ? { ...a, moduleId: undefined } : a) }))}
                  className="text-purple-400 hover:text-red-500"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Aulas */}
      {current.aulas.length === 0 ? (
        <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma aula. Configure o calendário para gerar as datas.</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="aulas">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                {current.aulas.map((aula, i) => (
                  <AulaRow
                    key={aula.id}
                    aula={aula}
                    index={i}
                    modulos={current.modulos}
                    onChange={handleAulaChange}
                    onDelete={() => setCurrent((prev) => ({ ...prev, aulas: prev.aulas.filter((a) => a.id !== aula.id) }))}
                  />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 justify-between pt-2">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportPlanoMarkdown(current)}>
            <FileText className="w-4 h-4" /> .md
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPlanoXLS(current)}>
            <Table2 className="w-4 h-4" /> XLS
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPlanoPDF(current)}>
            <Download className="w-4 h-4" /> PDF
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Voltar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar plano'}
          </Button>
        </div>
      </div>

      <PlanoMeta open={metaOpen} onClose={() => setMetaOpen(false)} initial={current}
        onSave={(meta) => { setCurrent((prev) => ({ ...prev, ...meta })); setMetaOpen(false) }} />
      <SetupWizard open={setupOpen} onClose={() => setSetupOpen(false)} onSetup={handleSetup} />
    </div>
  )
}

// ─── Plano card (index view) ───────────────────────────────────────────────

function PlanoCard({ plano, onEdit, onDelete }: { plano: Plano; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0 mt-0.5">
            <BookOpen className="w-4 h-4 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">{plano.disciplina || 'Sem título'}</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {plano.periodo && <span className="mr-3">{plano.periodo}</span>}
              {plano.professores.length > 0 && <span>Integrantes: {plano.professores.join(', ')}</span>}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">{plano.aulas.length} aula{plano.aulas.length !== 1 ? 's' : ''}</Badge>
              {plano.weekdays.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {plano.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')}
                </Badge>
              )}
              {plano.startDate && (
                <span className="text-xs text-gray-400">
                  {formatDate(plano.startDate)} – {formatDate(plano.endDate)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            <button onClick={() => exportPlanoMarkdown(plano)} title="Exportar .md" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              <FileText className="w-4 h-4" />
            </button>
            <button onClick={() => exportPlanoXLS(plano)} title="Exportar XLS" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              <Table2 className="w-4 h-4" />
            </button>
            <button onClick={() => exportPlanoPDF(plano)} title="Exportar PDF" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={onEdit} title="Editar" className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors">
              <Edit2 className="w-4 h-4" />
            </button>
            <button onClick={onDelete} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={() => setExpanded(!expanded)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
            {plano.ementa && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descrição</p>
                <p className="text-sm text-gray-700 leading-relaxed">{plano.ementa}</p>
              </div>
            )}
            {plano.modulos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Módulos</p>
                <div className="flex flex-wrap gap-2">
                  {plano.modulos.map((m) => (
                    <Badge key={m.id} variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                      {m.title}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {plano.aulas.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Aulas</p>
                <div className="space-y-0.5">
                  {plano.aulas.map((aula, i) => {
                    const modulo = plano.modulos.find((m) => m.id === aula.moduleId)
                    return (
                      <div key={aula.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0 text-sm">
                        <span className="text-xs text-gray-400 w-6 text-right shrink-0">{i + 1}.</span>
                        <span className="text-xs font-mono text-purple-600 w-20 shrink-0">{formatDate(aula.date)}</span>
                        <span className="flex-1 text-gray-800 truncate">{aula.title || <em className="text-gray-400">Sem título</em>}</span>
                        {modulo && (
                          <Badge variant="outline" className="text-xs shrink-0 py-0">{modulo.title}</Badge>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

export function Planos() {
  const { isDemoMode } = useAuth()
  const { toasts, toast, dismiss } = useToast()
  const { register } = useWikiLinks()
  const [planos, setPlanos] = useState<Plano[]>(isDemoMode ? DEMO : [])
  const [loading, setLoading] = useState(!isDemoMode)
  const [editing, setEditing] = useState<Plano | null>(null)
  const [metaOpen, setMetaOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [pendingPlano, setPendingPlano] = useState<Partial<Plano> | null>(null)

  useEffect(() => {
    if (isDemoMode) return
    loadPlanos()
      .then((data) => { setPlanos(data); setLoading(false) })
      .catch((err: Error) => {
        toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' })
        setLoading(false)
      })
  }, [isDemoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    register(planos.map((p) => ({
      id: p.id, title: p.disciplina, route: '/planos',
      module: 'planos' as const,
      wikiLinks: [
        ...extractWikiLinks(p.ementa),
        ...extractWikiLinks(p.avaliacao),
        ...p.aulas.flatMap((a) => extractWikiLinks(a.description)),
      ],
    })))
  }, [planos, register])

  function handleNewPlan() {
    const now = new Date().toISOString()
    const blank: Plano = {
      id: crypto.randomUUID(), disciplina: '', professores: [], ementa: '', avaliacao: '', periodo: '',
      recursos: [], weekdays: [], frequency: 'weekly', startDate: '', endDate: '',
      modulos: [], aulas: [], created_at: now, updated_at: now,
    }
    setEditing(blank)
    setMetaOpen(true)
    setPendingPlano(blank)
  }

  async function handleSave(p: Plano) {
    if (!isDemoMode) {
      try { await savePlano(p) } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' }); return
      }
    }
    setPlanos((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = p; return next }
      return [p, ...prev]
    })
    setEditing(null)
    toast({ title: 'Plano salvo' })
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este plano?')) return
    if (!isDemoMode) {
      try { await deletePlano(id) } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast({ title: 'Erro ao excluir', description: msg, variant: 'destructive' }); return
      }
    }
    setPlanos((prev) => prev.filter((p) => p.id !== id))
    toast({ title: 'Plano excluído' })
  }

  if (editing) {
    return (
      <div className="animate-fade-in space-y-6">
        <ToastContainer toasts={toasts} onDismiss={dismiss} />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{editing.disciplina || 'Novo plano'}</h1>
            <p className="text-sm text-gray-500">Editando plano de curso</p>
          </div>
        </div>
        <PlanoEditor
          plano={editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
        {/* Meta dialog triggered on new plan */}
        <PlanoMeta open={metaOpen} onClose={() => setMetaOpen(false)} initial={editing}
          onSave={(meta) => {
            setEditing((prev) => prev ? { ...prev, ...meta } : prev)
            setMetaOpen(false)
            if (pendingPlano) { setSetupOpen(true); setPendingPlano(null) }
          }} />
        <SetupWizard open={setupOpen} onClose={() => setSetupOpen(false)}
          onSetup={(config) => {
            const dates = generateDates(config.startDate, config.endDate, config.weekdays, config.frequency)
            setEditing((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                ...config,
                aulas: dates.map((d, i) => ({ id: crypto.randomUUID(), date: d, title: '', description: '', order: i, references: [] })),
              }
            })
            setSetupOpen(false)
          }} />
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Planos</h1>
            <p className="text-sm text-gray-500">{planos.length} plano{planos.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button onClick={handleNewPlan}>
          <Plus className="w-4 h-4" /> Novo plano
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-purple-500 rounded-full animate-spin" />
        </div>
      ) : planos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum plano de curso ainda. Crie o primeiro!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {planos.map((p) => (
            <PlanoCard
              key={p.id}
              plano={p}
              onEdit={() => setEditing(p)}
              onDelete={() => handleDelete(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

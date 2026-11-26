import type { SavedSet } from '../shared/domain'
import { type FontBytes, pointTablePdf, studentPdf, teacherPdf } from '../shared/pdfcore'

let fonts: Promise<FontBytes> | null = null
function loadFonts(): Promise<FontBytes> {
  fonts ??= Promise.all([
    fetch('/fonts/LiberationSans-Regular.ttf').then((r) => r.arrayBuffer()),
    fetch('/fonts/LiberationSans-Bold.ttf').then((r) => r.arrayBuffer()),
  ]).then(([regular, bold]) => ({ regular, bold }))
  return fonts
}

export const buildStudentPdf = async (s: SavedSet) => studentPdf(s, await loadFonts())
export const buildTeacherPdf = async (s: SavedSet) => teacherPdf(s, await loadFonts())
export const buildPointTablePdf = async (s: SavedSet) => pointTablePdf(s, await loadFonts())

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  // plain punctuation in file names: some systems refuse "·" and "–" and fall back to "download"
  a.download = filename
    .replace(/[·•–—]/g, '-')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/(- )+/g, '- ')
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

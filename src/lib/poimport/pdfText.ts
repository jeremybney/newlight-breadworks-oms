// Browser-only: reads a PDF into positioned text items using the pdfjs-dist npm package.
// pdf.js is imported on demand (only when a PDF is uploaded), so it is not in the main bundle,
// and no third-party CDN is used at runtime. The "worker entry" import runs pdf.js's worker code
// on the page itself, which is fine for small purchase orders and avoids worker file hosting.
import { PdfTextItem } from './westville'

let loading: Promise<any> | null = null

function loadPdfJs(): Promise<any> {
  if (!loading) {
    loading = (async () => {
      const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf')
      // @ts-ignore (the worker entry file ships without type declarations)
      await import('pdfjs-dist/legacy/build/pdf.worker.entry')
      return pdfjs
    })().catch(e => { loading = null; throw e })
  }
  return loading
}

export async function extractPdfItems(file: File): Promise<PdfTextItem[]> {
  const pdfjs = await loadPdfJs()
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const items: PdfTextItem[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    for (const it of tc.items as any[]) {
      if (typeof it.str === 'string' && it.str.trim()) {
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], page: p })
      }
    }
  }
  return items
}

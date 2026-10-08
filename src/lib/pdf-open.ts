// On phones a plain download is hard to print. Open the PDF in a tab instead,
// where the browser's Share / Print options are available. Desktop still downloads.
export function preOpenForPhone(): Window | null {
  if (typeof window === 'undefined' || window.innerWidth >= 768) return null
  return window.open('', '_blank')
}

export function openOrSavePdf(doc: any, filename: string, preOpened?: Window | null) {
  if (typeof window === 'undefined' || window.innerWidth >= 768) {
    doc.save(filename)
    return
  }
  const url = URL.createObjectURL(doc.output('blob'))
  if (preOpened) preOpened.location.href = url
  else window.location.href = url
}

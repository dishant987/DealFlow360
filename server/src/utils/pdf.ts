import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Roboto (shipped with pdfmake) instead of the built-in Helvetica: Helvetica only knows
// WinAnsi characters, so ₹ printed as "¹" and broke the line layout. Roboto has ₹ € £ ¥ −.
const vfsModule = require('pdfmake/build/vfs_fonts.js')
const vfs: Record<string, string> = vfsModule.pdfMake?.vfs ?? vfsModule.vfs ?? vfsModule
const font = (file: string) => Buffer.from(vfs[file], 'base64')

const FONTS = {
  Roboto: {
    normal: font('Roboto-Regular.ttf'),
    bold: font('Roboto-Medium.ttf'),
    italics: font('Roboto-Italic.ttf'),
    bolditalics: font('Roboto-MediumItalic.ttf'),
  },
}

/** A pdfmake printer whose default font can print every currency the app supports. */
export function pdfPrinter() {
  const PdfPrinter = require('pdfmake')
  return new PdfPrinter(FONTS)
}
export const PDF_FONT = 'Roboto'

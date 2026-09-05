// Human-readable quotation number, derived from the DB sequence on the row.
// Uniqueness comes from Postgres (serial), not from the caller — so two reps
// creating a quote at the same instant can never collide.
export function quoteNumber(seqNo: number, createdAt: Date | string): string {
  const year = new Date(createdAt).getFullYear()
  return `QT-${year}-${String(seqNo).padStart(4, '0')}`
}

// Invoice document number — same sequence-backed guarantee as the quote number.
export function invoiceNumber(seqNo: number, issuedAt: Date | string): string {
  const year = new Date(issuedAt).getFullYear()
  return `INV-${year}-${String(seqNo).padStart(4, '0')}`
}

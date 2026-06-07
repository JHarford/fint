import type { CsvRow } from '@/types'

// Deterministic content hash for a transaction row. Two imports of the same
// statement produce identical hashes, so dedup against the DB always works
// regardless of how the bank labels its Number column.
export function rowHash(date: string, amount: number, memo: string): string {
  const s = `${date}|${amount.toFixed(2)}|${memo.trim()}`
  // djb2 — short, sync, no crypto dep, plenty unique for personal-finance scale
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return `h${(h >>> 0).toString(36)}`  // unsigned, base36
}

// Top-level parser: sniff format then dispatch.
export function parseCsv(text: string): CsvRow[] {
  const firstLine = text.split('\n').find(l => l.trim()) ?? ''
  // Headerless Barclaycard rows start with a date like "03 Jun 26"
  if (/^\d{1,2}\s[A-Za-z]{3}\s\d{2}/.test(firstLine.trim())) {
    return parseBarclaycardCsv(text)
  }
  return parseHeaderedCsv(text)
}

// Barclaycard credit-card export: no header, 7 columns
// 0=date "DD MMM YY", 1=memo, 2=card type, 3=cardholder, 4=bank category,
// 5=credit (negative, payments), 6=debit (positive, purchases).
// Already in Fint's convention (purchases positive = money out of card).
function parseBarclaycardCsv(text: string): CsvRow[] {
  const lines = text.trim().split('\n')
  const rows: CsvRow[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = parseRow(line)
    if (cols.length < 7) continue
    const date = normalizeDate(cols[0]?.trim() || '')
    const memo = cols[1]?.trim().replace(/\s+/g, ' ') || ''
    const bankCategory = cols[4]?.trim() || ''
    const credit = parseAmount(cols[5])
    const debit = parseAmount(cols[6])
    const amount = (isNaN(credit) ? 0 : credit) + (isNaN(debit) ? 0 : debit)
    if (amount === 0) continue
    rows.push({
      number: rowHash(date, amount, memo),
      date,
      account: cols[2]?.trim() || '',
      amount,             // no flip — already correct
      category: '',
      subcategory: bankCategory,
      memo,
    })
  }
  return rows
}

function parseAmount(raw: string | undefined): number {
  if (!raw) return NaN
  return parseFloat(raw.replace(/[£$,]/g, '').trim())
}

function parseHeaderedCsv(text: string): CsvRow[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  // Parse header to find column indices
  const header = parseRow(lines[0]).map(h => h.toLowerCase().trim())
  const numIdx = header.findIndex(h => h === 'number' || h === 'ref' || h === '#')
  const dateIdx = header.findIndex(h => h === 'date')
  const accountIdx = header.findIndex(h => h === 'account')
  const amountIdx = header.findIndex(h => h === 'amount')
  const categoryIdx = header.findIndex(h => h === 'category')
  const subcategoryIdx = header.findIndex(h => h === 'subcategory')
  const memoIdx = header.findIndex(h => h === 'memo' || h === 'description' || h === 'details')

  if (numIdx === -1 || dateIdx === -1 || amountIdx === -1) {
    throw new Error('CSV must have at least Number, Date, and Amount columns')
  }

  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = parseRow(line)
    const amount = parseFloat(cols[amountIdx]?.replace(/[£$,]/g, '') || '0')
    if (isNaN(amount)) continue

    const date = normalizeDate(cols[dateIdx]?.trim() || '')
    const memo = memoIdx >= 0 ? cols[memoIdx]?.trim() || '' : ''
    const flippedAmount = -amount
    rows.push({
      // number is overwritten with a content-hash so the DB unique constraint
      // (source_id, number) becomes a real idempotency key across imports.
      number: rowHash(date, flippedAmount, memo),
      date,
      account: accountIdx >= 0 ? cols[accountIdx]?.trim() || '' : '',
      // Banks use negative=money out; Fint uses positive=money out, negative=money in
      // (matches recurring_items convention). Flip on import.
      amount: flippedAmount,
      category: categoryIdx >= 0 ? cols[categoryIdx]?.trim() || '' : '',
      subcategory: subcategoryIdx >= 0 ? cols[subcategoryIdx]?.trim() || '' : '',
      memo,
    })
  }

  return rows
}

function parseRow(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

// Handle common date formats: DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY, DD MMM YY
function normalizeDate(dateStr: string): string {
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr

  // DD/MM/YYYY (UK format — assumed default)
  const ukMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ukMatch) {
    const [, day, month, year] = ukMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // DD MMM YY — Barclaycard style, e.g. "03 Jun 26"
  const bcMatch = dateStr.match(/^(\d{1,2})\s([A-Za-z]{3})\s(\d{2})$/)
  if (bcMatch) {
    const [, day, mon, yy] = bcMatch
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    }
    const month = months[mon.toLowerCase()]
    if (month) return `20${yy}-${month}-${day.padStart(2, '0')}`
  }

  // Try Date.parse as fallback
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0]
  }

  return dateStr
}

export function findDuplicates(rows: CsvRow[], existingNumbers: Set<string>): { newRows: CsvRow[], duplicateCount: number } {
  const newRows: CsvRow[] = []
  let duplicateCount = 0

  for (const row of rows) {
    if (existingNumbers.has(row.number)) {
      duplicateCount++
    } else {
      newRows.push(row)
    }
  }

  return { newRows, duplicateCount }
}

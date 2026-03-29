import type { CsvRow } from '@/types'

export function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  // Parse header to find column indices
  const header = parseRow(lines[0]).map(h => h.toLowerCase().trim())
  const numIdx = header.findIndex(h => h === 'number' || h === 'ref' || h === '#')
  const dateIdx = header.findIndex(h => h === 'date')
  const accountIdx = header.findIndex(h => h === 'account')
  const amountIdx = header.findIndex(h => h === 'amount')
  const subcategoryIdx = header.findIndex(h => h === 'subcategory' || h === 'category')
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

    rows.push({
      number: cols[numIdx]?.trim() || `row-${i}`,
      date: normalizeDate(cols[dateIdx]?.trim() || ''),
      account: cols[accountIdx]?.trim() || '',
      amount,
      subcategory: subcategoryIdx >= 0 ? cols[subcategoryIdx]?.trim() || '' : '',
      memo: memoIdx >= 0 ? cols[memoIdx]?.trim() || '' : '',
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

// Handle common date formats: DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY
function normalizeDate(dateStr: string): string {
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr

  // DD/MM/YYYY (UK format — assumed default)
  const ukMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ukMatch) {
    const [, day, month, year] = ukMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
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

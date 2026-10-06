import {
  thisMonthRange, writeOffRange, matchesWriteOff, writeOffsCsv, shortStamp, billDate,
} from '../writeOffs'

// 6 October 2026, mid-afternoon, local time.
const NOW = new Date(2026, 9, 6, 15, 30)

describe('the periods the register offers', () => {
  test('this month is the calendar month so far, not a rolling 30 days', () => {
    expect(thisMonthRange(NOW)).toEqual({ preset: 'custom', fromDate: '2026-10-01', toDate: '2026-10-06' })
    expect(writeOffRange('month', {}, NOW)).toEqual(thisMonthRange(NOW))
  })

  test('last month is the whole previous calendar month', () => {
    expect(writeOffRange('lastMonth', {}, NOW)).toEqual({ preset: 'custom', fromDate: '2026-09-01', toDate: '2026-09-30' })
    // Across a year end, too.
    expect(writeOffRange('lastMonth', {}, new Date(2027, 0, 9))).toEqual({
      preset: 'custom', fromDate: '2026-12-01', toDate: '2026-12-31',
    })
  })

  test('today and the last 7 days are the server presets', () => {
    expect(writeOffRange('today', {}, NOW)).toEqual({ preset: 'today' })
    expect(writeOffRange('week', {}, NOW)).toEqual({ preset: 'week' })
  })

  test('a custom range that does not name both ends asks for nothing', () => {
    expect(writeOffRange('custom', { fromDate: '2026-10-01' }, NOW)).toBeNull()
    expect(writeOffRange('custom', { fromDate: '2026-10-01', toDate: '2026-10-03' }, NOW)).toEqual({
      preset: 'custom', fromDate: '2026-10-01', toDate: '2026-10-03',
    })
  })
})

describe('narrowing the list', () => {
  const doc = {
    TransactionNo: 'INV-0003', CustomerName: 'slef', CustomerMobile: null, Note: 'Said he would pay',
    Reason: 'CUSTOMER_LEFT', WrittenOffByKey: 'm-karan', Source: { label: 'T3' },
  }

  test('by reason and by who', () => {
    expect(matchesWriteOff(doc, { reason: 'CUSTOMER_LEFT' })).toBe(true)
    expect(matchesWriteOff(doc, { reason: 'DISPUTED' })).toBe(false)
    expect(matchesWriteOff(doc, { by: 'm-karan' })).toBe(true)
    expect(matchesWriteOff(doc, { by: 'm-neha' })).toBe(false)
  })

  test('search reads the invoice, the name, the note and the table', () => {
    ['inv-0003', 'SLEF', 'would pay', 't3'].forEach((term) => {
      expect(matchesWriteOff(doc, { search: term })).toBe(true)
    })
    expect(matchesWriteOff(doc, { search: 'nothing like it' })).toBe(false)
  })
})

describe('the export', () => {
  test('one row per write-off, quoted so commas and quotes survive', () => {
    const csv = writeOffsCsv([{
      WrittenOffAt: new Date(2026, 9, 4, 13, 12).toISOString(), TransactionNo: 'INV-0003',
      TransactionDate: '2026-10-04', CustomerName: 'Mehra, R.', GrossAmount: 15, Collected: 9.92,
      WrittenOff: 5.08, ReasonLabel: 'Customer left without paying', Note: 'Said "next time"',
      WrittenOffByName: 'Karan S.',
    }])
    const [head, row] = csv.split('\n')
    expect(head).toMatch(/^"Written off on","Invoice","Bill date"/)
    expect(row).toContain('"2026-10-04 13:12"')
    expect(row).toContain('"2026-10-04"')
    expect(row).toContain('"Mehra, R."')
    expect(row).toContain('"5.08"')
    expect(row).toContain('"Said ""next time"""')
  })

  test('formats a stamp and a bill date the way the register shows them', () => {
    expect(shortStamp(new Date(2026, 9, 6, 9, 5).toISOString())).toBe('06/10 09:05')
    expect(billDate('2026-09-29T00:00:00.000Z')).toBe('29/09/2026')
    expect(shortStamp(null)).toBe('—')
  })
})

import { buildReceiptBytes, buildTestPageBytes } from '../escposReceipt'
import { ALWAYS, IF_PRESENT, NEVER } from '../receiptFields'

const visible = (bytes) => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i]
    if (b === 0x1b) { i += bytes[i + 1] === 0x40 ? 1 : 2; continue }
    if (b === 0x1d) { i += 2; continue }
    out += b === 0x0a ? '\n' : String.fromCharCode(b)
  }
  return out
}
const cuts = (bytes) => {
  let n = 0
  for (let i = 0; i < bytes.length - 2; i += 1) if (bytes[i] === 0x1d && bytes[i + 1] === 0x56) n += 1
  return n
}

const SHOP = { name: 'Sarjapura Foods', address: '142 Sarjapura Road', gstin: '29AABCS1429B1ZQ', fssai: '11223344556677' }

const SALE = (over = {}) => ({
  TransactionNo: 'INV-0418', TransactionDate: '2026-08-27T19:04:00Z',
  CustomerName: 'Aarti K.', CreatedBy: 'priya',
  Lines: [
    {
      Id: 'l1', ItemName: 'Paneer Tikka', Quantity: 2, UnitPrice: 240, GrossAmount: 480,
      BasePrice: 190, VariantAmount: 30, AddonAmount: 20,
      Variants: [{ id: 'v', name: 'Large', price: 30 }],
      Addons: [{ id: 'x', name: 'Mint chutney', price: 20, groupName: 'Dips' }],
      Note: 'Less spicy',
    },
    { Id: 'l2', ItemName: 'Butter Naan', Quantity: 3, UnitPrice: 65, GrossAmount: 195 },
  ],
  TaxByComponent: [{ name: 'CGST', rate: 9, amount: 85.5 }, { name: 'SGST', rate: 9, amount: 85.5 }],
  NetAmount: 950, TaxAmount: 171, DiscountAmount: 0, RoundOff: 0, GrossAmount: 1121,
  Tenders: [{ Id: 't1', PaymentMode: 'Cash', Amount: 1121 }],
  taxMode: 'gst',
  ...over,
})

const FORMAT = (over = {}) => ({
  shopName: ALWAYS, address: ALWAYS, gstin: ALWAYS, fssai: ALWAYS, documentNo: ALWAYS,
  dateTime: 'datetime', cashier: ALWAYS, customer: IF_PRESENT, itemNotes: IF_PRESENT,
  subtotal: ALWAYS, taxRows: 'split', total: ALWAYS, tenders: ALWAYS,
  footerLine1: 'Thank you — please come again', paperWidth: '80', copies: '1',
  ...over,
})

describe('the Bluetooth receipt', () => {
  test('a bill carries the masthead, title, lines, options, tax and total', () => {
    const text = visible(buildReceiptBytes('bill', { format: FORMAT(), shop: SHOP, data: SALE() }))
    expect(text).toContain('SARJAPURA FOODS')
    expect(text).toContain('GSTIN 29AABCS1429B1ZQ')
    expect(text).toContain('TAX INVOICE')
    expect(text).toMatch(/Invoice +INV-0418/)
    expect(text).toContain('Paneer Tikka')
    expect(text).toMatch(/2 x 240\.00 +480\.00/)
    expect(text).toMatch(/> Large +\+30\.00/)
    expect(text).toMatch(/\+ Dips: Mint chutney +\+20\.00/)
    expect(text).toContain('Note: Less spicy')
    expect(text).toMatch(/CGST 9% +85\.50/)
    expect(text).toMatch(/TOTAL +1121\.00/)
    expect(text).toMatch(/Cash +1121\.00/)
    expect(text).toContain('Thank you - please come again')
  })

  test('every line fits the paper', () => {
    const text80 = visible(buildReceiptBytes('bill', { format: FORMAT(), shop: SHOP, data: SALE() }))
    // Double-size lines are counted in half-width columns by the printer, so
    // no line of plain text may run past 48.
    text80.split('\n').forEach((l) => expect(l.length).toBeLessThanOrEqual(48))
    const text58 = visible(buildReceiptBytes('bill', { format: FORMAT({ paperWidth: '58' }), shop: SHOP, data: SALE() }))
    expect(text58).toContain('-'.repeat(32))
    expect(text58).not.toContain('-'.repeat(33))
  })

  test('a field set to Never does not print, and If present skips what is absent', () => {
    const text = visible(buildReceiptBytes('bill', {
      format: FORMAT({ cashier: NEVER }), shop: SHOP, data: SALE({ CustomerName: null }),
    }))
    expect(text).not.toContain('Cashier')
    expect(text).not.toContain('Customer')
  })

  test('an issued document prints the GSTIN it was issued under', () => {
    const text = visible(buildReceiptBytes('bill', { format: FORMAT(), shop: SHOP, data: SALE({ SellerGstin: '29ABCDE1234F1Z5' }) }))
    expect(text).toContain('GSTIN 29ABCDE1234F1Z5')
    expect(text).not.toContain(SHOP.gstin)
  })

  test('each copy is cut from the next', () => {
    expect(cuts(buildReceiptBytes('bill', { format: FORMAT({ copies: '2' }), shop: SHOP, data: SALE() }))).toBe(2)
    expect(cuts(buildReceiptBytes('bill', { format: FORMAT(), shop: SHOP, data: SALE() }))).toBe(1)
  })

  test('a bill of supply says so', () => {
    const text = visible(buildReceiptBytes('bill', { format: FORMAT(), shop: SHOP, data: SALE({ taxMode: 'unregistered' }) }))
    expect(text).toContain('BILL OF SUPPLY')
  })

  test('the kitchen ticket shouts the note, the order instructions and no cutlery', () => {
    const text = visible(buildReceiptBytes('kot', {
      format: { itemNotes: IF_PRESENT, orderInstructions: IF_PRESENT, noCutlery: IF_PRESENT, table: IF_PRESENT },
      data: {
        KotNo: 'KOT-0231', tableName: 'TABLE 7', CreatedOn: '2026-09-15T08:24:00Z',
        orderInstructions: 'Pack separately', noCutlery: true,
        Lines: [{ ItemName: 'Paneer Tikka', Quantity: 2, Options: ['Large'], Addons: [{ name: 'Mint chutney', groupName: 'Dips' }], Note: 'Jain' }],
      },
    }))
    expect(text).toContain('KOT-0231')
    expect(text).toContain('TABLE 7')
    expect(text).toContain('2 x PANEER TIKKA')
    expect(text).toContain('> LARGE')
    expect(text).toMatch(/\+ MINT CHUTNEY +DIPS/)
    expect(text).toContain('** JAIN **')
    expect(text).toContain('** PACK SEPARATELY **')
    expect(text).toContain('** NO CUTLERY **')
    expect(text).toContain('1 items')
    expect(text).not.toContain('SARJAPURA')
  })

  test('the token slip and the credit note draw', () => {
    expect(visible(buildReceiptBytes('tokenSlip', { format: null, shop: SHOP, data: { tokenLabel: 'A-14', GrossAmount: 120 } }))).toContain('A-14')
    const note = visible(buildReceiptBytes('creditNote', { format: FORMAT(), shop: SHOP, data: SALE({ TransactionNo: 'CN-0001', OriginalNo: 'INV-0418' }) }))
    expect(note).toContain('CREDIT NOTE')
    expect(note).toMatch(/REFUNDED +1121\.00/)
  })

  test('a document type it cannot draw gives nothing to send', () => {
    expect(buildReceiptBytes('unknown', { data: {} })).toBeNull()
    expect(buildReceiptBytes('bill', {})).toBeNull()
  })

  test('the test page has a ruler exactly one line wide', () => {
    const text = visible(buildTestPageBytes({ printerName: 'KPC307-UEWB-4F81', paperWidth: '58' }))
    expect(text).toContain('KPC307-UEWB-4F81')
    expect(text.split('\n')).toContain('12345678901234567890123456789012')
  })
})

describe('item count under the column (layout C)', () => {
  test('header, per-line qty and a count row, with discount and GST still after Subtotal', () => {
    const data = SALE({ DiscountAmount: 50, NetAmount: 625 })
    const text = visible(buildReceiptBytes('bill', { format: FORMAT({ itemLayout: 'single_line', discount: ALWAYS }), shop: SHOP, data }))
    // eslint-disable-next-line no-console
    if (process.env.SHOW_RECEIPT) console.log(text)
    expect(text).toMatch(/Item +Qty +Amount/)
    expect(text).toMatch(/Paneer Tikka +2 +480\.00/)
    expect(text).toMatch(/2 items +5 +675\.00/)
    const order = ['2 items', 'Subtotal', 'Discount', 'CGST', 'SGST'].map((s) => text.indexOf(s))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
})

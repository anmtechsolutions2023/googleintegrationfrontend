import { buildKotPrintData } from '../kotPrint'

describe('buildKotPrintData', () => {
  test('maps a round’s items onto the lines the ticket prints', () => {
    const data = buildKotPrintData({
      kot: { KotNo: 'KOT-0007', CreatedOn: '2026-08-27T12:00:00Z' },
      round: { round: 2, items: [{ name: 'Masala Dosa', qty: 3, total: 360 }] },
      tableName: 'G02',
    })
    expect(data.KotNo).toBe('KOT-0007')
    expect(data.round).toBe(2)
    expect(data.tableName).toBe('G02')
    expect(data.Lines).toEqual([
      { Id: 0, ItemName: 'Masala Dosa', Quantity: 3, Note: null, GrossAmount: 360 },
    ])
  })

  // The single most important line on a kitchen ticket. Variants are how "no
  // onion" reaches the cook, so they must not be dropped on the way to paper.
  test('folds chosen options into the note, options first', () => {
    const [line] = buildKotPrintData({
      kot: { KotNo: 'K1' },
      items: [{
        name: 'Dosa',
        qty: 1,
        variants: [{ id: 'v1', name: 'No onion' }, { id: 'v2', name: 'Extra chutney' }],
        note: 'table is in a hurry',
      }],
    }).Lines
    expect(line.Note).toBe('No onion, Extra chutney · table is in a hurry')
  })

  test('reads a KOT row’s own JSON snapshot when there is no round', () => {
    const data = buildKotPrintData({
      kot: { KotNo: 'K2', Items: '[{"Name":"Idli","Quantity":2}]' },
    })
    expect(data.Lines).toHaveLength(1)
    expect(data.Lines[0]).toMatchObject({ ItemName: 'Idli', Quantity: 2 })
  })

  test('survives a ticket with no items rather than throwing on the pass', () => {
    const data = buildKotPrintData({ kot: {} })
    expect(data.Lines).toEqual([])
    expect(data.KotNo).toBe('—')
  })

  test('accepts the looser key spellings a snapshot can carry', () => {
    const [line] = buildKotPrintData({
      kot: { KotNo: 'K3' },
      items: [{ ItemName: 'Vada', Qty: 4, Comment: 'crisp' }],
    }).Lines
    expect(line).toMatchObject({ ItemName: 'Vada', Quantity: 4, Note: 'crisp' })
  })
})

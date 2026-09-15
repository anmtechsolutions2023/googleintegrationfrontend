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
      { Id: 0, ItemName: 'Masala Dosa', Quantity: 3, Options: [], Addons: [], Note: null, GrossAmount: 360 },
    ])
  })

  // Three things printed as three: the portion changes WHAT is cooked, an
  // add-on is something extra to plate, and the note is HOW. Folding the
  // option into the note made "Half portion" read like a request.
  test('keeps options, add-ons and the note apart', () => {
    const [line] = buildKotPrintData({
      kot: { KotNo: 'K1' },
      items: [{
        name: 'Veg Triple Fried Rice',
        qty: 1,
        variants: [{ id: 'v1', name: 'Half portion', price: 170 }],
        addons: [
          { id: 'a1', name: 'Raita', price: 20, groupName: 'Extra dip' },
          { id: 'a2', name: 'Paneer', price: 50, groupName: 'Extra' },
        ],
        note: 'Less spicy, No onion',
      }],
    }).Lines
    expect(line.Options).toEqual(['Half portion'])
    expect(line.Addons).toEqual([
      { name: 'Raita', groupName: 'Extra dip' },
      { name: 'Paneer', groupName: 'Extra' },
    ])
    expect(line.Note).toBe('Less spicy, No onion')
  })

  test('reads a portal line\'s notes, and never repeats the dish name as a note', () => {
    const lines = buildKotPrintData({
      kot: { KotNo: 'K4' },
      items: [
        { name: 'Pizza', qty: 1, notes: 'Extra crispy' },
        { ItemName: 'Dosa', Quantity: 1, Comment: 'Dosa' },
      ],
    }).Lines
    expect(lines[0].Note).toBe('Extra crispy')
    expect(lines[1].Note).toBeNull()
  })

  test('takes the whole-order note from the ticket, or from the caller when the ticket has none', () => {
    expect(buildKotPrintData({
      kot: { KotNo: 'K5', CookingInstructions: 'From the ticket', NoCutlery: 1 },
      orderInstructions: 'From the till',
    })).toMatchObject({ orderInstructions: 'From the ticket', noCutlery: true })
    expect(buildKotPrintData({
      kot: { KotNo: 'K6' }, orderInstructions: 'Pack sauces separately', noCutlery: true,
    })).toMatchObject({ orderInstructions: 'Pack sauces separately', noCutlery: true })
    expect(buildKotPrintData({ kot: { KotNo: 'K7' } }))
      .toMatchObject({ orderInstructions: null, noCutlery: false })
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

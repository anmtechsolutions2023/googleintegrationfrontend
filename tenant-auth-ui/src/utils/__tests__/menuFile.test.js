import { kindOf, readFile, readFiles, payloadOf } from '../menuFile'

describe('menu files, read in the browser', () => {
  test('tells the three kinds apart by their header', () => {
    expect(kindOf(['name', 'category', 'price'])).toBe('menu')
    expect(kindOf(['group', 'min', 'max', 'addon', 'price'])).toBe('addons')
    expect(kindOf(['category', 'days', 'from', 'to'])).toBe('hours')
    expect(kindOf(['foo', 'bar'])).toBeNull()
  })

  test('counts what a menu file holds, and portals by their listed column', () => {
    const r = readFile([
      'name,category,unit,diet,price,tax_group,variants,tags,zomato_listed,status',
      'Masala Dosa,Breakfast,Plate,Veg,120,GST 5%,,South Indian,Yes,Active',
      'Veg Biryani,Mains,Plate,Veg,220,GST 5%,Regular=0; Large=+60,Main Course; Chef special,Yes,Active',
      'Kulfi,Desserts,Piece,Veg,120,GST 5%,,,No,Hidden',
    ].join('\n'))
    expect(r.kind).toBe('menu')
    expect(r.counts).toMatchObject({ dishes: 3, categories: 3, units: 2, taxGroups: 1, variants: 2, tags: 3, hidden: 1 })
    expect(r.counts.portals).toEqual([{ key: 'zomato', listed: 2 }])
  })

  test('leaves out a row with no name or a price that is not a number', () => {
    const r = readFile('name,category,price\nTea,Tea,15\n,Tea,10\nCoffee,Tea,1O9\nWater,Retail,-')
    expect(r.valid.map((x) => x.name)).toEqual(['Tea', 'Water'])
    expect(r.invalid.map((x) => x.error)).toEqual(['No name or code', 'Price “1O9” is not a number'])
  })

  test('sorts several files into their kinds, and sends their rows', () => {
    const sorted = readFiles([
      { name: 'h.csv', text: 'category,days,from,to\nBreakfast,Mon-Sun,07:00,11:30' },
      { name: 'm.csv', text: 'name,category,price\nTea,Tea,15' },
      { name: 'a.csv', text: 'group,addon,price\nDips,Mint,15' },
      { name: 'x.csv', text: 'foo\n1' },
    ])
    expect(sorted.menu.name).toBe('m.csv')
    expect(sorted.addons.name).toBe('a.csv')
    expect(sorted.hours.name).toBe('h.csv')
    expect(sorted.unknown).toHaveLength(1)
    const payload = payloadOf(sorted)
    expect(payload.menu[0]).toMatchObject({ name: 'Tea', price: '15' })
    expect(payload.addons[0]).toMatchObject({ group: 'Dips', addon: 'Mint' })
    expect(payload.hours).toHaveLength(1)
  })
})

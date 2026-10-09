import { cached, clearRefCache } from '../refCache'

test('one request for many callers, each given its own copy, until cleared', async () => {
  const load = jest.fn(async () => ['Indiranagar', 'Koramangala'])
  const [a, b] = await Promise.all([cached('k', load), cached('k', load)])
  expect(load).toHaveBeenCalledTimes(1)
  a.push('mutated')
  expect(b).toEqual(['Indiranagar', 'Koramangala'])
  expect(await cached('k', load)).toEqual(['Indiranagar', 'Koramangala'])
  clearRefCache()
  await cached('k', load)
  expect(load).toHaveBeenCalledTimes(2)
})

test('a failed request is not kept', async () => {
  const load = jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(['ok'])
  await expect(cached('f', load)).rejects.toThrow('down')
  expect(await cached('f', load)).toEqual(['ok'])
})

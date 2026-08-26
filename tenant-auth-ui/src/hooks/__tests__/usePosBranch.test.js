import { renderHook, waitFor, act } from '@testing-library/react'
import { usePosBranch } from '../usePosBranch'
import posService from '../../services/posService'

jest.mock('../../services/posService')

const KEY = 'fd.test.branch'
const BRANCHES = [
  { Id: 'branch-a', BranchName: 'Andheri' },
  { Id: 'branch-b', BranchName: 'Bandra' },
]

beforeEach(() => {
  localStorage.clear()
  jest.clearAllMocks()
})

describe('usePosBranch', () => {
  it('selects the first branch when nothing is remembered', async () => {
    posService.getPosBranches.mockResolvedValue(BRANCHES)
    const { result } = renderHook(() => usePosBranch(KEY))
    await waitFor(() => expect(result.current.branchesLoaded).toBe(true))
    expect(result.current.branchId).toBe('branch-a')
  })

  it('keeps a remembered branch that still belongs to the tenant', async () => {
    localStorage.setItem(KEY, 'branch-b')
    posService.getPosBranches.mockResolvedValue(BRANCHES)
    const { result } = renderHook(() => usePosBranch(KEY))
    await waitFor(() => expect(result.current.branchesLoaded).toBe(true))
    expect(result.current.branchId).toBe('branch-b')
  })

  // The regression this hook exists for. localStorage survives logout and
  // switchTenant, so a branch id from a previous tenant used to be trusted —
  // the queue query then matched nothing and the board read "No orders yet"
  // permanently, with no way back when there was only one branch to pick.
  it('discards a remembered branch belonging to another tenant', async () => {
    localStorage.setItem(KEY, 'branch-from-old-tenant')
    posService.getPosBranches.mockResolvedValue(BRANCHES)
    const { result } = renderHook(() => usePosBranch(KEY))
    await waitFor(() => expect(result.current.branchesLoaded).toBe(true))
    expect(result.current.branchId).toBe('branch-a')
    expect(localStorage.getItem(KEY)).toBe('branch-a')
  })

  it('clears the stored key when the tenant has no branches at all', async () => {
    localStorage.setItem(KEY, 'branch-from-old-tenant')
    posService.getPosBranches.mockResolvedValue([])
    const { result } = renderHook(() => usePosBranch(KEY))
    await waitFor(() => expect(result.current.branchesLoaded).toBe(true))
    expect(result.current.branchId).toBe('')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('accepts lowercase id from the API envelope', async () => {
    posService.getPosBranches.mockResolvedValue([{ id: 'lower-a', Name: 'Andheri' }])
    const { result } = renderHook(() => usePosBranch(KEY))
    await waitFor(() => expect(result.current.branchesLoaded).toBe(true))
    expect(result.current.branchId).toBe('lower-a')
  })

  it('still finishes loading when the branch lookup fails', async () => {
    posService.getPosBranches.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => usePosBranch(KEY))
    await waitFor(() => expect(result.current.branchesLoaded).toBe(true))
    expect(result.current.branches).toEqual([])
  })

  it('persists a branch the user picks', async () => {
    posService.getPosBranches.mockResolvedValue(BRANCHES)
    const { result } = renderHook(() => usePosBranch(KEY))
    await waitFor(() => expect(result.current.branchesLoaded).toBe(true))
    act(() => result.current.setBranchId('branch-b'))
    await waitFor(() => expect(localStorage.getItem(KEY)).toBe('branch-b'))
  })
})

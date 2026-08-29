import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import usePrintReceipt from '../usePrintReceipt'
import posService from '../../../../services/posService'

// THE BUG THIS FILE EXISTS FOR
//
// receipt.css shipped `#root { display: none }` and `@page { size: 80mm auto }`
// unscoped, and this stylesheet is in the main bundle. From the moment the till
// loaded, EVERY print in the whole application — Ctrl+P on a report, the
// browser's own Print, any screen at all — hid the application and forced an
// 80mm page. What came out was a blank till roll, every time.
//
// So the observable rule is: the application is only hidden, and the paper only
// resized, while a receipt is genuinely on it. These assert both halves.

jest.mock('../../../../services/posService', () => ({
  __esModule: true,
  default: { getReceiptFormat: jest.fn() },
}))

const Harness = ({ branchId = null, onReady }) => {
  const api = usePrintReceipt(branchId)
  onReady(api)
  // The shape Receipt really portals to the body: the guard looks for paper
  // with text on it, not merely a root element.
  return api.job
    ? <div className="rc-root"><div className="rc-paper">KOT-0007 · 2 MARGHERITA</div></div>
    : null
}

const mount = async (branchId) => {
  let api
  await act(async () => {
    render(<Harness branchId={branchId} onReady={(a) => { api = a }} />)
  })
  return () => api
}

const pageRule = () => document.getElementById('rc-page-size')?.textContent || ''

// Printing now waits for the paper to be on the page rather than firing on a
// fixed timer, so a test has to let a frame through.
const frame = () => act(async () => {
  await new Promise((r) => requestAnimationFrame(r))
  await Promise.resolve()
})

beforeEach(() => {
  jest.clearAllMocks()
  posService.getReceiptFormat.mockResolvedValue(null)
  window.print = jest.fn()
  document.body.className = ''
  document.getElementById('rc-page-size')?.remove()
})

describe('printing is scoped to an actual receipt', () => {
  it('leaves the rest of the application printable when idle', async () => {
    await mount(null)
    // Nothing marks the body, so the @media print rules do not match and the
    // page keeps whatever size the browser and the printing screen chose.
    expect(document.body.classList.contains('rc-printing')).toBe(false)
    expect(document.getElementById('rc-page-size')).toBeNull()
  })

  it('marks the body and sizes the paper only while a receipt is up', async () => {
    const get = await mount(null)
    await act(async () => { get().print('bill', { TransactionNo: 'INV-1' }) })
    await frame()

    expect(document.body.classList.contains('rc-printing')).toBe(true)
    expect(pageRule()).toContain('80mm')
    expect(window.print).toHaveBeenCalled()
  })

  it('takes the paper size from the format, so a 58mm branch is not cropped', async () => {
    posService.getReceiptFormat.mockResolvedValue({
      documents: { bill: { paperWidth: '58' } }, shop: {},
    })
    const get = await mount('branch-1')
    await act(async () => { get().print('bill', { TransactionNo: 'INV-1' }) })
    await frame()

    expect(pageRule()).toContain('58mm')
  })

  it('hands printing back to the application when the dialog closes', async () => {
    const get = await mount(null)
    await act(async () => { get().print('bill', { TransactionNo: 'INV-1' }) })
    await frame()
    expect(document.body.classList.contains('rc-printing')).toBe(true)

    await act(async () => { window.dispatchEvent(new Event('afterprint')) })

    expect(document.body.classList.contains('rc-printing')).toBe(false)
    expect(document.getElementById('rc-page-size')).toBeNull()
    expect(get().job).toBeNull()
  })

  it('keeps the receipt mounted until the dialog closes, not on a timer', async () => {
    // The old code cleared the job a fixed 60ms after opening the dialog. A
    // browser whose print() returns before the user dismisses it had the
    // receipt pulled out from under the preview — which showed a blank page.
    const get = await mount(null)
    await act(async () => { get().print('bill', { TransactionNo: 'INV-1' }) })
    await frame()
    await frame()
    await frame()

    expect(get().job).not.toBeNull()
    expect(document.querySelector('.rc-paper')).toBeTruthy()
  })

  it('hides every kind of body sibling, not only divs', async () => {
    // #root is a div, but a toast container, a modal root or the stray <a> a
    // download helper leaves behind are not — and one un-hidden sibling is a
    // page of application furniture on the till roll.
    const css = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'receipt.css'), 'utf8',
    );
    expect(css).toContain('body.rc-printing > *:not(.rc-root)');
    // And nothing outside that gate may hide the application or size the page.
    // Declarations only — a comment is free to mention #root.
    const rules = css.slice(css.indexOf('@media print'))
      .split('\n')
      .filter((l) => l.includes('{') && !l.trim().startsWith('/*') && !l.trim().startsWith('*'));
    rules
      .filter((l) => l.includes('display: none') || l.includes('#root'))
      .forEach((l) => expect(l).toContain('rc-printing'));
    expect(css).not.toMatch(/^@page/m);
  });

  // ── The blank-page bug itself ──────────────────────────────────────────
  // The order used to be: hide the application, force the page to 80mm, then
  // print 60ms later and hope React had committed the portal. When it had not,
  // print() fired with everything hidden and no receipt — a blank till roll.
  describe('when the receipt is not on the page yet', () => {
    // A caller that never renders one, which is what a slow commit looks like
    // from the hook's point of view.
    const Bare = ({ onReady }) => {
      const api = usePrintReceipt(null)
      onReady(api)
      return null
    }

    const mountBare = async () => {
      let api
      await act(async () => { render(<Bare onReady={(a) => { api = a }} />) })
      return () => api
    }

    it('does not hide the application before there is paper to replace it with', async () => {
      const get = await mountBare()
      await act(async () => { get().print('bill', { TransactionNo: 'INV-1' }) })
      await frame()

      // The old code marked the body immediately. Hiding #root with nothing to
      // show in its place IS the blank page.
      expect(document.body.classList.contains('rc-printing')).toBe(false)
      expect(window.print).not.toHaveBeenCalled()
    })

    it('gives up rather than sending blank paper, and says which document', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {})
      const get = await mountBare()
      await act(async () => { get().print('kot', { KotNo: 'KOT-0007' }) })

      await waitFor(() => expect(get().failed).toBe('kot'), { timeout: 3000 })
      expect(window.print).not.toHaveBeenCalled()
      // And it leaves printing working for everything else.
      expect(document.body.classList.contains('rc-printing')).toBe(false)
      expect(document.getElementById('rc-page-size')).toBeNull()
      console.warn.mockRestore()
    })

    it('clears the failure when a new print is asked for', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {})
      const get = await mountBare()
      await act(async () => { get().print('kot', { KotNo: 'KOT-0007' }) })
      await waitFor(() => expect(get().failed).toBe('kot'), { timeout: 3000 })

      await act(async () => { get().print('kot', { KotNo: 'KOT-0008' }) })
      expect(get().failed).toBeNull()
      console.warn.mockRestore()
    })
  })

  it('cleans up on unmount, so leaving the screen mid-print does not strand it', async () => {
    let api
    let unmount
    await act(async () => {
      const r = render(<Harness onReady={(a) => { api = a }} />)
      unmount = r.unmount
    })
    await act(async () => { api.print('bill', { TransactionNo: 'INV-1' }) })
    await frame()
    expect(document.body.classList.contains('rc-printing')).toBe(true)

    await act(async () => { unmount() })

    expect(document.body.classList.contains('rc-printing')).toBe(false)
    expect(document.getElementById('rc-page-size')).toBeNull()
  })
})

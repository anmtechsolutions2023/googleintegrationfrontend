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

// ── Pictures have to be decoded before the snapshot ──────────────────────────
//
// THE BUG THIS COVERS. The guard above waited for TEXT and nothing else, so
// print() could fire while a logo was still decoding and the page was snapshotted
// without it. A payment QR of a few kilobytes decoded inside that gap and came out
// fine; a logo several times larger did not, every time — which reads as "logos do
// not print" rather than as a race, and sent the diagnosis towards the printer.
//
// The two conditions are NOT equally serious, and these pin both halves: a picture
// is worth waiting for and never worth refusing a bill over.
describe('waiting for the pictures', () => {
  const PaperWithImage = ({ branchId, onReady, complete }) => {
    const api = usePrintReceipt(branchId)
    onReady(api)
    if (!api.job) return null
    return (
      <div className="rc-root">
        <div className="rc-paper">
          {/* jsdom never loads anything, so `complete` is stubbed to say where the
              browser would have got to. */}
          <img alt="" ref={(el) => { if (el) Object.defineProperty(el, 'complete', { value: complete, configurable: true }) }} />
          INV-0002 · MAYINI KITCHEN
        </div>
      </div>
    )
  }

  const mountWithImage = async (complete) => {
    let api
    await act(async () => {
      render(<PaperWithImage branchId="b-1" onReady={(a) => { api = a }} complete={complete} />)
    })
    return () => api
  }

  it('does not print while an image is still decoding', async () => {
    const get = await mountWithImage(false)
    await act(async () => { get().print('bill', { TransactionNo: 'INV-0002' }) })
    // Several frames' worth of chances, still nothing on the paper.
    await act(async () => { await new Promise((r) => setTimeout(r, 60)) })
    expect(window.print).not.toHaveBeenCalled()
  })

  it('prints once the image is decoded', async () => {
    const get = await mountWithImage(true)
    await act(async () => { get().print('bill', { TransactionNo: 'INV-0002' }) })
    await waitFor(() => expect(window.print).toHaveBeenCalled())
  })

  // A bill without its logo is a bill. A customer at a counter with no bill is not.
  it('gives up waiting and prints anyway rather than refusing the bill', async () => {
    const get = await mountWithImage(false)
    await act(async () => { get().print('bill', { TransactionNo: 'INV-0002' }) })
    await act(async () => { await new Promise((r) => setTimeout(r, 1100)) })
    await waitFor(() => expect(window.print).toHaveBeenCalled())
    // And it is NOT reported as a failed print — the paper came out.
    expect(get().failed).toBeNull()
  })
})

// ── No stylesheet may hide the page for everyone ─────────────────────────────
// The bug this exists for: qr.css shipped `@media print { body * { visibility:
// hidden } }` UNGATED, to show only the QR card grid. CRA bundles every imported
// stylesheet into one global sheet, so that rule applied to every print in the
// application — and `visibility: hidden` is not something the receipt's
// `display: block` can override. Every bill and every kitchen ticket printed a
// blank sheet, which reads as a broken printer rather than as a CSS bug.
//
// The rule: a print rule that hides or repositions the whole document must be
// gated on a body class its own screen sets for the duration of its print.
describe('every stylesheet keeps its print rules to itself', () => {
  const fs = require('fs');
  const path = require('path');

  const cssFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return cssFiles(full);
      return e.name.endsWith('.css') ? [full] : [];
    });

  const printBlocks = (css) => {
    const out = [];
    let i = css.indexOf('@media print');
    while (i !== -1) {
      const open = css.indexOf('{', i);
      let depth = 0;
      let j = open;
      for (; j < css.length; j += 1) {
        if (css[j] === '{') depth += 1;
        if (css[j] === '}') { depth -= 1; if (depth === 0) break; }
      }
      out.push(css.slice(open + 1, j));
      i = css.indexOf('@media print', j);
    }
    return out;
  };

  it('no ungated rule hides or moves the whole document when printing', () => {
    const offenders = [];

    cssFiles(path.join(__dirname, '..', '..', '..', '..')).forEach((file) => {
      const css = fs.readFileSync(file, 'utf8');
      printBlocks(css).forEach((block) => {
        block.split('\n')
          .map((l) => l.trim())
          .filter((l) => l.includes('{') && !l.startsWith('/*') && !l.startsWith('*'))
          .forEach((rule) => {
            const selector = rule.slice(0, rule.indexOf('{')).trim();
            const body = rule.slice(rule.indexOf('{'));
            // Declarations that take the page away from whatever else is on it.
            const sweeping = /visibility:\s*hidden|display:\s*none|position:\s*(absolute|fixed)/.test(body);
            // A rule aimed at the whole document rather than at its own widget.
            const global = /(^|,)\s*(body\s*\*|\*|html|body)\s*(\*)?\s*$/.test(selector)
              || /^body\s+\*/.test(selector);
            // Gated on a class some screen turns on for its own print.
            const gated = /body\.[a-z-]*printing/.test(selector);
            if (sweeping && global && !gated) {
              offenders.push(`${path.basename(file)}: ${selector}`);
            }
          });
      });
    });

    expect(offenders).toEqual([]);
  });
});

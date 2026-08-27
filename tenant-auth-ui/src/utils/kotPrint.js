import { parseOrderItems, itemLabel, itemQty, itemVariants } from './posRounds'

/**
 * The data a kitchen ticket prints from.
 *
 * Shared by the till and the pass on purpose. Billing prints the ticket when a
 * round is sent; the Kitchen board reprints it when the paper is lost. Two
 * builders would eventually put different words on the same ticket, and the one
 * place that must never happen is the one the cook reads.
 *
 * `Receipt.js` → `Kot` reads Lines[].{ItemName, Quantity, Note, GrossAmount}.
 * A round's items are a JSON snapshot with looser keys, so the mapping lives
 * here rather than at each call site.
 *
 * Chosen options are folded into the note, not dropped: "no onion" arrives as a
 * variant, and it is the single most important line on a kitchen ticket.
 *
 * @param {Object} p
 * @param {Object} p.kot - Response from fireKot, or a KOT row from the pass.
 * @param {Object} [p.round] - { round, items, time } from posRounds.
 * @param {Array}  [p.items] - Raw items, when there is no round to hand.
 * @param {string} [p.tableName]
 * @param {string} [p.tokenLabel]
 * @param {string} [p.waiter]
 * @returns {Object} data for <Receipt doc="kot" />
 */
export const buildKotPrintData = ({
  kot = {}, round = null, items = null, tableName = null,
  tokenLabel = null, waiter = null,
}) => {
  const source = items ?? round?.items ?? parseOrderItems(kot.Items)

  const Lines = (Array.isArray(source) ? source : []).map((it, i) => {
    const variants = itemVariants(it)
    const own = it?.note ?? it?.Note ?? it?.Comment ?? ''
    // Options first: they change how the dish is made. The line's own note
    // follows, so a cook reads the modification before the aside.
    const note = [variants.map((v) => v.name).join(', '), own]
      .filter(Boolean)
      .join(' · ')

    return {
      Id: it?.id ?? it?.Id ?? i,
      ItemName: itemLabel(it),
      Quantity: itemQty(it),
      Note: note || null,
      // Present so a branch that switches prices on for the kitchen ticket gets
      // them; hidden by default in the receipt format.
      GrossAmount: Number(it?.total ?? it?.Total ?? it?.GrossAmount ?? 0) || 0,
    }
  })

  return {
    KotNo: kot.KotNo || kot.kotNo || '—',
    CreatedOn: kot.CreatedOn || kot.FiredAt || round?.time || new Date().toISOString(),
    tableName: tableName || null,
    tokenLabel: tokenLabel || null,
    round: round?.round ?? null,
    waiter: waiter || null,
    Lines,
  }
}

export default buildKotPrintData

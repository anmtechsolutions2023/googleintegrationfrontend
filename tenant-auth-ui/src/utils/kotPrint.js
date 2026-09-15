import { parseOrderItems, itemLabel, itemQty } from './posRounds'
import { lineOptions, lineAddons, lineNote } from './lineOptions'

/**
 * The data a kitchen ticket prints from.
 *
 * Shared by the till and the pass on purpose. Billing prints the ticket when a
 * round is sent; the Kitchen board reprints it when the paper is lost. Two
 * builders would eventually put different words on the same ticket, and the one
 * place that must never happen is the one the cook reads.
 *
 * `Receipt.js` → `Kot` reads Lines[].{ItemName, Quantity, Options, Addons, Note,
 * GrossAmount}. A round's items are a JSON snapshot with looser keys, so the
 * mapping lives here rather than at each call site.
 *
 * Options, add-ons and the note are three things, printed as three: the portion
 * changes WHAT is cooked, an add-on is something extra to plate, and the note is
 * HOW. Folding the option into the note made "Half portion" read like a request.
 *
 * @param {Object} p
 * @param {Object} p.kot - Response from fireKot, or a KOT row from the pass.
 * @param {Object} [p.round] - { round, items, time } from posRounds.
 * @param {Array}  [p.items] - Raw items, when there is no round to hand.
 * @param {string} [p.tableName]
 * @param {string} [p.tokenLabel]
 * @param {string} [p.waiter]
 * @param {string} [p.orderInstructions] - The whole-order note, when the caller
 *   has it and the ticket row does not.
 * @param {boolean} [p.noCutlery]
 * @returns {Object} data for <Receipt doc="kot" />
 */
export const buildKotPrintData = ({
  kot = {}, round = null, items = null, tableName = null,
  tokenLabel = null, waiter = null, orderInstructions = null, noCutlery = null,
}) => {
  const source = items ?? round?.items ?? parseOrderItems(kot.Items)

  const Lines = (Array.isArray(source) ? source : []).map((it, i) => {
    const name = itemLabel(it)
    // A snapshot's Comment is a note only when it is not just the dish name
    // again, which is what an invoice line keeps there.
    const comment = typeof it?.Comment === 'string' && it.Comment.trim() !== name ? it.Comment.trim() : ''
    return {
      Id: it?.id ?? it?.Id ?? i,
      ItemName: name,
      Quantity: itemQty(it),
      Options: lineOptions(it).map((v) => v.name),
      Addons: lineAddons(it).map((a) => ({ name: a.name, groupName: a.groupName })),
      Note: lineNote(it) || comment || null,
      // Present so a branch that switches prices on for the kitchen ticket gets
      // them; hidden by default in the receipt format.
      GrossAmount: Number(it?.total ?? it?.Total ?? it?.grossAmount ?? it?.GrossAmount ?? 0) || 0,
    }
  })

  return {
    KotNo: kot.KotNo || kot.kotNo || '—',
    CreatedOn: kot.CreatedOn || kot.FiredAt || round?.time || new Date().toISOString(),
    tableName: tableName || null,
    tokenLabel: tokenLabel || null,
    round: round?.round ?? null,
    waiter: waiter || null,
    // ORDER-LEVEL, as opposed to each line's own Note. Read off the KOT itself
    // first: the ticket is a snapshot of what the kitchen was told, and an edit
    // behind it must not rewrite paper already on the pass. The caller's value
    // is the fallback for a ticket response that does not carry it.
    orderInstructions: kot.CookingInstructions || kot.cookingInstructions || orderInstructions || null,
    // A boolean, not a phrase to find inside the instructions: it is acted on
    // by whoever bags the order, who is not reading the cooking notes.
    noCutlery: !!(kot.NoCutlery ?? kot.noCutlery ?? noCutlery),
    Lines,
  }
}

export default buildKotPrintData

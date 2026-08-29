import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { SCOPES, APP_CONFIG } from '../../constants'
import { useCan } from '../../hooks/useCan'
import CampaignForm from './CampaignForm'
import './campaigns.css'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

/**
 * One campaign: its offers, and what they cost.
 *
 * THE READBACK IS THE FEATURE. Six dropdowns can express a rule nobody can read
 * back; the sentence under the form is the same rule in English, and it is what
 * somebody actually checks before going live. It is built on the SERVER, so the
 * till, this screen and the audit log all describe an offer the same way.
 */

const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0)

const TRIGGERS = [
  { value: 'ITEM_QTY', label: 'the bill contains N of one item' },
  { value: 'CATEGORY_QTY', label: 'the bill contains N from a category' },
  { value: 'BILL_AMOUNT', label: 'the bill reaches an amount' },
]
const REWARDS = [
  { value: 'SAME_ITEM', label: 'the same item' },
  { value: 'SPECIFIC_ITEM', label: 'a specific item' },
]
const PERCENTS = [
  { value: 100, label: '100% off — free' },
  { value: 50, label: '50% off — half price' },
  { value: 25, label: '25% off' },
  { value: 10, label: '10% off' },
]

const blankOffer = () => ({
  Name: '', TriggerKind: 'ITEM_QTY', TriggerItemId: '', TriggerCategoryId: '',
  TriggerMinQty: 2, TriggerMinAmount: 500,
  RewardKind: 'SAME_ITEM', RewardItemId: '', RewardQuantity: 1, RewardPercent: 100,
  ApplyTo: 'CHEAPEST', MaxPerBill: 1, MaxPerCustomerPerDay: '', MaxTotalRedemptions: '',
})

const CampaignDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const canEdit = useCan(SCOPES.POS_CONFIG_WRITE)

  const [tab, setTab] = useState('offers')
  const [campaign, setCampaign] = useState(null)
  const [report, setReport] = useState(null)
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  // The campaign's OWN settings — dates, days, hours, budget, branches. There
  // was no way to change any of them once created, which made a mistyped time
  // window permanent.
  const [editCampaign, setEditCampaign] = useState(false)
  const [branches, setBranches] = useState([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setCampaign(await posService.getCampaign(id))
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load the campaign')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    posService.getPosBranches({ limit: MAX_LIMIT }).then(setBranches).catch(() => setBranches([]))
    posService.getItemDetails({ limit: MAX_LIMIT }).then(setItems).catch(() => setItems([]))
    posService.getCategories({ limit: MAX_LIMIT }).then(setCategories).catch(() => setCategories([]))
  }, [])

  useEffect(() => {
    if (tab !== 'report') return
    posService.getCampaignReport(id).then(setReport).catch(() => setReport(null))
  }, [tab, id])

  // The sentence, built locally WHILE TYPING so the readback is live. The
  // server builds the same sentence and its version is what everything else
  // displays — this one exists only for the half-second before Save.
  const sentence = useMemo(() => {
    const o = editing
    if (!o) return ''
    const itemName = (i) => items.find((x) => (x.Id || x.id) === i)?.Name || 'the item'
    const catName = (c) => categories.find((x) => (x.Id || x.id) === c)?.Name || 'the category'
    const qty = (n) => String(Number(n) || 0)

    const when = o.TriggerKind === 'BILL_AMOUNT'
      ? `When a bill reaches ₹${qty(o.TriggerMinAmount)}`
      : `When a bill has ${qty(o.TriggerMinQty)} or more of `
        + (o.TriggerKind === 'ITEM_QTY' ? itemName(o.TriggerItemId) : catName(o.TriggerCategoryId))

    const what = o.RewardKind === 'SAME_ITEM' ? 'of them' : `× ${itemName(o.RewardItemId)}`
    const off = Number(o.RewardPercent) === 100 ? 'free' : `${o.RewardPercent}% off`
    const which = o.RewardKind === 'SAME_ITEM'
      ? ` — the ${o.ApplyTo === 'DEAREST' ? 'most expensive' : 'cheapest'} one`
      : ''
    return `${when}, make ${qty(o.RewardQuantity)} ${what} ${off}${which}. At most ${o.MaxPerBill} per bill.`
  }, [editing, items, categories])

  const save = async () => {
    setSaving(true)
    try {
      const body = {
        Name: editing.Name,
        TriggerKind: editing.TriggerKind,
        TriggerItemId: editing.TriggerKind === 'ITEM_QTY' ? editing.TriggerItemId || null : null,
        TriggerCategoryId: editing.TriggerKind === 'CATEGORY_QTY' ? editing.TriggerCategoryId || null : null,
        TriggerMinQty: editing.TriggerKind === 'BILL_AMOUNT' ? null : Number(editing.TriggerMinQty),
        TriggerMinAmount: editing.TriggerKind === 'BILL_AMOUNT' ? Number(editing.TriggerMinAmount) : null,
        RewardKind: editing.RewardKind,
        RewardItemId: editing.RewardKind === 'SPECIFIC_ITEM' ? editing.RewardItemId || null : null,
        RewardQuantity: Number(editing.RewardQuantity),
        RewardPercent: Number(editing.RewardPercent),
        ApplyTo: editing.ApplyTo,
        MaxPerBill: Number(editing.MaxPerBill),
        MaxPerCustomerPerDay: editing.MaxPerCustomerPerDay === '' ? null : Number(editing.MaxPerCustomerPerDay),
        MaxTotalRedemptions: editing.MaxTotalRedemptions === '' ? null : Number(editing.MaxTotalRedemptions),
      }
      if (editing.Id) await posService.updateOffer(editing.Id, body)
      else await posService.createOffer(id, body)
      toast.success(editing.Id ? 'Offer updated' : 'Offer added')
      setEditing(null)
      load()
    } catch (e) {
      // The server refuses a rule that cannot fire, and its message names the
      // field. Surfacing it verbatim beats "invalid offer".
      toast.error(e?.response?.data?.message || 'Failed to save the offer')
    } finally {
      setSaving(false)
    }
  }

  const saveCampaign = async (payload) => {
    setSaving(true)
    try {
      await posService.updateCampaign(id, payload)
      toast.success('Campaign updated')
      setEditCampaign(false)
      load()
    } catch (e) {
      // The server refuses a window that could never contain a moment, and its
      // message says which. Surfacing it verbatim beats "invalid campaign".
      toast.error(e?.response?.data?.message || 'Failed to update the campaign')
    } finally {
      setSaving(false)
    }
  }

  const removeOffer = async (offer) => {
    try {
      await posService.deleteOffer(offer.Id)
      toast.success(`${offer.Name} retired`)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to retire the offer')
    }
  }

  if (loading) return <div className="fd-loading">Loading campaign…</div>
  if (!campaign) return <div className="fd-empty">Campaign not found.</div>

  return (
    <div className="cmp-page">
      <div className="cmp-head">
        <div>
          <Link to="/frontdesk/campaigns" className="cmp-back">← Campaigns</Link>
          <h1>{campaign.Name}</h1>
          <p className="cmp-lead">
            <span className={`cmp-pill is-${String(campaign.LiveState).toLowerCase()}`}>
              {campaign.LiveState.replace(/_/g, ' ')}
            </span>
            {' '}{campaign.Code} · {String(campaign.StartsOn).slice(0, 10)}
            {campaign.EndsOn ? ` – ${String(campaign.EndsOn).slice(0, 10)}` : ' onwards'}
            {campaign.BudgetAmount
              ? ` · ${money(campaign.SpentAmount)} of ${money(campaign.BudgetAmount)} given away`
              : ' · no budget cap'}
          </p>
        </div>
        {canEdit && (
          <span className="cmp-head-actions">
            <button className="fd-btn fd-btn-outline" onClick={() => setEditCampaign(true)}>
              Edit campaign
            </button>
            {tab === 'offers' && (
              <button className="fd-btn fd-btn-primary" onClick={() => setEditing(blankOffer())}>
                + Add offer
              </button>
            )}
          </span>
        )}
      </div>

      <div className="cmp-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'offers'}
          className={`cmp-tab ${tab === 'offers' ? 'is-on' : ''}`} onClick={() => setTab('offers')}>
          Offers ({campaign.offers?.length || 0})
        </button>
        <button role="tab" aria-selected={tab === 'report'}
          className={`cmp-tab ${tab === 'report' ? 'is-on' : ''}`} onClick={() => setTab('report')}>
          Performance
        </button>
      </div>

      {tab === 'offers' && (
        (campaign.offers || []).length === 0 ? (
          <div className="fd-empty">
            No offers yet. An offer is one rule: when something is true of the bill, make
            something cheaper.
          </div>
        ) : (
          <div className="cmp-offers">
            {campaign.offers.map((o) => (
              <div className="cmp-offer" key={o.Id}>
                <div className="cmp-offer-head">
                  <strong>{o.Name}</strong>
                  <span className="muted small">{o.RedemptionCount || 0} redeemed</span>
                  {canEdit && (
                    <span className="cmp-offer-actions">
                      <button className="fd-btn fd-btn-outline fd-btn-sm"
                        onClick={() => setEditing({ ...o, MaxPerCustomerPerDay: o.MaxPerCustomerPerDay ?? '', MaxTotalRedemptions: o.MaxTotalRedemptions ?? '' })}>
                        Edit
                      </button>
                      <button className="fd-btn fd-btn-outline fd-btn-sm" onClick={() => removeOffer(o)}>
                        Retire
                      </button>
                    </span>
                  )}
                </div>
                {/* The server's sentence — the same one the till and the audit
                    log show, so nobody has to reconcile two descriptions. */}
                <p className="cmp-sentence">{o.Sentence}</p>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'report' && (
        !report ? <div className="fd-loading">Loading performance…</div> : (
          <>
            {/* Cost and effect side by side, never netted into one number. */}
            <div className="cmp-kpis">
              <div className="cmp-kpi cost">
                <span className="l">Given away</span>
                <span className="v">{money(report.summary.givenAway)}</span>
                <span className="s">exact — every redemption is recorded</span>
              </div>
              <div className="cmp-kpi">
                <span className="l">Redemptions</span>
                <span className="v">{report.summary.redemptions}</span>
                <span className="s">on {report.summary.bills} bills</span>
              </div>
              <div className="cmp-kpi gain">
                <span className="l">Those bills came to</span>
                <span className="v">{money(report.summary.revenueOnThoseBills)}</span>
                <span className="s">not uplift — see below</span>
              </div>
              <div className="cmp-kpi">
                <span className="l">Average bill</span>
                <span className="v">{money(report.summary.averageBill)}</span>
              </div>
              <div className="cmp-kpi warn">
                <span className="l">Cost per redemption</span>
                <span className="v">{money(report.summary.costPerRedemption)}</span>
                <span className="s">{report.summary.costAsShareOfRevenue}% of those bills</span>
              </div>
            </div>

            <div className="cmp-note">
              <strong>What this campaign gave away is exact. What it caused is not.</strong>
              {' '}The revenue figure is what those bills came to, not what the campaign added —
              the people who order two chai were always going to spend more. The honest test is
              to pause it for a week and watch the same number.
            </div>

            {report.offers.length > 0 && (
              <div className="table-scroll-wrapper">
                <table className="fd-table">
                  <thead>
                    <tr><th>Offer</th><th className="num">Used</th><th className="num">Given away</th>
                      <th className="num">Per use</th><th className="num">Bills</th></tr>
                  </thead>
                  <tbody>
                    {report.offers.map((o) => (
                      <tr key={o.offerId}>
                        <td>{o.offerName}</td>
                        <td className="num">{o.redemptions}</td>
                        <td className="num">{money(o.givenAway)}</td>
                        <td className="num">{money(o.costPerRedemption)}</td>
                        <td className="num">{o.bills}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {report.byHour.length > 0 && (
              <div className="cmp-hours">
                <h3>When it fires</h3>
                {report.byHour.map((h) => {
                  const max = Math.max(...report.byHour.map((x) => x.redemptions), 1)
                  return (
                    <div className="cmp-hour" key={h.hour}>
                      <span className="hh">{String(h.hour).padStart(2, '0')}:00</span>
                      <span className="cmp-bar"><span style={{ width: `${(h.redemptions / max) * 100}%` }} /></span>
                      <span className="vv">{h.redemptions}</span>
                    </div>
                  )
                })}
                <p className="muted small">
                  An offer running at hours it is not changing anybody's mind is being paid for
                  twice.
                </p>
              </div>
            )}

            {report.recent.length > 0 && (
              <>
                <h3 className="cmp-h3">Every redemption</h3>
                <div className="table-scroll-wrapper">
                  <table className="fd-table">
                    <thead>
                      <tr><th>Invoice</th><th>Offer</th><th>Item</th>
                        <th className="num">Cost</th><th className="num">Bill</th><th>When · who</th></tr>
                    </thead>
                    <tbody>
                      {report.recent.map((r) => (
                        <tr key={r.id}>
                          <td>
                            {/* One click to the document that gave it away. */}
                            {r.transactionDetailLogId ? (
                              <button
                                type="button" className="fd-link-btn"
                                onClick={() => navigate(`/frontdesk/ledger?doc=${r.transactionDetailLogId}`)}
                              >
                                {r.transactionNo || 'View'}
                              </button>
                            ) : <span className="muted">—</span>}
                            {r.branchName && <div className="muted small">{r.branchName}</div>}
                          </td>
                          <td>{r.offerName}</td>
                          <td>{r.itemName || <span className="muted">—</span>}</td>
                          <td className="num">{money(r.discountAmount)}</td>
                          <td className="num">{money(r.billGrossAmount)}</td>
                          <td>
                            {r.redeemedOn ? new Date(r.redeemedOn).toLocaleString() : '—'}
                            <div className="muted small">{r.redeemedBy}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )
      )}

      {editCampaign && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Edit campaign">
          {/* The SAME form the create flow uses — two copies of six date, day
              and time controls is two places for a rule to be typed
              differently. */}
          <CampaignForm
            campaign={campaign}
            branches={branches}
            saving={saving}
            submitLabel="Save campaign"
            onCancel={() => setEditCampaign(false)}
            onSubmit={saveCampaign}
          />
        </div>
      )}

      {/* ── The offer builder ───────────────────────────────────────────── */}
      {editing && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Offer">
          <div className="cmp-modal cmp-modal-wide">
            <h3>{editing.Id ? 'Edit offer' : 'New offer'}</h3>

            {/* Six dropdowns can express a rule nobody can read back. */}
            <div className="cmp-readback">
              <span className="l">This offer says</span>
              <span className="s">{sentence}</span>
            </div>

            <label className="cmp-field">
              <span>Name<i>*</i></span>
              <input value={editing.Name} onChange={(e) => setEditing({ ...editing, Name: e.target.value })} />
            </label>

            <div className="cmp-rule">
              <span className="cmp-tag when">When</span>
              <div>
                <div className="cmp-line">
                  <select value={editing.TriggerKind} aria-label="Trigger"
                    onChange={(e) => setEditing({ ...editing, TriggerKind: e.target.value })}>
                    {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {editing.TriggerKind === 'BILL_AMOUNT' ? (
                  <div className="cmp-line">
                    <span>at least ₹</span>
                    <input type="number" min="1" style={{ width: 96 }} value={editing.TriggerMinAmount}
                      aria-label="Minimum bill amount"
                      onChange={(e) => setEditing({ ...editing, TriggerMinAmount: e.target.value })} />
                  </div>
                ) : (
                  <div className="cmp-line">
                    <input type="number" min="1" style={{ width: 62 }} value={editing.TriggerMinQty}
                      aria-label="Minimum quantity"
                      onChange={(e) => setEditing({ ...editing, TriggerMinQty: e.target.value })} />
                    <span>or more of</span>
                    {editing.TriggerKind === 'ITEM_QTY' ? (
                      <select value={editing.TriggerItemId} aria-label="Trigger item"
                        onChange={(e) => setEditing({ ...editing, TriggerItemId: e.target.value })}>
                        <option value="">Choose an item…</option>
                        {items.map((i) => <option key={i.Id || i.id} value={i.Id || i.id}>{i.Name}</option>)}
                      </select>
                    ) : (
                      <select value={editing.TriggerCategoryId} aria-label="Trigger category"
                        onChange={(e) => setEditing({ ...editing, TriggerCategoryId: e.target.value })}>
                        <option value="">Choose a category…</option>
                        {categories.map((c) => <option key={c.Id || c.id} value={c.Id || c.id}>{c.Name}</option>)}
                      </select>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="cmp-rule">
              <span className="cmp-tag then">Then</span>
              <div>
                <div className="cmp-line">
                  <span>make</span>
                  <input type="number" min="1" style={{ width: 62 }} value={editing.RewardQuantity}
                    aria-label="Reward quantity"
                    onChange={(e) => setEditing({ ...editing, RewardQuantity: e.target.value })} />
                  <select value={editing.RewardKind} aria-label="Reward kind"
                    onChange={(e) => setEditing({ ...editing, RewardKind: e.target.value })}>
                    {REWARDS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  {editing.RewardKind === 'SPECIFIC_ITEM' && (
                    <select value={editing.RewardItemId} aria-label="Reward item"
                      onChange={(e) => setEditing({ ...editing, RewardItemId: e.target.value })}>
                      <option value="">Choose an item…</option>
                      {items.map((i) => <option key={i.Id || i.id} value={i.Id || i.id}>{i.Name}</option>)}
                    </select>
                  )}
                  <select value={editing.RewardPercent} aria-label="Discount"
                    onChange={(e) => setEditing({ ...editing, RewardPercent: e.target.value })}>
                    {PERCENTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                {editing.RewardKind === 'SAME_ITEM' && (
                  <div className="cmp-line">
                    <span>applied to</span>
                    <select value={editing.ApplyTo} aria-label="Which line"
                      onChange={(e) => setEditing({ ...editing, ApplyTo: e.target.value })}>
                      <option value="CHEAPEST">the cheapest qualifying line</option>
                      <option value="DEAREST">the most expensive qualifying line</option>
                    </select>
                  </div>
                )}
                {/* Stated, not assumed — two tills must not disagree in front
                    of a customer. */}
                <p className="cmp-hint">
                  Where several lines qualify at different prices, this decides which one is
                  discounted.
                </p>
              </div>
            </div>

            <div className="cmp-rule">
              <span className="cmp-tag limit">But</span>
              <div>
                <div className="cmp-line">
                  <span>at most</span>
                  <input type="number" min="1" style={{ width: 62 }} value={editing.MaxPerBill}
                    aria-label="Max per bill"
                    onChange={(e) => setEditing({ ...editing, MaxPerBill: e.target.value })} />
                  <span>per bill,</span>
                  <input type="number" min="1" style={{ width: 62 }} placeholder="∞"
                    aria-label="Max per customer per day" value={editing.MaxPerCustomerPerDay}
                    onChange={(e) => setEditing({ ...editing, MaxPerCustomerPerDay: e.target.value })} />
                  <span>per customer a day,</span>
                  <input type="number" min="1" style={{ width: 84 }} placeholder="∞"
                    aria-label="Max total redemptions" value={editing.MaxTotalRedemptions}
                    onChange={(e) => setEditing({ ...editing, MaxTotalRedemptions: e.target.value })} />
                  <span>in total</span>
                </div>
                <p className="cmp-hint">Blank means no limit. The campaign's budget caps it too.</p>
              </div>
            </div>

            <div className="cmp-actions">
              <button className="fd-btn fd-btn-outline" onClick={() => setEditing(null)} disabled={saving}>
                Cancel
              </button>
              <button className="fd-btn fd-btn-primary" onClick={save} disabled={saving || !editing.Name.trim()}>
                {saving ? 'Saving…' : 'Save offer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CampaignDetail

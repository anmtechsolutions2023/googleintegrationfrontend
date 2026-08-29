import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { SCOPES, APP_CONFIG } from '../../constants'
import { useCan } from '../../hooks/useCan'
import CampaignForm, { DAYS } from './CampaignForm'
import './campaigns.css'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

/**
 * Campaigns — the container, and the switch.
 *
 * Offers live inside one, so this screen is deliberately about the CONTAINER:
 * when it runs, where, what it may spend, and whether it is on. The rules
 * themselves are one click away, because pausing a campaign at 8pm is a
 * different job from writing one.
 */

const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0)

const dateOnly = (d) => (d ? String(d).slice(0, 10) : null)

// What is actually happening, as opposed to what somebody intended. Derived on
// the server from the dates, the weekday, the hour and the budget.
const STATE = {
  LIVE: { label: 'Live', cls: 'live' },
  SCHEDULED: { label: 'Scheduled', cls: 'sched' },
  DRAFT: { label: 'Draft', cls: 'draft' },
  // Switched on and inside its dates, but not firing RIGHT NOW. These exist
  // because "Live" while the till refuses every bill is the worst thing this
  // column could say.
  OFF_TODAY: { label: 'Not today', cls: 'waiting', why: 'Does not run on this weekday' },
  OUTSIDE_HOURS: { label: 'Outside hours', cls: 'waiting', why: 'Outside its time window' },
  PAUSED: { label: 'Paused', cls: 'paused' },
  BUDGET_SPENT: { label: 'Budget spent', cls: 'spent' },
  ENDED: { label: 'Ended', cls: 'ended' },
}

const Campaigns = () => {
  const canEdit = useCan(SCOPES.POS_CONFIG_WRITE)
  const navigate = useNavigate()

  const [campaigns, setCampaigns] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  // Editing from the LIST, not just from the campaign's own page. The row shows
  // when a campaign runs — days and hours — and that is exactly the column
  // somebody comes here to correct after seeing "Outside hours" against it.
  const [editing, setEditing] = useState(null)
  const [opening, setOpening] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setCampaigns(await posService.getCampaigns())
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    posService.getPosBranches({ limit: MAX_LIMIT }).then(setBranches).catch(() => setBranches([]))
  }, [])

  const save = async (payload) => {
    setSaving(true)
    try {
      const { id } = await posService.createCampaign(payload)
      toast.success('Campaign created — add its offers next')
      setCreating(false)
      // Straight into the thing they actually came to do.
      navigate(`/frontdesk/campaigns/${id}`)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to create the campaign')
    } finally {
      setSaving(false)
    }
  }

  // The list query does not return branchIds — it has no reason to. The form
  // does send them, and the server treats a sent list as the whole truth and
  // rewrites the table from it. Opening the form on a list row would therefore
  // save a campaign's branch targeting away to nothing, silently. So the full
  // record is fetched first, and the form only opens once it is in hand.
  const openEdit = async (c) => {
    setOpening(c.Id)
    try {
      setEditing(await posService.getCampaign(c.Id))
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not open the campaign')
    } finally {
      setOpening(null)
    }
  }

  const update = async (payload) => {
    setSaving(true)
    try {
      await posService.updateCampaign(editing.Id, payload)
      toast.success(`${payload.Name || editing.Name} updated`)
      setEditing(null)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update the campaign')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (c) => {
    const next = c.Status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    try {
      await posService.setCampaignStatus(c.Id, next)
      toast.success(next === 'PAUSED'
        ? `${c.Name} paused — every offer in it has stopped`
        : `${c.Name} is live`)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to change the campaign')
    }
  }


  const totals = campaigns.reduce((acc, c) => ({
    live: acc.live + (c.LiveState === 'LIVE' ? 1 : 0),
    spent: acc.spent + Number(c.SpentAmount || 0),
    redemptions: acc.redemptions + Number(c.RedemptionCount || 0),
  }), { live: 0, spent: 0, redemptions: 0 })

  return (
    <div className="cmp-page">
      <div className="cmp-head">
        <div>
          <h1>🎯 Campaigns</h1>
          <p className="cmp-lead">
            A campaign is the container and the switch. Offers live inside one, and pausing it
            pauses all of them at once.
          </p>
        </div>
        {canEdit && (
          <button className="fd-btn fd-btn-primary" onClick={() => setCreating(true)}>+ New campaign</button>
        )}
      </div>

      <div className="cmp-kpis">
        <div className="cmp-kpi">
          <span className="l">Live now</span><span className="v">{totals.live}</span>
        </div>
        <div className="cmp-kpi cost">
          <span className="l">Given away</span><span className="v">{money(totals.spent)}</span>
        </div>
        <div className="cmp-kpi">
          <span className="l">Redemptions</span><span className="v">{totals.redemptions}</span>
        </div>
      </div>

      {loading ? (
        <div className="fd-loading">Loading campaigns…</div>
      ) : campaigns.length === 0 ? (
        <div className="fd-empty">
          No campaigns yet. A campaign holds the offers — buy-one-get-one, a free dish over a
          bill amount, a second one at half price.
        </div>
      ) : (
        <div className="table-scroll-wrapper">
          <table className="fd-table cmp-table">
            <thead>
              <tr>
                <th>Campaign</th><th style={{ width: 118 }}>State</th>
                <th style={{ width: 150 }}>Runs</th><th style={{ width: 78 }}>Offers</th>
                <th className="num" style={{ width: 118 }}>Given away</th>
                <th className="num" style={{ width: 96 }}>Used</th>
                <th style={{ width: 150 }}>Budget</th>
                {canEdit && <th style={{ width: 96 }} />}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const state = STATE[c.LiveState] || STATE.DRAFT
                const pct = c.BudgetAmount
                  ? Math.min(100, (Number(c.SpentAmount) / Number(c.BudgetAmount)) * 100)
                  : null
                return (
                  <tr
                    key={c.Id} className="is-clickable"
                    onClick={() => navigate(`/frontdesk/campaigns/${c.Id}`)}
                  >
                    <td>
                      <strong>{c.Name}</strong>
                      <div className="muted small">{c.Code}</div>
                    </td>
                    <td>
                      <span className={`cmp-pill is-${state.cls}`}>{state.label}</span>
                      {/* A state that is not LIVE says why, or the row is a
                          riddle somebody has to open the campaign to solve. */}
                      {state.why && <div className="muted small">{state.why}</div>}
                    </td>
                    <td>
                      {dateOnly(c.StartsOn)}
                      {c.EndsOn ? ` – ${dateOnly(c.EndsOn)}` : ''}
                      {c.DaysOfWeek && (
                        <div className="muted small">
                          {c.DaysOfWeek.split(',').map((d) => DAYS.find((x) => x.value === d)?.label).join(' ')}
                        </div>
                      )}
                      {c.StartTime && c.EndTime && (
                        <div className="muted small">
                          {String(c.StartTime).slice(0, 5)}–{String(c.EndTime).slice(0, 5)}
                        </div>
                      )}
                    </td>
                    <td>{c.OfferCount}</td>
                    <td className="num">{money(c.SpentAmount)}</td>
                    <td className="num">{c.RedemptionCount}</td>
                    <td>
                      {pct === null ? (
                        // Allowed, but worth saying plainly.
                        <span className="muted small">No cap</span>
                      ) : (
                        <>
                          <span className="cmp-bar">
                            <span style={{ width: `${pct}%`, background: pct >= 100 ? '#b9600f' : undefined }} />
                          </span>
                          <div className="muted small">
                            {Math.round(pct)}% of {money(c.BudgetAmount)}
                          </div>
                        </>
                      )}
                    </td>
                    {canEdit && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="cmp-row-actions">
                          {/* Offered even on an ENDED campaign — moving its end
                              date is the one edit that brings one back, and
                              disabling the control that fixes it is how a
                              campaign stays broken. */}
                          <button
                            className="fd-btn fd-btn-outline fd-btn-sm"
                            onClick={() => openEdit(c)}
                            disabled={opening === c.Id}
                          >
                            {opening === c.Id ? 'Opening…' : 'Edit'}
                          </button>
                          <button
                            className="fd-btn fd-btn-outline fd-btn-sm"
                            onClick={() => toggle(c)}
                            disabled={c.LiveState === 'ENDED'}
                          >
                            {c.Status === 'ACTIVE' ? 'Pause' : 'Go live'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── New campaign ────────────────────────────────────────────────── */}
      {/* ── Edit campaign ───────────────────────────────────────────────── */}
      {/* The SAME form the create flow and the detail page use. A second copy
          of six date, day and time controls is a second place for a rule to be
          typed differently. */}
      {editing && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Edit campaign">
          <CampaignForm
            campaign={editing}
            branches={branches}
            saving={saving}
            submitLabel="Save campaign"
            onCancel={() => setEditing(null)}
            onSubmit={update}
          />
        </div>
      )}

      {creating && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="New campaign">
          <CampaignForm
            branches={branches}
            saving={saving}
            submitLabel="Create & add offers"
            onCancel={() => setCreating(false)}
            onSubmit={save}
          />
        </div>
      )}
    </div>
  )
}

export default Campaigns

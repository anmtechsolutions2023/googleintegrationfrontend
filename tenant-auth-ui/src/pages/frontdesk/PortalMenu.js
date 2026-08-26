import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { APP_CONFIG, SCOPES } from '../../constants'
import { useCan } from '../../hooks/useCan'
import { PortalMonogram } from '../../components/frontdesk/PortalBadge'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

// One portal's catalogue: what it lists, at what price, and whether it is in
// stock there right now.
//
// ── Bulk is the feature, not a nicety ───────────────────────────────────────
// 200 dishes is 200 decisions per portal. An edit-one-row-at-a-time screen is
// the reason a feature like this goes unused, so selection and a bulk toggle
// are the primary interaction and the per-row form is the exception.
//
// ── A price here is a costinfo row, never a number ──────────────────────────
// The override column shows the resolved price and says where it came from, but
// setting one means choosing a cost record — that is what carries the tax group
// and the inclusive/exclusive flag the aggregator price genuinely needs. A bare
// decimal would be a price with no tax identity.

const money = (n) => (n === null || n === undefined ? '—' : `₹${Number(n).toFixed(2)}`)

const SYNC_TONE = {
  synced: { background: '#d5f5e3', color: '#1e8449', label: 'Synced' },
  pending: { background: '#ffeaa7', color: '#e67e22', label: 'Not sent' },
  failed: { background: '#fde8e8', color: '#c0392b', label: 'Failed' },
}

const PortalMenu = () => {
  const { portalId } = useParams()
  const canWrite = useCan(SCOPES.POS_CONFIG_WRITE)
  // Marking something out of stock is counter work done several times a day, so
  // it sits on OPS rather than CONFIG — gating "we've run out of prawns" behind
  // a manager means it does not get done.
  const canToggleStock = useCan(SCOPES.POS_OPS_WRITE) || canWrite

  const [portal, setPortal] = useState(null)
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, rows] = await Promise.all([
        posService.getPortal(portalId),
        posService.getPortalListings(portalId),
      ])
      setPortal(p)
      setListings(rows)
      setSelected([])
    } catch {
      toast.error('Failed to load the portal menu')
    } finally {
      setLoading(false)
    }
  }, [portalId])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (!search) return listings
    const q = search.toLowerCase()
    return listings.filter((l) => `${l.ItemName || ''} ${l.ListedName || ''} ${l.ExternalItemId || ''}`
      .toLowerCase().includes(q))
  }, [listings, search])

  const idOf = (l) => l.Id || l.id
  const allShownSelected = filtered.length > 0 && filtered.every((l) => selected.includes(idOf(l)))

  const toggleOne = (id) => setSelected((prev) => (
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  ))
  const toggleAllShown = () => setSelected(
    allShownSelected ? [] : filtered.map(idOf),
  )

  const setAvailability = async (available) => {
    if (selected.length === 0) return
    setBusy(true)
    try {
      const result = await posService.setPortalListingAvailability({
        ListingIds: selected,
        Available: available,
      })
      toast.success(`${result.updated} item${result.updated === 1 ? '' : 's'} marked ${available ? 'in stock' : 'out of stock'}`)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update availability')
    } finally {
      setBusy(false)
    }
  }

  const publish = async () => {
    setBusy(true)
    try {
      const result = await posService.publishPortalMenu(portalId)
      if (result.pushed) {
        toast.success(`${result.synced} item${result.synced === 1 ? '' : 's'} published`)
      } else {
        // A manual portal has nowhere to publish to, and saying "published" for
        // a push that never happened is exactly the lie the sync columns exist
        // to prevent.
        toast.info(result.detail || 'Nothing was published — this portal has no API configured.')
      }
      load()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to publish the menu')
    } finally {
      setBusy(false)
    }
  }

  const unsynced = listings.filter((l) => l.SyncStatus !== 'synced').length

  return (
    <div className="fd-crud-page" style={{ maxWidth: 1400 }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/frontdesk/portals" className="fd-link-btn" style={{ fontSize: 13 }}>
          ← All portals
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          {portal && <PortalMonogram portal={portal} size={36} />}
          <div>
            <h1 style={{ margin: 0 }}>{portal?.Name || 'Portal'} listings</h1>
            <p className="fd-page-sub" style={{ margin: '4px 0 0' }}>
              What this portal lists, at what price, and whether it is in stock there.
              A blank price inherits the branch price; an override carries its own tax group.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          type="text"
          className="search-input"
          placeholder={`Search ${listings.length} listings…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 260 }}
        />
        {unsynced > 0 && (
          <span className="fd-badge fd-badge-pending">{unsynced} out of sync</span>
        )}
        {canWrite && (
          <button
            type="button"
            className="fd-btn fd-btn-primary"
            style={{ marginLeft: 'auto' }}
            disabled={busy || listings.length === 0}
            onClick={publish}
          >
            Publish to {portal?.Name || 'portal'}
          </button>
        )}
      </div>

      {/* The bulk bar. Appears with a selection because that is the operation
          this screen exists for. */}
      {selected.length > 0 && canToggleStock && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, background: '#0f3460',
          borderRadius: 8, padding: '11px 16px', marginBottom: 14, flexWrap: 'wrap',
        }}
        >
          <strong style={{ fontSize: 13, color: '#fff' }}>
            {selected.length} selected
          </strong>
          <button type="button" className="fd-btn fd-btn-success" disabled={busy} onClick={() => setAvailability(true)}>
            In stock
          </button>
          <button type="button" className="fd-btn fd-btn-danger" disabled={busy} onClick={() => setAvailability(false)}>
            Out of stock
          </button>
          <button
            type="button"
            className="fd-btn fd-btn-outline"
            style={{ marginLeft: 'auto', color: '#b8cfe6', borderColor: 'rgba(255,255,255,.3)' }}
            onClick={() => setSelected([])}
          >
            Clear
          </button>
        </div>
      )}

      {loading && <div className="fd-loading">Loading listings…</div>}

      {!loading && listings.length === 0 && (
        <div className="fd-empty">
          Nothing listed on this portal yet. An item must be on the <strong>Online</strong>{' '}
          channel before it can be listed here.
        </div>
      )}

      {!loading && listings.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid #e1e5eb', borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,.06)', overflow: 'hidden',
        }}
        >
          <div className="fd-matrix-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all shown"
                      checked={allShownSelected}
                      onChange={toggleAllShown}
                      style={{ width: 15, height: 15, accentColor: '#0f3460' }}
                    />
                  </th>
                  <th>Item</th>
                  <th style={{ textAlign: 'right' }}>Branch price</th>
                  <th style={{ textAlign: 'right' }}>{portal?.Name || 'Portal'} price</th>
                  <th>Source</th>
                  <th>Stock</th>
                  <th>Sync</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const id = idOf(l)
                  const tone = SYNC_TONE[l.SyncStatus] || SYNC_TONE.pending
                  const isSelected = selected.includes(id)
                  return (
                    <tr key={id} style={{ background: isSelected ? '#f0f6fc' : undefined }}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${l.ItemName || 'item'}`}
                          checked={isSelected}
                          onChange={() => toggleOne(id)}
                          style={{ width: 15, height: 15, accentColor: '#0f3460' }}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{l.ListedName || l.ItemName || 'Item'}</div>
                        {l.ListedName && l.ItemName && l.ListedName !== l.ItemName && (
                          <div style={{ fontSize: 11.5, color: '#7f8c8d' }}>ours: {l.ItemName}</div>
                        )}
                        {l.ExternalItemId && (
                          <div style={{ fontSize: 11.5, color: '#b2bec3', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                            {l.ExternalItemId}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', color: '#7f8c8d' }}>{money(l.BaseAmount)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {money(l.TaxBreakdown?.grossAmount)}
                        {l.TaxBreakdown?.isTaxIncluded && (
                          <div style={{ fontSize: 11, color: '#7f8c8d', fontWeight: 400 }}>tax incl.</div>
                        )}
                      </td>
                      <td>
                        {/* Says WHERE the price came from, because "inherit" and
                            "deliberately the same number" look identical
                            otherwise. */}
                        <span style={{ fontSize: 12, color: l.PriceSource === 'override' ? '#2c3e50' : '#7f8c8d' }}>
                          {l.PriceSource === 'override' ? 'Portal override'
                            : l.PriceSource === 'branch' ? 'Inherited'
                              : 'No price'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`fd-badge ${l.Available ? 'fd-badge-active' : 'fd-badge-closed'}`}
                        >
                          {l.Available ? 'In stock' : 'Out'}
                        </span>
                      </td>
                      <td>
                        <span
                          className="fd-badge"
                          style={{ background: tone.background, color: tone.color }}
                          title={l.SyncError || undefined}
                        >
                          {tone.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && listings.length > 0 && (
        <p style={{ fontSize: 12, color: '#7f8c8d', marginTop: 12 }}>
          Showing {filtered.length} of {listings.length}. Availability here is only one of
          four gates — an item also has to be active, on the Online channel, and its branch
          has to be accepting orders from this portal.
        </p>
      )}
    </div>
  )
}

export default PortalMenu

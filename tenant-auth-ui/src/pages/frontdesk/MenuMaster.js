import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import MenuFilterBar from '../../components/frontdesk/MenuFilterBar'
import MenuBulkFieldModal from '../../components/frontdesk/MenuBulkFieldModal'
import useMenuFilters from '../../hooks/useMenuFilters'
import { genericPatch } from '../../services/posService'
import { effectiveTags, categoryNameOf, isOnSale } from '../../utils/menuFilters'
import { SCOPES } from '../../constants'
import ExportButton from '../../components/export/ExportButton'

// Item meta module config - wires to /api/pos/item-meta.
// Channels/Variants are multi-selects backed by the posChannel/posVariant masters
// (persisted via normalized join tables); Food Type references the posFoodType
// master (CRUD-managed).
//
// PRICE IS NOT EDITABLE HERE. In master data the item owns its price
// (itemdetail.CostInfoId → costinfo.Amount), so a menu entry only mirrors it.
// Asking for it again in this form invited two answers to one question. The
// field below is a read-only display of the selected item's price, and the API
// resolves the stored CostInfoId from the item.
const ITEM_META_CONFIG = {
  key: 'posItemMeta',
  name: 'Menu Items',
  endpoint: '/api/pos/item-meta',
  icon: '🍽️',
  displayField: 'ItemDetailId',
  // What a row's checkbox is announced as.
  selectionLabel: (row) => row?.ItemName || 'menu item',
  fields: [
    { name: 'ItemDetailId', label: 'Item', type: 'select', required: true, reference: 'itemDetails' },
    {
      name: 'CostInfoAmount',
      label: 'Cost Info',
      type: 'derived',
      // itemDetails is fetched with expand=true, so each option already carries
      // the cost fields (joined from costinfo/taxgroup) — no extra lookup needed.
      derive: {
        from: 'ItemDetailId',
        reference: 'itemDetails',
        valueField: 'CostAmount',
        owns: 'CostInfoId',
        // Read-only summary of the selected item's cost, shown as a small card
        // instead of a single price input. Values are resolved from the item.
        summary: [
          { valueField: 'CostAmount', label: 'Price', format: 'amount' },
          { valueField: 'CostTaxGroupName', label: 'Tax Group', format: 'text' },
          { valueField: 'CostIsTaxIncluded', label: 'Tax', format: 'taxIncluded' },
        ],
      },
      wide: true,
      derivedFromLabel: 'Item',
      hint: 'Comes from the selected item. Change it in Admin → Data tables → Items.',
      emptyText: 'No price set on this item',
    },
    { name: 'FoodTypeId', label: 'Food Type', type: 'select', required: true, reference: 'posFoodType' },
    // ORTHOGONAL to Food Type, not a refinement of it: a dish is Non-Veg (food
    // type) AND Chicken (meat type). Optional — a vegetarian kitchen sets none.
    { name: 'MeatTypeId', label: 'Meat Type', type: 'select', reference: 'posMeatTypes' },
    { name: 'BranchDetailId', label: 'Branch', type: 'select', required: true, reference: 'posBranches' },
    { name: 'ChannelIds', label: 'Channels', type: 'multiselect', reference: 'posChannel', wide: true },
    { name: 'VariantIds', label: 'Variants', type: 'multiselect', reference: 'posVariant', wide: true },
    // BOTH are a per-unit surcharge on the item price, added before tax — a
    // variant priced 30 makes a 100 dish cost 130, it does not make it cost 30.
    // (An earlier comment here claimed a variant REPLACED the price. Nothing
    // ever implemented that: pricing.service has always added, and tenants
    // price their variants as surcharges accordingly. Corrected rather than
    // implemented, because changing it now would silently reprice live menus.)
    //
    // What actually separates them is the RULES: an add-on group carries
    // MinSelection/MaxSelection, so a choice can be compulsory or capped. A
    // variant has no such pair, which is why the two stay different fields and
    // why the till validates them differently.
    { name: 'AddonGroupIds', label: 'Add-on Groups', type: 'multiselect', reference: 'posAddonGroups', wide: true },
    // What the SECTION already gives this dish. Read-only on purpose: it is
    // owned by the category, and one edit there beats the same edit on every
    // dish filed under it. Shown so "why does the till say Chinese, I never set
    // that?" is answerable on the screen where it gets asked.
    {
      name: 'CategoryTags',
      label: 'From its category',
      type: 'chips',
      wide: true,
      emptyText: 'This dish\'s category has no tags yet.',
      hint: 'Change these under Menu → Categories & hours → Categories.',
    },
    // The dish's OWN tags. The till filters on the union of these and the
    // inherited set above. Grouped by type: a flat dozen makes "Starter" and
    // "Chinese" look like the same kind of choice.
    {
      name: 'TagIds',
      label: 'Menu Tags',
      type: 'multiselect',
      reference: 'posMenuTags',
      groupBy: 'TagType',
      wide: true,
      hint: 'Added to whatever the category already provides.',
    },
    // What the till will ACTUALLY find this dish under: the section's tags plus
    // its own. Shown because you are editing two lists and the answer is
    // neither of them — and it is the same answer the cashier gets.
    {
      name: 'EffectiveTags',
      label: 'The till will find this dish under',
      type: 'chips',
      wide: true,
      emptyText: 'Nothing yet — it is findable by name only.',
      source: (row, refs) => {
        const own = Array.isArray(row?.TagIds) ? row.TagIds : []
        const master = refs?.posMenuTags || []
        const nameOfTag = (id) => {
          const hit = master.find((o) => (o.id || o.Id) === id)
          return hit ? (hit.Name || hit.name) : null
        }
        const out = []
        const seen = new Set()
        own.forEach((id) => {
          const name = nameOfTag(id)
          if (!name || seen.has(id)) return
          seen.add(id)
          out.push({ id, name })
        })
        ;(Array.isArray(row?.CategoryTags) ? row.CategoryTags : []).forEach((t) => {
          if (!t || seen.has(t.id)) return
          seen.add(t.id)
          out.push(t)
        })
        return out
      },
    },
    // ServesCount counts people; PortionSize is the measure ("350 ml"). They
    // answer different questions, which is why one field could not do both.
    { name: 'ServesCount', label: 'Serves', type: 'number', min: 0, max: 255 },
    { name: 'PortionSize', label: 'Portion Size', type: 'text', maxLength: 50, hint: 'e.g. 350 ml, 12 pieces' },
    {
      name: 'PrepTimeMinutes',
      label: 'Prep Time (min)',
      type: 'number',
      min: 0,
      hint: "This dish's own prep time. An order's KPT comes from its slowest line.",
    },
    {
      name: 'Nutrition',
      label: 'Nutrition',
      type: 'json',
      wide: true,
      // A JSON field rather than ten inputs: the data is sparse (most kitchens
      // never record it), it is optional per dish, and giving it ten permanent
      // rows on this form would push everything a cashier actually edits below
      // the fold. Send null to clear the record entirely.
      hint: 'Optional. Keys: ServingSizeG, Calories, ProteinG, CarbohydrateG, SugarG, FatG, SaturatedFatG, FibreG, SodiumMg, Allergens. Leave empty for no data.',
    },
    {
      // OPT IN. Off for every dish that exists, which keeps them unlimited.
      // On means the stricter rule applies: no count entered for a day and the
      // dish is not sold that day. Set the numbers under Today's Counts.
      name: 'StockTracked',
      label: 'Track daily quantity',
      type: 'boolean',
      default: false,
      hint: 'On: this dish is only sold when somebody has entered how many were made that day. Set the number under Menu → Stock & units → Today\'s Counts.',
    },
    {
      // Not inventory: a kitchen holding forty portions may still refuse to
      // send twelve to one table.
      name: 'MaxPerOrder',
      label: 'Max per order',
      type: 'number',
      min: 1,
      hint: 'The most one order may take. Leave empty for no limit. Separate from the daily quantity.',
    },
    { name: 'Active', type: 'boolean', default: true },
  ],
  tableColumns: [
    // CostInfoAmount rather than CostInfoId — the price is more useful in the
    // list than the id of the cost row, and the API already joins it.
    // MeatTypeName, not MeatTypeId: the API joins the name, and a uuid in a
    // list answers nothing.
    'ItemDetailId',
    // The two things the filters above narrow by, so a filtered list shows why
    // each row is in it.
    { key: 'CategoryName', label: 'Category', render: (_, row) => categoryNameOf(row) },
    { key: 'EffectiveTags', label: 'Tags', render: (_, row) => <TagsCell row={row} /> },
    'FoodTypeId', 'MeatTypeName', 'BranchDetailId', 'CostInfoAmount',
    'ChannelIds', 'VariantIds', 'AddonGroupIds', 'ServesCount', 'PrepTimeMinutes',
    'CreatedOn',
  ],
  searchFields: ['FoodTypeId'],
}

/**
 * A row's tags as the till sees them: its own solid, its category's dashed —
 * the same marks the Billing cards use, explained by the legend in the filters.
 */
function TagsCell({ row }) {
  const tags = effectiveTags(row)
  if (tags.length === 0) return <span className="muted">—</span>
  return (
    <div className="fd-item-tags">
      {tags.map((t) => (
        <span
          key={t.id}
          className={`fd-item-tag${t.from === 'category' ? ' is-inherited' : ''}`}
          title={t.from === 'category' ? `From ${categoryNameOf(row)}` : 'Set on this dish'}
        >
          {t.name}
        </span>
      ))}
    </div>
  )
}

// The name a row is searched under. Module-level so it is stable: every chip
// count is recomputed when it changes.
const nameOfRow = (row) => row?.ItemName || row?.Name || ''

/**
 * The till's filters over the menu being set up: search, category, diet and
 * tags, with the same counts and rules as Billing.
 */
const MenuMasterFilters = ({ items, onFilter }) => {
  const filters = useMenuFilters(items, nameOfRow)
  const key = JSON.stringify(filters.state)
  useEffect(() => { onFilter(filters.filtered, key) }, [filters.filtered, key, onFilter])
  return (
    <div className="fd-menu-master-filters">
      <MenuFilterBar
        filters={filters}
        menu={items}
        searchPlaceholder="Search dishes, categories, cuisines, courses..."
        showSaleFilter
      />
    </div>
  )
}

// ── Turning dishes on and off, and changing many at once ─────────────────────

const BULK_ENDPOINT = '/api/pos/item-meta/bulk'
const bulkUpdate = (ids, changes) => genericPatch(BULK_ENDPOINT, { ids, changes })
const idOf = (row) => row?.Id || row?.id
const itemsText = (n) => `${n} item${n === 1 ? '' : 's'}`
const messageOf = (err, fallback) => err?.response?.data?.message || fallback

/** Shows each dish as it was, grouped by what Active was, in local rows only. */
const showBefore = (before, api) => {
  const on = before.filter((b) => b.on).map((b) => b.id)
  const off = before.filter((b) => !b.on).map((b) => b.id)
  if (on.length) api.patchRows(on, { Active: 1 })
  if (off.length) api.patchRows(off, { Active: 0 })
  return { on, off }
}

/**
 * Turns dishes on or off: shown straight away, saved in one request, put back
 * if the save fails, and undoable from the toast that confirms it.
 * @returns {Promise<boolean>} whether it saved
 */
const setActiveFor = async (rows, active, api) => {
  const ids = rows.map(idOf)
  const before = rows.map((r) => ({ id: idOf(r), on: isOnSale(r) }))
  api.patchRows(ids, { Active: active ? 1 : 0 })
  try {
    await bulkUpdate(ids, { Active: active })
  } catch (err) {
    showBefore(before, api)
    toast.error(messageOf(err, 'Could not save, so nothing was changed. Try again.'))
    return false
  }

  const undo = async () => {
    const { on, off } = showBefore(before, api)
    try {
      if (on.length) await bulkUpdate(on, { Active: true })
      if (off.length) await bulkUpdate(off, { Active: false })
      toast.info('Undone')
    } catch (err) {
      toast.error(messageOf(err, 'Could not undo. Refresh to see the current state.'))
    }
  }
  const label = rows.length === 1 ? (rows[0].ItemName || '1 item') : itemsText(rows.length)
  toast.success(
    <span className="fd-undo-toast">
      <span>{label} turned {active ? 'on' : 'off'}</span>
      <button type="button" onClick={undo}>Undo</button>
    </span>,
    { autoClose: 8000 },
  )
  return true
}

/** The Active column: a switch for someone who can write, a badge otherwise. */
const ActiveSwitch = ({ row, api }) => {
  const [busy, setBusy] = useState(false)
  const on = isOnSale(row)
  const name = row.ItemName || 'this item'
  if (!api.canWrite) {
    return <span className={`status-badge ${on ? 'active' : 'inactive'}`}>{on ? 'On' : 'Off'}</span>
  }
  return (
    <div className="fd-sale-cell">
      <label className="fd-sale-toggle">
        <input
          type="checkbox"
          role="switch"
          className="fd-switch is-sale"
          checked={on}
          disabled={busy}
          aria-label={`${name} on sale`}
          onChange={async () => {
            setBusy(true)
            await setActiveFor([row], !on, api)
            setBusy(false)
          }}
        />
        <span className={on ? 'is-on' : 'is-off'}>{on ? 'On' : 'Off'}</span>
      </label>
      {!on && <span className="fd-sale-note">Can&apos;t be ordered</span>}
    </div>
  )
}

const leadingColumns = (api) => [
  { key: 'Active', label: 'Active', render: (_, row) => <ActiveSwitch row={row} api={api} /> },
]

const OffIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="8" cy="8" r="6" /><path d="M4 12 12 4" />
  </svg>
)
const OnIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8.5 6.5 12 13 4.5" />
  </svg>
)

/**
 * The bar above the list once dishes are ticked: turn them off or on in one
 * go, or change another field for all of them.
 */
const MenuBulkBar = ({ api }) => {
  const [confirm, setConfirm] = useState(null) // 'on' | 'off'
  const [fieldOpen, setFieldOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const rows = api.selectedRows
  const n = rows.length
  const visible = api.visibleRows
  const allShown = visible.length > 0 && visible.every((r) => api.selectedIds.includes(idOf(r)))

  const applyActive = async (targetRows, active) => {
    setBusy(true)
    const ok = await setActiveFor(targetRows, active, api)
    setBusy(false)
    return ok
  }

  const applyField = async (ids, changes, summary) => {
    if (changes.Active !== undefined) {
      const ok = await applyActive(rows.filter((r) => ids.includes(idOf(r))), changes.Active)
      if (ok) setFieldOpen(false)
      return
    }
    setBusy(true)
    try {
      await bulkUpdate(ids, changes)
      toast.success(summary)
      setFieldOpen(false)
      // Link fields change joined names (tags, channels), so read them back.
      await api.refresh()
    } catch (err) {
      toast.error(messageOf(err, 'Could not save, so nothing was changed. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  if (n === 0) {
    return <p className="fd-bulk-hint">Tick dishes to change them together, or flip Active on a single row.</p>
  }

  const already = confirm ? rows.filter((r) => isOnSale(r) === (confirm === 'on')).length : 0
  const names = rows.map((r) => r.ItemName || 'Unnamed item')

  return (
    <>
      <div className="fd-bulk-bar" role="region" aria-label="Bulk actions">
        <span className="fd-bulk-count">{n} selected</span>
        {!allShown && visible.length > 0 && (
          <button type="button" className="fd-bulk-link" onClick={() => api.setSelectedIds(visible.map(idOf))}>
            Select all {visible.length} shown
          </button>
        )}
        <span className="fd-bulk-sep" aria-hidden="true" />
        <div className="fd-bulk-actions">
          <button type="button" className="fd-bulk-btn is-off" onClick={() => setConfirm('off')} disabled={busy}>
            <OffIcon /> Turn off
          </button>
          <button type="button" className="fd-bulk-btn is-on" onClick={() => setConfirm('on')} disabled={busy}>
            <OnIcon /> Turn on
          </button>
          <button type="button" className="fd-bulk-btn is-more" onClick={() => setFieldOpen(true)} disabled={busy}>
            Change a field…
          </button>
        </div>
        <button type="button" className="fd-bulk-link fd-bulk-clear" onClick={api.clearSelection}>
          Clear selection
        </button>
      </div>

      {confirm && (
        <div className="fd-modal-overlay" onClick={() => !busy && setConfirm(null)}>
          <div
            className="fd-modal fd-bulk-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fd-bulk-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="fd-bulk-confirm-title">Turn {confirm} {itemsText(n)}?</h3>
            <p>
              {confirm === 'off'
                ? 'They stop being orderable straight away: greyed out at Billing, even in a section whose hours are open. Rounds already placed are not touched. Turn them back on any time.'
                : 'They can be ordered again whenever their section\'s hours allow.'}
            </p>
            <ul className="fd-bulk-names">
              {names.slice(0, 6).map((name, i) => <li key={`${name}-${i}`}>{name}</li>)}
              {n > 6 && <li>+{n - 6} more</li>}
            </ul>
            {already > 0 && (
              <p className="fd-bulk-already">{itemsText(already)} {already === 1 ? 'is' : 'are'} already {confirm}.</p>
            )}
            <div className="fd-bulk-modal-actions">
              <button type="button" className="fd-btn fd-btn-outline" onClick={() => setConfirm(null)} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className={`fd-btn ${confirm === 'off' ? 'fd-btn-danger' : 'fd-btn-success'}`}
                disabled={busy}
                onClick={async () => { if (await applyActive(rows, confirm === 'on')) setConfirm(null) }}
              >
                {busy ? 'Saving…' : `Turn ${confirm} ${itemsText(n)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {fieldOpen && (
        <MenuBulkFieldModal
          rows={rows}
          referenceData={api.referenceData}
          busy={busy}
          onClose={() => setFieldOpen(false)}
          onApply={applyField}
        />
      )}
    </>
  )
}

const MenuMaster = () => (
  <PosCrudPage
    moduleConfig={ITEM_META_CONFIG}
    writeScopes={[SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN]}
    filterPanel={MenuMasterFilters}
    bulkBar={MenuBulkBar}
    leadingColumns={leadingColumns}
    headerActions={<ExportButton exportKey={['menu-items', 'menu-branch']} className="btn btn-secondary" />}
  />
)

export default MenuMaster

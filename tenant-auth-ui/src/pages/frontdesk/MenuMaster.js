import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { SCOPES } from '../../constants'

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
      hint: 'Comes from the selected item. Change it in Master Data → Items.',
      emptyText: 'No price set on this item',
    },
    { name: 'FoodTypeId', label: 'Food Type', type: 'select', required: true, reference: 'posFoodType' },
    { name: 'BranchDetailId', label: 'Branch', type: 'select', required: true, reference: 'branchDetails' },
    { name: 'ChannelIds', label: 'Channels', type: 'multiselect', reference: 'posChannel', wide: true },
    { name: 'VariantIds', label: 'Variants', type: 'multiselect', reference: 'posVariant', wide: true },
    { name: 'Active', type: 'boolean', default: true },
  ],
  tableColumns: [
    // CostInfoAmount rather than CostInfoId — the price is more useful in the
    // list than the id of the cost row, and the API already joins it.
    'ItemDetailId', 'FoodTypeId', 'BranchDetailId', 'CostInfoAmount',
    'ChannelIds', 'VariantIds', 'Active', 'CreatedOn',
  ],
  searchFields: ['FoodTypeId'],
}

const MenuMaster = () => (
  <PosCrudPage
    moduleConfig={ITEM_META_CONFIG}
    writeScopes={[SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN]}
  />
)

export default MenuMaster

import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { SCOPES } from '../../constants'

// Item meta module config - wires to /api/pos/item-meta.
// Channels/Variants are multi-selects backed by the posChannel/posVariant masters
// (persisted via normalized join tables); price references a costInfos master row;
// Food Type references the posFoodType master (CRUD-managed).
const ITEM_META_CONFIG = {
  key: 'posItemMeta',
  name: 'Menu Items',
  endpoint: '/api/pos/item-meta',
  icon: '🍽️',
  displayField: 'ItemDetailId',
  fields: [
    { name: 'ItemDetailId', label: 'Item', type: 'select', required: true, reference: 'itemDetails' },
    { name: 'FoodTypeId', label: 'Food Type', type: 'select', required: true, reference: 'posFoodType' },
    { name: 'BranchDetailId', label: 'Branch', type: 'select', required: true, reference: 'branchDetails' },
    { name: 'CostInfoId', label: 'Price (Cost Info)', type: 'select', reference: 'costInfos' },
    { name: 'ChannelIds', label: 'Channels', type: 'multiselect', reference: 'posChannel', wide: true },
    { name: 'VariantIds', label: 'Variants', type: 'multiselect', reference: 'posVariant', wide: true },
    { name: 'Active', type: 'boolean', default: true },
  ],
  tableColumns: [
    'ItemDetailId', 'FoodTypeId', 'BranchDetailId', 'CostInfoId',
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

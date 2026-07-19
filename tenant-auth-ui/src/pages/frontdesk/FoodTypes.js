import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { SCOPES } from '../../constants'

// Food Type master config — wires to /api/pos/food-types.
// Replaces the previously hardcoded veg/nonveg/vegan list; referenced by the
// Menu Master form (FoodTypeId). IsVeg drives the veg/non-veg badge on Billing.
const FOOD_TYPE_CONFIG = {
  key: 'posFoodType',
  name: 'Food Types',
  endpoint: '/api/pos/food-types',
  icon: '🥗',
  displayField: 'Name',
  fields: [
    { name: 'Name', type: 'text', required: true, maxLength: 100 },
    { name: 'Code', type: 'text', required: true, maxLength: 50 },
    { name: 'Description', type: 'textarea', maxLength: 255 },
    { name: 'SortOrder', label: 'Sort Order', type: 'number', default: 0 },
    { name: 'IsVeg', label: 'Is Vegetarian', type: 'boolean', default: false },
    { name: 'Active', type: 'boolean', default: true },
  ],
  tableColumns: ['Name', 'Code', 'Description', 'SortOrder', 'IsVeg', 'Active', 'CreatedBy', 'CreatedOn'],
  searchFields: ['Name', 'Code'],
}

const FoodTypes = () => (
  <PosCrudPage
    moduleConfig={FOOD_TYPE_CONFIG}
    writeScopes={[SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN]}
  />
)

export default FoodTypes

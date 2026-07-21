import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { SCOPES } from '../../constants'

// Variant master config — wires to /api/pos/variants (item variants: Half/Full, sizes…)
const VARIANT_CONFIG = {
  key: 'posVariant',
  name: 'Variants',
  endpoint: '/api/pos/variants',
  icon: '🧩',
  displayField: 'Name',
  fields: [
    { name: 'Name', type: 'text', required: true, maxLength: 100 },
    { name: 'Code', type: 'text', required: true, maxLength: 50 },
    { name: 'Description', type: 'textarea', maxLength: 255 },
    { name: 'SortOrder', label: 'Sort Order', type: 'number', default: 0 },
    { name: 'Price', type: 'number', step: 0.0001, required: true, min: 0 },
    { name: 'Active', type: 'boolean', default: true },
  ],
  tableColumns: ['Name', 'Code', 'Description', 'SortOrder', 'Price', 'Active', 'CreatedBy', 'CreatedOn'],
  searchFields: ['Name', 'Code'],
}

const Variants = () => (
  <PosCrudPage
    moduleConfig={VARIANT_CONFIG}
    writeScopes={[SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN]}
  />
)

export default Variants

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
    // ORTHOGONAL to Food Type, not a refinement of it: a dish is Non-Veg (food
    // type) AND Chicken (meat type). Optional — a vegetarian kitchen sets none.
    { name: 'MeatTypeId', label: 'Meat Type', type: 'select', reference: 'posMeatTypes' },
    { name: 'BranchDetailId', label: 'Branch', type: 'select', required: true, reference: 'posBranches' },
    { name: 'ChannelIds', label: 'Channels', type: 'multiselect', reference: 'posChannel', wide: true },
    { name: 'VariantIds', label: 'Variants', type: 'multiselect', reference: 'posVariant', wide: true },
    // A variant REPLACES the price (Half/Full); an add-on group AUGMENTS it
    // (extra cheese) and carries its own min/max selection rules. Two different
    // things, deliberately two different fields.
    { name: 'AddonGroupIds', label: 'Add-on Groups', type: 'multiselect', reference: 'posAddonGroups', wide: true },
    { name: 'TagIds', label: 'Menu Tags', type: 'multiselect', reference: 'posMenuTags', wide: true },
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
    { name: 'Active', type: 'boolean', default: true },
  ],
  tableColumns: [
    // CostInfoAmount rather than CostInfoId — the price is more useful in the
    // list than the id of the cost row, and the API already joins it.
    // MeatTypeName, not MeatTypeId: the API joins the name, and a uuid in a
    // list answers nothing.
    'ItemDetailId', 'FoodTypeId', 'MeatTypeName', 'BranchDetailId', 'CostInfoAmount',
    'ChannelIds', 'VariantIds', 'AddonGroupIds', 'ServesCount', 'PrepTimeMinutes',
    'Active', 'CreatedOn',
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

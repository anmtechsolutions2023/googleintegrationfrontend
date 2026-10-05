// Which write permissions turn each screen from "view" into "change".
//
// A screen is OFFERED on its read scopes (workspaces.js). What a person can DO
// there depends on the write scopes its buttons are gated on — useCan,
// writeScopes and hasScope calls inside each page, and the server routes behind
// them. This table records those, one entry per screen, for the access preview
// and a person's access summary: "Edit" when every listed scope is held, "Part"
// when some are, "View" when none are.
//
// Compiled from the pages' own gates during the roles & permissions audit
// (Oct 2026). A screen missing here is shown as view-only. When a page gains or
// changes a write gate, change it here too.
export const SCREEN_WRITE_SCOPES = {
  '/billing': ['POS_ORDER:WRITE', 'POS_BILLING:WRITE'],
  '/service/floor/tables': ['POS_ORDER:WRITE'],
  '/service/floor/qr': ['POS_ORDER:WRITE', 'POS_QR:WRITE'],
  '/service/counter/tokens': ['POS_OPS:WRITE'],
  '/service/counter/online': ['POS_OPS:WRITE'],
  '/service/counter/tracking': ['POS_OPS:WRITE'],
  '/service/kitchen': ['POS_KITCHEN:WRITE'],
  '/menu/items': ['POS_CONFIG:WRITE'],
  '/menu/categories/hours': ['POS_CONFIG:WRITE'],
  '/menu/categories/categories': ['MASTER_DATA:WRITE'],
  '/menu/options/variants': ['POS_CONFIG:WRITE'],
  '/menu/options/addon-groups': ['POS_CONFIG:WRITE'],
  '/menu/options/addons': ['POS_CONFIG:WRITE'],
  '/menu/labels/food-types': ['POS_CONFIG:WRITE'],
  '/menu/labels/meat-types': ['POS_CONFIG:WRITE'],
  '/menu/labels/menu-tags': ['POS_CONFIG:WRITE'],
  '/menu/channels/channels': ['POS_CONFIG:WRITE'],
  '/menu/channels/portals': ['POS_CONFIG:WRITE'],
  '/menu/channels/rejection-reasons': ['POS_CONFIG:WRITE'],
  '/menu/stock/daily': ['POS_CONFIG:WRITE', 'POS_OPS:WRITE'],
  '/menu/stock/inventory': ['INVENTORY:WRITE'],
  '/menu/stock/units': ['MASTER_DATA:WRITE'],
  '/menu/stock/uom-factors': ['MASTER_DATA:WRITE'],
  '/menu/stock/batches': ['INVENTORY:WRITE'],
  '/outlet/business/profile': ['ORGANIZATION:WRITE', 'POS_CONFIG:WRITE'],
  '/outlet/business/branches': ['ORGANIZATION:WRITE'],
  '/outlet/business/organizations': ['ORGANIZATION:WRITE'],
  '/outlet/floors/floors': ['POS_CONFIG:WRITE'],
  '/outlet/floors/tables': ['POS_CONFIG:WRITE'],
  '/outlet/floors/qr-codes': ['POS_QR:WRITE'],
  '/outlet/front-desk': ['POS_CONFIG:WRITE'],
  '/outlet/receipts': ['POS_CONFIG:WRITE'],
  '/outlet/payments/branch': ['POS_CONFIG:WRITE', 'MASTER_DATA:WRITE'],
  '/outlet/payments/modes': ['PAYMENTS:WRITE'],
  '/outlet/payments/received-types': ['PAYMENTS:WRITE'],
  '/outlet/tax/gst': ['POS_CONFIG:WRITE'],
  '/outlet/tax/tax-types': ['MASTER_DATA:WRITE'],
  '/outlet/tax/tax-groups': ['MASTER_DATA:WRITE'],
  '/outlet/tax/mappers': ['MASTER_DATA:WRITE'],
  '/outlet/numbering': ['TRANSACTIONS:WRITE'],
  '/money/overview': ['TRANSACTIONS:WRITE'],
  '/money/ledger': ['TRANSACTIONS:WRITE', 'REFUND:APPROVE'],
  '/money/dues': ['POS_BILLING:WRITE', 'TRANSACTIONS:WRITE'],
  '/money/returns': ['TRANSACTIONS:WRITE', 'REFUND:APPROVE'],
  '/money/cash': ['POS_BILLING:WRITE'],
  '/money/expenses/expenses': ['POS_OPS:WRITE', 'EXPENSE:APPROVE'],
  '/money/expenses/categories': ['EXPENSE:APPROVE'],
  '/money/assets/register': ['ASSET:WRITE'],
  '/money/assets/categories': ['ASSET:WRITE'],
  '/money/gst': ['TRANSACTIONS:WRITE'],
  '/guests/customers': ['POS_CRM:WRITE'],
  '/guests/feedback': ['POS_CRM:WRITE'],
  '/guests/offers': ['POS_CONFIG:WRITE'],
  '/org/people': ['TENANT:ADMIN'],
  '/org/data': ['MASTER_DATA:WRITE', 'ORGANIZATION:WRITE', 'TRANSACTIONS:WRITE', 'INVENTORY:WRITE', 'CONTACTS:WRITE', 'PAYMENTS:WRITE'],
}

export default SCREEN_WRITE_SCOPES

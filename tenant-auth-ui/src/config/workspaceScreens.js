import React from 'react'
import FrontDeskDashboard from '../pages/frontdesk/FrontDeskDashboard'
import Billing from '../pages/frontdesk/Billing'
import Tables from '../pages/frontdesk/Tables'
import QrOrders from '../pages/frontdesk/QrOrders'
import Kitchen from '../pages/frontdesk/Kitchen'
import Tokens from '../pages/frontdesk/Tokens'
import OnlineOrders from '../pages/frontdesk/OnlineOrders'
import Tracking from '../pages/frontdesk/Tracking'
import MenuMaster from '../pages/frontdesk/MenuMaster'
import CategorySchedules from '../pages/frontdesk/CategorySchedules'
import Variants from '../pages/frontdesk/Variants'
import AddonGroups from '../pages/frontdesk/AddonGroups'
import Addons from '../pages/frontdesk/Addons'
import FoodTypes from '../pages/frontdesk/FoodTypes'
import MeatTypes from '../pages/frontdesk/MeatTypes'
import MenuTags from '../pages/frontdesk/MenuTags'
import Channels from '../pages/frontdesk/Channels'
import Portals from '../pages/frontdesk/Portals'
import PortalMenu from '../pages/frontdesk/PortalMenu'
import RejectionReasons from '../pages/frontdesk/RejectionReasons'
import Inventory from '../pages/frontdesk/Inventory'
import BusinessProfile from '../pages/frontdesk/BusinessProfile'
import Floors from '../pages/frontdesk/Floors'
import QrCodes from '../pages/frontdesk/QrCodes'
import PosSettings from '../pages/frontdesk/PosSettings'
import ReceiptFormat from '../pages/frontdesk/ReceiptFormat'
import PaymentMethods from '../pages/frontdesk/PaymentMethods'
import GstSettings from '../pages/frontdesk/GstSettings'
import Finance from '../pages/frontdesk/Finance'
import Ledger from '../pages/frontdesk/Ledger'
import Returns from '../pages/frontdesk/Returns'
import CashSessions from '../pages/frontdesk/CashSessions'
import Expenses from '../pages/frontdesk/Expenses'
import ExpenseCategories from '../pages/frontdesk/ExpenseCategories'
import Assets from '../pages/frontdesk/Assets'
import AssetCategories from '../pages/frontdesk/AssetCategories'
import Customers from '../pages/frontdesk/Customers'
import Feedback from '../pages/frontdesk/Feedback'
import Campaigns from '../pages/frontdesk/Campaigns'
import CampaignDetail from '../pages/frontdesk/CampaignDetail'
import Reports from '../pages/frontdesk/Reports'
import ReportsHome from '../pages/ReportsHome'
import AccessControl from '../pages/frontdesk/AccessControl'
import AuditLogs from '../pages/AuditLogs'
import MasterDataIndex from '../components/MasterData/MasterDataIndex'
import GenericCrudPage from '../components/MasterData/GenericCrudPage'

/**
 * Which component draws each tab or section of config/workspaces.js.
 *
 * Kept apart from the config so the config stays plain data — testable, and
 * readable by the capability generator — while this file owns the imports.
 * Keys are `workspace.tab` or `workspace.tab.section`. A section or tab that
 * names a `grid` in the config needs no entry: it renders that Master Data
 * grid (see screenFor).
 */
export const SCREENS = {
  'service.today': <FrontDeskDashboard />,
  'service.floor.order': <Billing />,
  'service.floor.tables': <Tables />,
  'service.floor.qr': <QrOrders />,
  'service.counter.tokens': <Tokens />,
  'service.counter.online': <OnlineOrders />,
  'service.counter.tracking': <Tracking />,
  'service.kitchen': <Kitchen />,

  'menu.items': <MenuMaster />,
  'menu.categories.hours': <CategorySchedules />,
  'menu.options.variants': <Variants />,
  'menu.options.addon-groups': <AddonGroups />,
  'menu.options.addons': <Addons />,
  'menu.labels.food-types': <FoodTypes />,
  'menu.labels.meat-types': <MeatTypes />,
  'menu.labels.menu-tags': <MenuTags />,
  'menu.channels.channels': <Channels />,
  'menu.channels.portals': <Portals />,
  'menu.channels.rejection-reasons': <RejectionReasons />,
  'menu.stock.inventory': <Inventory />,

  'outlet.business.profile': <BusinessProfile />,
  'outlet.floors.floors': <Floors />,
  'outlet.floors.qr-codes': <QrCodes />,
  'outlet.front-desk': <PosSettings />,
  'outlet.receipts': <ReceiptFormat />,
  'outlet.payments.branch': <PaymentMethods />,
  'outlet.tax.gst': <GstSettings />,

  'money.overview': <Finance />,
  'money.ledger': <Ledger />,
  'money.returns': <Returns />,
  'money.cash': <CashSessions />,
  'money.expenses.expenses': <Expenses />,
  'money.expenses.categories': <ExpenseCategories />,
  'money.assets.register': <Assets />,
  'money.assets.categories': <AssetCategories />,
  'money.gst': <Finance defaultTab="gst" />,

  'guests.customers': <Customers />,
  'guests.feedback': <Feedback />,
  'guests.offers': <Campaigns />,

  'insights.reports': <ReportsHome />,
  'insights.live': <Reports />,

  'org.people': <AccessControl />,
  'org.audit': <AuditLogs />,
  'org.data': <MasterDataIndex />,
}

/**
 * Deeper pages under a `nested` tab or section — the ones reached by id.
 * Paths are relative to that tab or section.
 */
export const NESTED_SCREENS = {
  'menu.channels.portals': [{ path: ':portalId/menu', element: <PortalMenu /> }],
  'guests.offers': [{ path: ':id', element: <CampaignDetail /> }],
  'org.data': [{ path: ':moduleKey', element: <GenericCrudPage /> }],
}

/** The element for a config entry, by key; a `grid` entry renders its grid. */
export const screenFor = (key, entry) => {
  if (SCREENS[key]) return SCREENS[key]
  if (entry && entry.grid) return <GenericCrudPage moduleKey={entry.grid} />
  return null
}

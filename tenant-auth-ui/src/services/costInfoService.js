import api from '../api/api'
import { create, update, remove, getById, getReferenceData } from './crudService'

// Data access for the guided Cost Info drawer. Cost Info sits atop a chain:
//   costInfo → taxGroup → taxGroupTaxTypeMapper → taxType
// Level ① (this slice) creates the costInfo + its tax group; the effective rate
// is read live from the server so the drawer always agrees with what prices bills.

// Pull the created record out of a create response. Some controllers call
// createdResponse(res, record, message) with the args swapped, so the record
// arrives under `message` instead of `data` — accept an object from either.
const isRecord = (v) => v != null && typeof v === 'object' && !Array.isArray(v)
const recordOf = (env) => {
  if (!env) return null
  for (const c of [env.data, env.message, env.resource]) {
    if (Array.isArray(c) && isRecord(c[0])) return c[0]
    if (isRecord(c)) return c
  }
  return isRecord(env) ? env : null
}
export const idOf = (rec) => rec?.id ?? rec?.Id ?? rec?.data?.id ?? rec?.data?.Id ?? null
export const groupName = (g) => g?.Name ?? g?.name ?? ''
export const groupId = (g) => g?.id ?? g?.Id ?? null

export const getTaxGroups = () => getReferenceData('taxGroups')

export const createTaxGroup = async (name) =>
  recordOf(await create('taxGroups', { Name: name, Active: true }))

export const createCostInfo = async ({ amount, taxGroupId, isTaxIncluded }) =>
  recordOf(await create('costInfos', {
    Amount: Number(amount),
    TaxGroupId: taxGroupId || null,
    IsTaxIncluded: !!isTaxIncluded,
    Active: true,
  }))

// Read an existing Cost Info so the drawer can repopulate its fields for editing.
export const getCostInfo = async (id) => recordOf(await getById('costInfos', id))

export const updateCostInfo = async (id, { amount, taxGroupId, isTaxIncluded }) =>
  recordOf(await update('costInfos', id, {
    Amount: Number(amount),
    TaxGroupId: taxGroupId || null,
    IsTaxIncluded: !!isTaxIncluded,
    Active: true,
  }))

// Live effective rate + component split (CGST/SGST/…) for a tax group.
export const getTaxGroupRate = async (taxGroupId) => {
  const res = await api.get(`/api/pricing/tax-groups/${taxGroupId}/rate`)
  return res.data?.data ?? res.data ?? null
}

// ── Level ② Group Map + ③ Tax Detail ────────────────────────────────────────
export const typeName = (t) => t?.Name ?? t?.name ?? ''
export const typeId = (t) => t?.id ?? t?.Id ?? null

export const getTaxTypes = () => getReferenceData('taxTypes')
export const getMappers = () => getReferenceData('taxGroupTaxTypeMappers')

export const createTaxType = async ({ name, value }) =>
  recordOf(await create('taxTypes', { Name: name, Value: Number(value), Active: true }))

export const createMapper = async ({ taxGroupId, taxTypeId }) =>
  recordOf(await create('taxGroupTaxTypeMappers', { TaxGroupId: taxGroupId, TaxTypeId: taxTypeId, Active: true }))

export const deleteMapper = (id) => remove('taxGroupTaxTypeMappers', id)

const costInfoService = {
  getTaxGroups, createTaxGroup, createCostInfo, getCostInfo, updateCostInfo, getTaxGroupRate,
  getTaxTypes, getMappers, createTaxType, createMapper, deleteMapper,
  idOf, groupName, groupId, typeName, typeId,
}
export default costInfoService

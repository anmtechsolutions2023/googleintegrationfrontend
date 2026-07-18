import React, { createContext, useContext, useState, useCallback } from 'react'
import posService from '../services/posService'
import { APP_CONFIG } from '../constants'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

const FrontDeskContext = createContext(null)

export const FrontDeskProvider = ({ children }) => {
  const [floors, setFloors]   = useState([])
  const [tables, setTables]   = useState([])
  const [menu, setMenu]       = useState([])
  const [orders, setOrders]   = useState([])
  const [kots, setKots]       = useState([])
  const [bills, setBills]     = useState([])
  const [loading, setLoading] = useState(false)

  const refreshFloors = useCallback(async () => {
    const data = await posService.getFloors()
    setFloors(data)
    return data
  }, [])

  const refreshTables = useCallback(async () => {
    const data = await posService.getTables()
    setTables(data)
    return data
  }, [])

  const refreshMenu = useCallback(async () => {
    const data = await posService.getItemMeta()
    setMenu(data)
    return data
  }, [])

  const refreshOrders = useCallback(async () => {
    const data = await posService.getOrders({ limit: MAX_LIMIT })
    setOrders(data)
    return data
  }, [])

  const refreshKots = useCallback(async () => {
    const data = await posService.getKots({ limit: MAX_LIMIT })
    setKots(data)
    return data
  }, [])

  const refreshBills = useCallback(async () => {
    const data = await posService.getBills({ limit: MAX_LIMIT })
    setBills(data)
    return data
  }, [])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([
        refreshFloors(),
        refreshTables(),
        refreshMenu(),
        refreshOrders(),
        refreshKots(),
        refreshBills(),
      ])
    } finally {
      setLoading(false)
    }
  }, [refreshFloors, refreshTables, refreshMenu, refreshOrders, refreshKots, refreshBills])

  return (
    <FrontDeskContext.Provider value={{
      floors, tables, menu, orders, kots, bills, loading,
      refreshFloors, refreshTables, refreshMenu,
      refreshOrders, refreshKots, refreshBills,
      refreshAll,
    }}>
      {children}
    </FrontDeskContext.Provider>
  )
}

export const useFrontDesk = () => {
  const ctx = useContext(FrontDeskContext)
  if (!ctx) throw new Error('useFrontDesk must be used inside FrontDeskProvider')
  return ctx
}

export default FrontDeskContext

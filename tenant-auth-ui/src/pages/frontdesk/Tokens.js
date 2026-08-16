import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { statusLabel } from '../../utils/posStatus'
import { APP_CONFIG } from '../../constants'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

const statusBadge = (status) => {
  const s = (status || 'pending').toLowerCase()
  const cls = s === 'served' || s === 'completed' ? 'active' : s === 'called' ? 'pending' : 'pending'
  return <span className={`fd-badge fd-badge-${cls}`}>{statusLabel(status || 'waiting')}</span>
}

const Tokens = () => {
  const [tokens, setTokens]   = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await posService.getTokens({ limit: MAX_LIMIT })
      // Show today's tokens first
      const today = new Date().toISOString().slice(0, 10)
      const sorted = data
        .filter((t) => (t.CreatedOn || '').slice(0, 10) === today || !t.CreatedOn)
        .sort((a, b) => (b.TokenNumber || 0) - (a.TokenNumber || 0))
      setTokens(sorted)
    } catch {
      toast.error('Failed to load tokens')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleIssue = async () => {
    setCreating(true)
    try {
      const nextNumber = tokens.length > 0
        ? Math.max(...tokens.map((t) => t.TokenNumber || 0)) + 1
        : 1
      await posService.createToken({ TokenNumber: nextNumber, Status: 'waiting' })
      toast.success(`Token #${nextNumber} issued`)
      load()
    } catch {
      toast.error('Failed to issue token')
    } finally {
      setCreating(false)
    }
  }

  const handleCall = async (token) => {
    const id = token.id || token.Id
    try {
      await posService.updateToken(id, { Status: 'called' })
      toast.info(`Calling Token #${token.TokenNumber}`)
      load()
    } catch { toast.error('Failed to update token') }
  }

  const handleServe = async (token) => {
    const id = token.id || token.Id
    try {
      await posService.updateToken(id, { Status: 'served' })
      toast.success(`Token #${token.TokenNumber} served`)
      load()
    } catch { toast.error('Failed to update token') }
  }

  return (
    <div className="fd-crud-page">
      <h1>🎫 Token System</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className="fd-btn fd-btn-primary" onClick={handleIssue} disabled={creating}>
          {creating ? 'Issuing...' : '+ Issue Token'}
        </button>
        <button className="fd-btn fd-btn-outline" onClick={load}>Refresh</button>
      </div>

      {loading ? (
        <div className="fd-loading">Loading tokens...</div>
      ) : tokens.length === 0 ? (
        <div className="fd-empty">No tokens issued today.</div>
      ) : (
        <table className="fd-table">
          <thead>
            <tr>
              <th>Token #</th>
              <th>Status</th>
              <th>Issued At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => {
              const tid = t.id || t.Id
              const s = (t.Status || '').toLowerCase()
              return (
                <tr key={tid}>
                  <td><strong>#{t.TokenNumber}</strong></td>
                  <td>{statusBadge(t.Status)}</td>
                  <td>{t.CreatedOn ? new Date(t.CreatedOn).toLocaleTimeString() : '—'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {s === 'waiting' && (
                      <button className="fd-btn fd-btn-warning" onClick={() => handleCall(t)}>Call</button>
                    )}
                    {(s === 'waiting' || s === 'called') && (
                      <button className="fd-btn fd-btn-success" onClick={() => handleServe(t)}>Serve</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default Tokens

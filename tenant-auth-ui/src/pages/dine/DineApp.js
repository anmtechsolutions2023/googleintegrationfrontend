import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import dineService from '../../services/dineService'
import * as store from '../../utils/dineSessionStore'
import { addToCart, changeQuantity } from './cart'
import DineEntry from './DineEntry'
import DinePhone from './DinePhone'
import DineCode from './DineCode'
import DineName from './DineName'
import DineMenu from './DineMenu'
import DineItemSheet from './DineItemSheet'
import DineCart from './DineCart'
import DineStatus from './DineStatus'
import DineNotice from './DineNotice'
import './dine.css'

const STEP = {
  LOADING: 'loading', NOTICE: 'notice', ENTRY: 'entry', PHONE: 'phone', CODE: 'code',
  NAME: 'name', MENU: 'menu', CART: 'cart', STATUS: 'status',
}
const POLL_MS = 20000

/**
 * The guest's phone at a table: /t/:token.
 *
 * A small state machine over the screens in pages/dine. This component owns
 * the flow and the data (venue, session, cart, menu, orders); every screen is
 * presentational and only reports what the guest did. Public — no staff login,
 * no app navigation — and every id that matters (tenant, branch, table,
 * customer) lives on the server, never in this page.
 */
const DineApp = () => {
  const { token: qrToken } = useParams()

  const [step, setStep] = useState(STEP.LOADING)
  const [notice, setNotice] = useState({ kind: 'offline', message: null })
  const [venue, setVenue] = useState(null)
  const [logo, setLogo] = useState(null)
  const [phone, setPhone] = useState('')
  const [challenge, setChallenge] = useState(null)
  const [session, setSession] = useState(() => store.getSession(qrToken))
  const [canOrder, setCanOrder] = useState(false)
  const [menu, setMenu] = useState(null)
  const [cart, setCart] = useState(() => store.getCart(qrToken))
  const [openItem, setOpenItem] = useState(null)
  const [quote, setQuote] = useState(null)
  const [quoting, setQuoting] = useState(false)
  const [orders, setOrders] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const quoteSeq = useRef(0)

  const stop = useCallback((kind, message = null) => {
    setNotice({ kind, message })
    setStep(STEP.NOTICE)
  }, [])

  /** Any session call that comes back 401 means: scan again. */
  const handleSessionError = useCallback((err) => {
    if (dineService.isSessionEnded(err)) {
      store.clearSession(qrToken)
      setSession(null)
      stop('ended')
      return true
    }
    return false
  }, [qrToken, stop])

  const loadMenu = useCallback(async (sessionToken) => {
    const data = await dineService.getMenu(sessionToken)
    setMenu(data)
    setCanOrder(!!data.canOrder)
  }, [])

  const loadOrders = useCallback(async (sessionToken) => {
    const list = await dineService.getOrders(sessionToken)
    setOrders(Array.isArray(list) ? list : [])
    return list
  }, [])

  // ── Boot: resolve the code, then resume a live session if there is one ──
  const boot = useCallback(async () => {
    setStep(STEP.LOADING)
    try {
      const v = await dineService.resolve(qrToken)
      setVenue(v)
      setCanOrder(!!v.canOrder)
      dineService.getLogo(qrToken).then(setLogo)
      const saved = store.getSession(qrToken)
      if (!saved) { setStep(STEP.ENTRY); return }
      try {
        await loadMenu(saved.token)
        await loadOrders(saved.token)
        setSession(saved)
        setStep(STEP.MENU)
      } catch (err) {
        store.clearSession(qrToken)
        setSession(null)
        setStep(STEP.ENTRY)
      }
    } catch (err) {
      if (err?.response?.status === 404) stop('inactive')
      else stop('offline')
    }
  }, [qrToken, loadMenu, loadOrders, stop])

  useEffect(() => { boot() }, [boot])

  // Keep the cart across a reload of the tab.
  useEffect(() => { store.saveCart(qrToken, cart) }, [qrToken, cart])

  // ── D2 → D3: ask for a code ────────────────────────────────────────────
  const sendCode = async (typed) => {
    setBusy(true)
    setError(null)
    try {
      const ch = await dineService.requestCode(qrToken, typed || phone)
      if (typed) setPhone(typed)
      setChallenge(ch)
      setStep(STEP.CODE)
    } catch (err) {
      const status = err?.response?.status
      if (status === 404) stop('inactive')
      else if (status === 503) stop('paused', dineService.messageOf(err))
      else setError(dineService.messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  // ── D3: spend the code, open the session ───────────────────────────────
  const verify = async (code) => {
    setBusy(true)
    setError(null)
    try {
      const res = await dineService.verifyCode(qrToken, { challengeId: challenge.challengeId, code })
      const saved = { token: res.token, customerName: res.customer?.name || null }
      store.saveSession(qrToken, { ...saved, expiresInSeconds: res.expiresInSeconds })
      setSession(saved)
      setVenue(res.venue || venue)
      await loadMenu(res.token)
      await loadOrders(res.token).catch(() => [])
      setStep(res.customer?.name ? STEP.MENU : STEP.NAME)
    } catch (err) {
      const status = err?.response?.status
      if (status === 404) stop('inactive')
      else if (status === 410 || status === 429) {
        // A dead challenge cannot be retried — back to the number for a new code.
        setError(dineService.messageOf(err))
        setChallenge(null)
        setStep(STEP.PHONE)
      } else setError(dineService.messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  // ── D4: optional name ──────────────────────────────────────────────────
  const saveName = async (name) => {
    setBusy(true)
    try {
      const res = await dineService.setName(session.token, name)
      setSession({ ...session, customerName: res?.name || null })
      store.renameSession(qrToken, res?.name)
    } catch (err) {
      if (handleSessionError(err)) return
    } finally {
      setBusy(false)
    }
    setStep(STEP.MENU)
  }

  // ── D7: server quote whenever the cart changes on the cart screen ─────
  useEffect(() => {
    if (step !== STEP.CART || !session || cart.length === 0) { setQuote(null); return undefined }
    const seq = ++quoteSeq.current
    setQuoting(true)
    const t = setTimeout(async () => {
      try {
        const q = await dineService.quote(session.token, cart)
        if (seq === quoteSeq.current) setQuote(q)
      } catch (err) {
        if (!handleSessionError(err) && seq === quoteSeq.current) setQuote(null)
      } finally {
        if (seq === quoteSeq.current) setQuoting(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [step, cart, session, handleSessionError])

  const place = async (instructions) => {
    setBusy(true)
    setError(null)
    try {
      await dineService.placeOrder(session.token, cart, instructions)
      setCart([])
      await loadOrders(session.token)
      setStep(STEP.STATUS)
    } catch (err) {
      if (!handleSessionError(err)) setError(dineService.messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  // ── D8: poll while the guest is watching their orders ─────────────────
  useEffect(() => {
    if (step !== STEP.STATUS || !session) return undefined
    const id = setInterval(() => {
      loadOrders(session.token).catch((err) => handleSessionError(err))
    }, POLL_MS)
    return () => clearInterval(id)
  }, [step, session, loadOrders, handleSessionError])

  // ── Render ─────────────────────────────────────────────────────────────
  let screen = null
  switch (step) {
    case STEP.LOADING:
      screen = <div className="dine-screen"><div className="dine-loading" role="status">Loading…</div></div>
      break
    case STEP.NOTICE:
      screen = <DineNotice kind={notice.kind} message={notice.message} onRetry={notice.kind === 'offline' ? boot : null} />
      break
    case STEP.ENTRY:
      screen = <DineEntry venue={venue} logo={logo} onContinue={() => { setError(null); setStep(STEP.PHONE) }} />
      break
    case STEP.PHONE:
      screen = <DinePhone venue={venue} busy={busy} error={error} onBack={() => setStep(STEP.ENTRY)} onSubmit={sendCode} />
      break
    case STEP.CODE:
      screen = (
        <DineCode
          phone={phone}
          challenge={challenge}
          busy={busy}
          error={error}
          onBack={() => { setError(null); setStep(STEP.PHONE) }}
          onResend={() => sendCode(phone)}
          onSubmit={verify}
        />
      )
      break
    case STEP.NAME:
      screen = <DineName venue={venue} busy={busy} onSave={saveName} onSkip={() => setStep(STEP.MENU)} />
      break
    case STEP.MENU:
      screen = (
        <DineMenu
          venue={venue}
          menu={menu}
          cart={cart}
          customerName={session?.customerName}
          canOrder={canOrder}
          hasOrders={orders.length > 0}
          onAdd={(item) => setCart((c) => addToCart(c, item))}
          onOpenItem={setOpenItem}
          onChangeQty={(key, d) => setCart((c) => changeQuantity(c, key, d))}
          onOpenCart={() => { setError(null); setStep(STEP.CART) }}
          onOpenOrders={() => setStep(STEP.STATUS)}
        />
      )
      break
    case STEP.CART:
      screen = (
        <DineCart
          venue={venue}
          cart={cart}
          quote={quote}
          quoting={quoting}
          busy={busy}
          error={error}
          onBack={() => setStep(STEP.MENU)}
          onChangeQty={(key, d) => setCart((c) => changeQuantity(c, key, d))}
          onPlace={place}
        />
      )
      break
    case STEP.STATUS:
      screen = <DineStatus venue={venue} orders={orders} canOrder={canOrder} onOrderMore={() => setStep(STEP.MENU)} />
      break
    default:
      screen = null
  }

  return (
    <div className="dine">
      {screen}
      {openItem && step === STEP.MENU && (
        <DineItemSheet
          item={openItem}
          onClose={() => setOpenItem(null)}
          onAdd={(opts) => { setCart((c) => addToCart(c, openItem, opts)); setOpenItem(null) }}
        />
      )}
    </div>
  )
}

export default DineApp

import React, { useMemo, useState } from 'react'
import { DietMark, SearchIcon } from './DineIcons'
import { cartCount, cartEstimate, countOf, needsOptions, rupees } from './cart'

const ALL = '__all__'

/**
 * D5 — the branch's menu for a guest at a table.
 *
 * Dishes outside trading hours stay visible but cannot be added, with the time
 * they come back; a menu-only branch shows the menu with no Add buttons.
 *
 * A dish with a photo shows it on the right, with the Add button sitting on
 * its lower edge; tapping the photo opens the dish with the photo large. A
 * dish without one keeps the compact text row — no placeholder boxes.
 */
const DineMenu = ({
  venue, menu, cart, customerName, canOrder,
  onAdd, onOpenItem, onChangeQty, onOpenCart, onOpenOrders, hasOrders, photoUrl = () => null,
}) => {
  const [category, setCategory] = useState(ALL)
  const [query, setQuery] = useState('')

  const categories = useMemo(() => menu?.categories || [], [menu])
  const q = query.trim().toLowerCase()

  const sections = useMemo(() => categories
    .filter((c) => category === ALL || (c.id || c.name) === category)
    .map((c) => ({
      ...c,
      items: c.items.filter((i) => !q
        || i.name.toLowerCase().includes(q)
        || (i.description || '').toLowerCase().includes(q)),
    }))
    .filter((c) => c.items.length > 0), [categories, category, q])

  const count = cartCount(cart)
  const place = venue.businessName || venue.branchName || 'Menu'

  const addPlain = (item) => (needsOptions(item) ? onOpenItem(item) : onAdd(item))

  return (
    <div className="dine-screen">
      <header className="dine-menu-head">
        <div className="dine-top">
          <div className="dine-stack" style={{ gap: 2 }}>
            <div className="dine-display" style={{ fontSize: 22 }}>{place}</div>
            <div className="dine-muted" style={{ fontSize: 13.5 }}>
              {[venue.tableName && `Table ${venue.tableName}`, customerName && `Hi ${customerName}`].filter(Boolean).join(' · ')}
            </div>
          </div>
          {hasOrders && (
            <button type="button" className="dine-chip" style={{ cursor: 'pointer' }} onClick={onOpenOrders}>My orders</button>
          )}
        </div>
        <label className="dine-search">
          <SearchIcon />
          <span className="sr-only-dine">Search dishes</span>
          <input type="search" placeholder="Search dishes" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="dine-cats" role="group" aria-label="Categories">
          <button type="button" className="dine-cat" aria-pressed={category === ALL} onClick={() => setCategory(ALL)}>All</button>
          {categories.map((c) => (
            <button
              key={c.id || c.name}
              type="button"
              className="dine-cat"
              aria-pressed={category === (c.id || c.name)}
              onClick={() => setCategory(c.id || c.name)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </header>

      <main className="dine-menu-body">
        {!canOrder && (
          <div className="dine-callout dine-callout-info">
            Browse the menu here — please order with your server.
          </div>
        )}
        {sections.length === 0 && (
          <div className="dine-empty">{q ? 'No dishes match your search.' : 'The menu is empty right now.'}</div>
        )}
        {sections.map((section) => (
          <section key={section.id || section.name} className="dine-stack" style={{ gap: 12 }}>
            <h2 className="dine-section-title">{section.name}</h2>
            {section.items.map((item) => {
              const n = countOf(cart, item.id)
              const plainLine = !needsOptions(item) && cart.find((l) => l.id === item.id && !l.note)
              const photo = photoUrl(item)
              const control = canOrder && item.available && (
                plainLine ? (
                  <div className="dine-stepper">
                    <button type="button" aria-label={`One less ${item.name}`} onClick={() => onChangeQty(plainLine.key, -1)}>−</button>
                    <span>{plainLine.quantity}</span>
                    <button type="button" aria-label={`One more ${item.name}`} onClick={() => onChangeQty(plainLine.key, 1)}>+</button>
                  </div>
                ) : (
                  <button type="button" className="dine-add" onClick={() => addPlain(item)}>
                    {needsOptions(item) ? 'Add +' : 'Add'}
                  </button>
                )
              )
              return (
                <article key={item.id} className={`dine-dish ${item.available ? '' : 'is-off'}${photo ? ' has-photo' : ''}`}>
                  <div className="dine-dish-main">
                    <div className="dine-dish-name"><DietMark isVeg={item.isVeg} />{item.name}</div>
                    {item.description && <div className="dine-dish-desc">{item.description}</div>}
                    {item.portionSize && <div className="dine-dish-desc">{item.portionSize}</div>}
                    <div className="dine-dish-price">{rupees(item.price)}</div>
                    {!item.available && (
                      <div className="dine-dish-desc">{item.opensAt ? `Available from ${item.opensAt}` : 'Not available right now'}</div>
                    )}
                  </div>
                  {photo ? (
                    <div className="dine-dish-pic">
                      <button type="button" className="dine-dish-photo" onClick={() => onOpenItem(item)} aria-label={`See ${item.name}`}>
                        <img src={photo} alt="" loading="lazy" decoding="async" width="112" height="104" />
                      </button>
                      {control && <div className="dine-dish-pic-control">{control}</div>}
                      {control && needsOptions(item) && <span className="dine-small">{n > 0 ? `${n} in order` : 'Options'}</span>}
                    </div>
                  ) : control && (
                    <div className="dine-dish-side">
                      {control}
                      {needsOptions(item) && <span className="dine-small">{n > 0 ? `${n} in order` : 'Options'}</span>}
                    </div>
                  )}
                </article>
              )
            })}
          </section>
        ))}
      </main>

      {canOrder && count > 0 && (
        <div className="dine-cartbar">
          <button type="button" onClick={onOpenCart}>
            <span className="dine-cartbar-count">
              {count} {count === 1 ? 'item' : 'items'}
              <small>{rupees(cartEstimate(cart))} + taxes</small>
            </span>
            <span style={{ fontWeight: 700 }}>View order →</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default DineMenu

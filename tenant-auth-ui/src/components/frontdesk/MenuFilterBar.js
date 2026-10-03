import React from 'react'
import { ALL, isVegName } from '../../utils/menuFilters'

/**
 * The category row. A horizontal rail by default; `className="is-rail"` stacks
 * it as a vertical list for the till's side rail. Same buttons either way, so a
 * category reads and behaves identically on both screens.
 *
 * Renders nothing for a menu with a single category: "All" and that one would
 * be two buttons that do the same thing.
 */
export const CategoryChips = ({ filters, className = '' }) => {
  const { state, catChips, setCategory } = filters
  if (catChips.length <= 2) return null
  return (
    // CATEGORY. A horizontal rail rather than a wrapping block: twenty
    // categories must not push the list off the screen. Counts are live, so
    // a category that would come back empty says so before it is tapped.
    <div
      className={`fd-menu-cats${className ? ` ${className}` : ''}`}
      role="group"
      aria-label="Filter by category"
    >
      {catChips.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`fd-chip${state.category === c.id ? ' is-on' : ''}${c.count === 0 ? ' is-empty' : ''}`}
          aria-pressed={state.category === c.id}
          aria-label={c.closed ? `${c.name}, closed right now` : undefined}
          onClick={() => setCategory(c.id)}
        >
          {/* A section outside its hours says so on the chip, so it reads
              as shut before it is tapped rather than after. */}
          {c.closed && (
            <svg
              className="fd-chip-clock"
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          )}
          <span className="fd-chip-name">{c.name}</span>
          <span className="fd-chip-count">{c.count}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * The diet row. Derived from the food types this tenant actually uses, so a
 * master with 'Jain' in it gets a chip without a code change.
 */
export const DietChips = ({ filters, menu, className = '' }) => {
  const { state, dtChips, setDiet } = filters
  if (dtChips.length <= 2) return null
  return (
    <div
      className={`fd-menu-diets${className ? ` ${className}` : ''}`}
      role="group"
      aria-label="Filter by food type"
    >
      <span className="fd-menu-filter-label">Diet</span>
      {dtChips.map((d) => (
        <button
          key={d.id}
          type="button"
          className={`fd-chip fd-chip-diet${state.diet === d.id ? ' is-on' : ''}${d.count === 0 ? ' is-empty' : ''}`}
          aria-pressed={state.diet === d.id}
          onClick={() => setDiet(d.id)}
        >
          <span
            className={`fd-diet-dot${d.id === ALL ? ' is-any' : ''}${
              d.id !== ALL && isVegName(menu, d.id) ? ' is-veg' : ''}`}
          />
          <span className="fd-chip-name">{d.name}</span>
          <span className="fd-chip-count">{d.count}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * Search, category, diet and menu-tag filters for a list of menu rows.
 *
 * Presentational: the state and every count come from useMenuFilters, so the
 * till and Menu Master share one set of rules and one look. Renders nothing it
 * has nothing to offer — a menu with one category gets no category rail.
 *
 * @param {Object} props
 * @param {Object} props.filters - The value of useMenuFilters().
 * @param {Array<Object>} props.menu - The same rows the filters were built from.
 * @param {string} [props.searchPlaceholder]
 * @param {string} [props.className] - Extra class on the outer box.
 * @param {boolean} [props.showSaleFilter] - The On / Off row, for Menu Master.
 * @param {boolean} [props.hideSearch] - The caller draws its own search box.
 * @param {boolean} [props.hideCategories] - The caller draws CategoryChips itself.
 * @param {boolean} [props.hideDiets] - The caller draws DietChips itself.
 */
const MenuFilterBar = ({
  filters,
  menu,
  searchPlaceholder = 'Search dishes, cuisines, courses...',
  className = '',
  showSaleFilter = false,
  hideSearch = false,
  hideCategories = false,
  hideDiets = false,
}) => {
  const {
    state, groups, hints, facets, tagSheetOpen, saleChips,
    setTagSheetOpen, setQuery, setTags, setActive, toggleTag, clear,
  } = filters

  return (
    // Every control that narrows the list, in ONE bounded box. They were seven
    // siblings competing with the grid for the panel's height, and with the tag
    // sheet open the grid was left a single clipped row. Grouped, they can
    // scroll among themselves while the grid keeps a floor.
    <div className={`fd-menu-filters${className ? ` ${className}` : ''}`}>
      {!hideSearch && (
        <input
          className="fd-menu-search"
          placeholder={searchPlaceholder}
          aria-label="Search the menu"
          value={state.query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {/* WHAT ELSE THE TYPING MATCHED. The link between a free-text box and a
          vocabulary nobody has memorised: type "chin" and the Chinese facet is
          offered, rather than having to know it lives behind the Tags button. */}
      {hints.length > 0 && (
        <div className="fd-menu-suggests">
          <span className="fd-menu-filter-label">Also matches</span>
          {hints.map((t) => (
            <button
              key={t.id}
              type="button"
              className="fd-chip fd-chip-suggest"
              onClick={() => { toggleTag(t.id); setQuery('') }}
            >
              + {t.name}
              <span className="fd-chip-kind">{t.label}</span>
              <span className="fd-chip-count">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* EVERYTHING NARROWING THE LIST, in one row, each removable. Without it
          someone three taps deep cannot see why the list is empty — the chips
          that did it are on rails they have scrolled past. */}
      {facets.length > 0 && (
        <div className="fd-menu-facets">
          <span className="fd-menu-filter-label">Filtering</span>
          {facets.map((f) => (
            <button
              key={f.key}
              type="button"
              className="fd-chip is-on fd-chip-facet"
              onClick={f.drop}
              aria-label={`Remove filter ${f.name}`}
            >
              {f.name}
              <span aria-hidden="true">&times;</span>
            </button>
          ))}
          <button type="button" className="fd-link-btn" onClick={clear}>
            Clear all
          </button>
        </div>
      )}

      {/* CATEGORY and DIET. Billing draws these in its side rail instead,
          and asks for them to be left out here. */}
      {!hideCategories && <CategoryChips filters={filters} />}
      {!hideDiets && <DietChips filters={filters} menu={menu} />}

      {/* ON SALE. Menu Master only: the till shows every dish and greys the
          ones that are off, so this would only hide things from a cashier. */}
      {showSaleFilter && saleChips && (
        <div className="fd-menu-diets fd-menu-sale" role="group" aria-label="Filter by on sale">
          <span className="fd-menu-filter-label">On sale</span>
          {saleChips.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`fd-chip${state.active === c.id ? ' is-on' : ''}${c.count === 0 ? ' is-empty' : ''}`}
              aria-pressed={state.active === c.id}
              onClick={() => setActive(c.id)}
            >
              {c.name}
              <span className="fd-chip-count">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* TAGS — the third axis. Behind one button because the vocabulary is a
          dozen strong: put them all on the rail and the rail stops being read.
          Grouped by TagType, which the master already carries. */}
      {groups.length > 0 && (
        <div className="fd-menu-tags">
          <button
            type="button"
            className={`fd-chip${tagSheetOpen || state.tags.length > 0 ? ' is-on' : ''}`}
            aria-expanded={tagSheetOpen}
            onClick={() => setTagSheetOpen((v) => !v)}
          >
            Tags
            <span className="fd-chip-count">
              {state.tags.length > 0
                ? state.tags.length
                : groups.reduce((n, g) => n + g.tags.length, 0)}
            </span>
          </button>
          {state.tags.length > 0 && (
            <button type="button" className="fd-link-btn" onClick={() => setTags([])}>
              Clear tags
            </button>
          )}
        </div>
      )}

      {tagSheetOpen && groups.length > 0 && (
        <div className="fd-tag-sheet" role="group" aria-label="Filter by menu tag">
          {groups.map((g) => (
            <div key={g.type} className="fd-tag-group">
              <span className="fd-menu-filter-label">{g.label}</span>
              {g.tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`fd-chip${state.tags.includes(t.id) ? ' is-on' : ''}${t.count === 0 ? ' is-empty' : ''}`}
                  aria-pressed={state.tags.includes(t.id)}
                  onClick={() => toggleTag(t.id)}
                >
                  {t.name}
                  <span className="fd-chip-count">{t.count}</span>
                </button>
              ))}
            </div>
          ))}
          {/* Where a tag came from, because the list shows both kinds. */}
          <div className="fd-tag-legend">
            <span className="fd-item-tag">on the dish</span>
            <span className="fd-item-tag is-inherited">from its category</span>
            <span className="fd-tag-legend-note">A filter matches either.</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default MenuFilterBar

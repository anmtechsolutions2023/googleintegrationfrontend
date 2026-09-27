import React, { useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { prepareImage, describeSize } from '../../utils/imageDownscale'

/**
 * One image a branch can hold: choose, preview, replace, remove.
 *
 * Used twice on Business Profile → Branding (logo, payment QR) and twice more in
 * the onboarding wizard's Branding panel, which is why it takes a value and a pair
 * of handlers rather than talking to the API itself. In the wizard there is no
 * branch to attach anything to yet, so the parent holds the data URI and sends it
 * inside the bootstrap payload; on Business Profile the parent calls the media
 * endpoints. The card cannot tell the difference.
 *
 * THE PREVIEW IS GREYSCALE ON PURPOSE.
 * The paper has one ink. Showing a customer's colour logo in colour and then
 * printing a grey smear is a preview that lies, so the preview shows what the
 * printer will actually be working from.
 *
 * @param {Object} p
 * @param {string} p.label
 * @param {string} p.hint
 * @param {string} p.value - Data URI or URL of what is held now. '' for nothing.
 * @param {Object} [p.meta] - { width, height, byteSize, updatedOn, updatedBy }
 * @param {Function} p.onChange - (dataUri, { width, height, byteSize }) => void
 * @param {Function} p.onRemove
 * @param {boolean} [p.canWrite]
 * @param {boolean} [p.busy]
 * @param {number} [p.maxWidth] - Dots to fit within.
 */
const MediaUploadCard = ({
  label, hint, value, meta, onChange, onRemove,
  canWrite = true, busy = false, maxWidth,
}) => {
  const inputRef = useRef(null)
  const [working, setWorking] = useState(false)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    // Cleared immediately so choosing the same file again after a Remove still
    // fires a change event.
    e.target.value = ''
    if (!file) return

    setWorking(true)
    try {
      const prepared = await prepareImage(file, maxWidth ? { maxWidth } : undefined)
      await onChange(prepared.dataUri, prepared)
    } catch (err) {
      // prepareImage's messages are written for whoever picked the file — "that
      // image is 4.2MB", not "validation failed".
      toast.error(err?.message || 'That image could not be used')
    } finally {
      setWorking(false)
    }
  }

  const remove = async () => {
    setWorking(true)
    try {
      await onRemove()
    } finally {
      setWorking(false)
    }
  }

  const disabled = !canWrite || busy || working
  const has = !!value

  return (
    <div className="bp-media">
      <div className="bp-media-head">
        <strong>{label}</strong>
        {has && meta?.width ? (
          <span className="bp-media-meta">
            {meta.width}×{meta.height}
            {meta.byteSize ? ` · ${describeSize(meta.byteSize)}` : ''}
          </span>
        ) : null}
      </div>

      <div className={`bp-media-frame${has ? '' : ' is-empty'}`}>
        {has ? (
          <img src={value} alt={`${label} preview`} />
        ) : (
          <span className="bp-media-none">Nothing uploaded</span>
        )}
      </div>

      {hint ? <p className="bp-media-hint">{hint}</p> : null}

      {/* Only shown once something is held: on an empty card it would read as an
          instruction rather than as a statement of fact. */}
      {has && (
        <p className="bp-media-note">
          Greyscale preview — a receipt printer has one ink.
        </p>
      )}

      {canWrite && (
        <div className="bp-media-actions">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={pick}
            disabled={disabled}
            hidden
          />
          <button
            type="button"
            className="fd-btn"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            {working ? 'Working…' : (has ? 'Replace' : 'Choose image')}
          </button>
          {has && (
            <button
              type="button"
              className="fd-btn fd-btn-danger"
              onClick={remove}
              disabled={disabled}
            >
              Remove
            </button>
          )}
        </div>
      )}

      {has && meta?.updatedOn ? (
        <p className="bp-provenance">
          Updated {new Date(meta.updatedOn).toLocaleDateString()}
          {meta.updatedBy ? ` by ${meta.updatedBy}` : ''}
        </p>
      ) : null}
    </div>
  )
}

export default MediaUploadCard

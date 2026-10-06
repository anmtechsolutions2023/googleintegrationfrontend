import React, { useEffect, useRef, useState } from 'react'
import { staffPhotoUrl } from '../utils/dishPhoto'
import './DishPhoto.css'

/**
 * A dish photo for staff screens (the Dishes list, the till's picture tiles).
 *
 * Fetched only once the box scrolls into view, from the cached object URL in
 * utils/dishPhoto. Until then — or when there is no photo, or it fails — it
 * renders `fallback`, so a grid keeps its shape.
 *
 * @param {{itemId: string, version: number|null, size?: 'thumb'|'full', alt?: string,
 *          className?: string, style?: Object, fallback?: React.ReactNode}} props
 */
const DishPhoto = ({ itemId, version, size = 'thumb', alt = '', className = '', style, fallback = null }) => {
  const box = useRef(null)
  const [visible, setVisible] = useState(false)
  const [src, setSrc] = useState(null)

  useEffect(() => {
    if (!version || visible) return undefined
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return undefined }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect() }
    }, { rootMargin: '200px' })
    if (box.current) io.observe(box.current)
    return () => io.disconnect()
  }, [version, visible])

  useEffect(() => {
    setSrc(null)
    if (!version || !visible || !itemId) return undefined
    let live = true
    staffPhotoUrl(itemId, version, size).then((url) => live && setSrc(url)).catch(() => {})
    return () => { live = false }
  }, [itemId, version, size, visible])

  if (!version) return fallback
  return (
    <span ref={box} className={`dish-photo ${className}`} style={style}>
      {src ? <img src={src} alt={alt} draggable="false" /> : fallback}
    </span>
  )
}

export default DishPhoto

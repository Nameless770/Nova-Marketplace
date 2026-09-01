import { useEffect, useRef, useState } from 'react'
import { placeholderImage } from '../utils/placeholderImage.js'

// One image element for every product surface. Shows the real photo when it
// loads, and otherwise a generated monogram tile. `label` seeds the
// placeholder — pass the product title so the fallback is recognisable.
//
// `onError` handles a source that fails outright. The timeout is a separate
// safety net for a host that *hangs* (never resolves): when it fires we read the
// real element's load state (`complete && naturalWidth`) rather than a flag —
// a cached image can fire `onLoad` before effects run, so a flag would race.
export function ProductImage({ url, alt, label, className, loading, timeoutMs = 12000 }) {
  // Record which URL failed/timed out (not a boolean), so a new `url` — e.g. the
  // details page as you navigate between products — is retried automatically.
  const [failedUrl, setFailedUrl] = useState(null)
  const [timedOutUrl, setTimedOutUrl] = useState(null)
  const imgRef = useRef(null)

  useEffect(() => {
    if (!url) return undefined
    const id = setTimeout(() => {
      const el = imgRef.current
      if (!el || !el.complete || el.naturalWidth === 0) setTimedOutUrl(url)
    }, timeoutMs)
    return () => clearTimeout(id)
  }, [url, timeoutMs])

  const fallback = placeholderImage(label || alt || 'Product')
  const useFallback = !url || failedUrl === url || timedOutUrl === url
  const src = useFallback ? fallback : url

  return (
    <img
      ref={imgRef}
      className={className}
      src={src}
      alt={alt || label || 'Product image'}
      loading={loading}
      onError={() => setFailedUrl(url)}
    />
  )
}

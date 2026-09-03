import { useEffect, useMemo, useRef, useState } from 'react'
import { productArtwork } from '../lib/productArtwork.js'
import { placeholderImage } from '../utils/placeholderImage.js'

/**
 * One image element for every product surface.
 *
 * The photograph is what a shopper should see, so `url` wins whenever it loads.
 * `seed` — pass the product id — only decides what is shown when it does not:
 * instead of a monogram tile, the product is drawn from its own title, which at
 * least depicts the right kind of object. The same description builds the 3D
 * model on the details page, so the fallback and the model agree.
 *
 * `onError` handles a source that fails outright. The timeout is a separate net
 * for a host that *hangs*, and it reads the element's real load state
 * (`complete && naturalWidth`) rather than a flag, because a cached image can
 * fire `onLoad` before effects run.
 */
export function ProductImage({ url, alt, label, seed, className, loading, timeoutMs = 12000 }) {
  // Record which URL failed/timed out (not a boolean), so a new `url` — e.g. the
  // details page as you navigate between products — is retried automatically.
  const [failedUrl, setFailedUrl] = useState(null)
  const [timedOutUrl, setTimedOutUrl] = useState(null)
  const imgRef = useRef(null)

  const fallback = useMemo(
    () =>
      seed
        ? productArtwork(label || alt || 'Product', String(seed))
        : placeholderImage(label || alt || 'Product'),
    [seed, label, alt],
  )

  useEffect(() => {
    if (!url) return undefined
    const id = setTimeout(() => {
      const el = imgRef.current
      if (!el || !el.complete || el.naturalWidth === 0) setTimedOutUrl(url)
    }, timeoutMs)
    return () => clearTimeout(id)
  }, [url, timeoutMs])

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

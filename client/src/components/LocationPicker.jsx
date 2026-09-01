import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Leaflet's default marker images are resolved relative to the CSS, which Vite
// does not rewrite — a plain divIcon avoids the broken-image problem entirely
// and lets the pin be styled from App.css.
const pinIcon = L.divIcon({
  className: 'map-pin',
  html: '<span class="map-pin-dot"></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

// Turns a Nominatim result into a compact address we can store on the order.
function toAddress(payload, latitude, longitude) {
  const a = payload?.address ?? {}
  const line1 = [a.house_number, a.road].filter(Boolean).join(' ')
  return {
    line1: line1 || payload?.display_name?.split(',').slice(0, 2).join(',') || '',
    city: a.city || a.town || a.village || a.suburb || a.county || '',
    state: a.state || '',
    postalCode: a.postcode || '',
    country: (a.country_code || '').toUpperCase() || undefined,
    latitude,
    longitude,
    label: payload?.display_name || '',
  }
}

/**
 * Small draggable map for choosing exactly where an order should go. The marker
 * starts at the browser's reported position and can be dragged, or the map
 * clicked, to nudge it. Every move re-resolves the street address.
 */
export function LocationPicker({ latitude, longitude, onChange }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const [label, setLabel] = useState('Finding your address…')

  // Keep the latest callback without re-running the map setup effect.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return undefined

    const map = L.map(containerRef.current, { attributionControl: true }).setView(
      [latitude, longitude],
      16,
    )
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)

    const marker = L.marker([latitude, longitude], { draggable: true, icon: pinIcon }).addTo(map)
    mapRef.current = map
    markerRef.current = marker

    let cancelled = false
    async function resolve(lat, lng) {
      setLabel('Finding your address…')
      let address = { line1: '', latitude: lat, longitude: lng, label: '' }
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${lat}&lon=${lng}`,
          { headers: { Accept: 'application/json' } },
        )
        if (response.ok) address = toAddress(await response.json(), lat, lng)
      } catch {
        // Reverse geocoding is a convenience; the coordinates are what ship.
      }
      if (cancelled) return
      setLabel(address.label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
      onChangeRef.current?.(address)
    }

    resolve(latitude, longitude)
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng()
      resolve(lat, lng)
    })
    map.on('click', (event) => {
      marker.setLatLng(event.latlng)
      resolve(event.latlng.lat, event.latlng.lng)
    })

    return () => {
      cancelled = true
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // Set up once; later prop changes move the marker in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-centre if a fresh position arrives (e.g. the shopper re-locates).
  useEffect(() => {
    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([latitude, longitude])
      mapRef.current.setView([latitude, longitude], mapRef.current.getZoom())
    }
  }, [latitude, longitude])

  return (
    <div className="location-picker">
      <div ref={containerRef} className="location-map" />
      <p className="location-hint">Drag the pin or tap the map to adjust.</p>
      <p className="location-captured">{label}</p>
    </div>
  )
}

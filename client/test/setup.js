import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Braces matter: an arrow returning cleanup() would be treated by Vitest as a
// teardown function and called again with no arguments.
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// jsdom implements neither, and components under test use both.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
}
if (!global.crypto?.randomUUID) {
  global.crypto = { ...global.crypto, randomUUID: () => '00000000-0000-4000-8000-000000000000' }
}

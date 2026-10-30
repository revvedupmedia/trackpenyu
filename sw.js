// Satu service worker untuk seluruh laman (landing, portal & semua app).
const CACHE_NAME = 'portal-v2'
const APP_SHELL = ['./', './index.html', './login.html', './portal.html', './manifest.json',
  './shared/auth.js', './shared/portal.css', './penyu/', './minyak/']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Network-first for the app shell (so updates show up quickly), falling
// back to cache when offline. Everything else (Supabase API calls, CDN
// libraries) just passes through untouched.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {})
        return res
      })
      .catch(() => caches.match(event.request))
  )
})

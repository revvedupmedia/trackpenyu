// Dikongsi oleh semua halaman: landing, login, portal dan setiap app.
// Satu projek Supabase = satu login untuk semua app.
// Disimpan dalam repo dengan versi tetap (vendor/README.md), bukan dari CDN.
import { createClient } from '../vendor/supabase-js-2.117.3/supabase-js.min.mjs'

export const SUPABASE_URL = 'https://oatbghgoxedccxdjwalt.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_gQIBBbRniU3ixnV8eCDuYw_LeWpu0jK'

// Akar laman (folder yang ada index.html landing), dikira dari lokasi fail
// ini supaya pautan betul dari mana-mana subfolder (penyu/, minyak/, ...).
export const ROOT = new URL('../', import.meta.url).href

// Versi app (tarikh keluaran). Naikkan setiap kali deploy perubahan yang
// pengguna akan nampak; dipaparkan di login, portal dan panel admin.
export const APP_VERSION = '2026.11.01.1'

// Pautan reset dari emel datang dengan token dalam #hash. Simpan dulu sebelum
// klien Supabase membaca & memadamkannya.
export const BOOT_HASH = location.hash
export const BOOT_RECOVERY = /[#&]type=recovery(&|$)/.test(BOOT_HASH)
export const BOOT_AUTH_ERROR = !BOOT_RECOVERY && /[#&]error(_code)?=/.test(BOOT_HASH)
export const RECOVERY_FLAG = 'portal-recovery-pending'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Senarai app dalam portal. `roles` = peranan staff_profiles yang boleh guna.
// Sekatan sebenar data dibuat oleh RLS dalam Supabase; senarai ini cuma
// menentukan app mana yang dipaparkan.
export const APPS = [
  { id: 'penyu', name: 'Penyu Tracker', icon: '🐢', href: 'penyu/',
    desc: 'Rekod pendaratan penyu, telur diram dan penetasan bagi PTB, PTK dan PSB.',
    roles: ['staff', 'admin', 'kerani'] },
  { id: 'minyak', name: 'Minyak Tracker', icon: '⛽', href: 'minyak/',
    desc: 'Rekod mileage, minyak Diesel & RON95 bot, resit dan status claim.',
    roles: ['admin', 'kerani'] }
]

export function canUse(profile, appId) {
  const app = APPS.find(a => a.id === appId)
  return !!(app && profile && app.roles.includes(profile.role))
}

export function appsFor(profile) {
  return APPS.filter(a => canUse(profile, a.id))
}

// Sesi tukar kata laluan yang tidak dihabiskan tak boleh dibiar kekal.
async function dropAbandonedRecovery() {
  let pending = null
  try { pending = localStorage.getItem(RECOVERY_FLAG) } catch {}
  if (!pending) return
  try { await supabase.auth.signOut() } catch {}
  try { localStorage.removeItem(RECOVERY_FLAG) } catch {}
}

// MFA (kod 6 digit dari app Authenticator) wajib untuk akaun admin.
export const MFA_WAJIB_ADMIN = true

// Admin tanpa pengesahan MFA dalam sesi ini (aal1) mesti ke langkah MFA di login.
export async function needsMfa(profile) {
  if (!MFA_WAJIB_ADMIN || profile?.role !== 'admin') return false
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) return false
  return data.currentLevel !== 'aal2'
}

// { user, profile } untuk sesi semasa, atau { user: null } jika belum log masuk.
export async function currentUser() {
  await dropAbandonedRecovery()
  const { data } = await supabase.auth.getSession()
  const user = data?.session?.user || null
  if (!user) return { user: null, profile: null }
  const { data: profile } = await supabase.from('staff_profiles').select('*').eq('id', user.id).maybeSingle()
  return { user, profile: profile || null, mfaPending: await needsMfa(profile) }
}

export function loginUrl(next, extra = '') {
  const q = [next ? 'next=' + encodeURIComponent(next) : '', extra].filter(Boolean).join('&')
  return ROOT + 'login.html' + (q ? '?' + q : '')
}

// Panggil di atas setiap app. Belum log masuk => ke login; admin belum MFA =>
// ke langkah MFA; tiada akses => ke portal.
export async function requireApp(appId) {
  const { user, profile, mfaPending } = await currentUser()
  if (!user) { location.replace(loginUrl(appId + '/')); return new Promise(() => {}) }
  if (mfaPending) { location.replace(loginUrl(appId + '/', 'mfa=1')); return new Promise(() => {}) }
  if (!canUse(profile, appId)) { location.replace(ROOT + 'portal.html?denied=' + appId); return new Promise(() => {}) }
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') location.replace(loginUrl())
  })
  startIdleWatch()
  return { user, profile }
}

// reason: 'idle' bila dilog keluar automatik (dipaparkan di halaman login).
export async function logout(reason) {
  try { await supabase.auth.signOut() } catch {}
  try { sessionStorage.clear() } catch {}
  location.replace(loginUrl('', reason === 'idle' ? 'sebab=tidak-aktif' : ''))
}

// ---------- Log keluar automatik bila tidak aktif ----------
// Telefon di stesen dikongsi: sesi tamat selepas IDLE_MINUTES tanpa sentuhan.
// Masa aktiviti dikongsi antara tab (localStorage). Amaran 60 saat sebelum.
export const IDLE_MINUTES = 30
const IDLE_KEY = 'portal-last-active'
let idleStarted = false
export function startIdleWatch() {
  if (idleStarted) return
  idleStarted = true
  const limit = IDLE_MINUTES * 60e3
  const now = () => Date.now()
  const read = () => { try { return Number(localStorage.getItem(IDLE_KEY)) || 0 } catch { return 0 } }
  let last = Math.max(read(), now()), lastWrite = 0, banner = null
  const touch = () => {
    last = now()
    if (last - lastWrite > 10e3) { lastWrite = last; try { localStorage.setItem(IDLE_KEY, String(last)) } catch {} }
    if (banner) { banner.remove(); banner = null }
  }
  touch()
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll']) addEventListener(ev, touch, { passive: true, capture: true })
  const check = () => {
    const idle = now() - Math.max(last, read())
    if (idle >= limit) { logout('idle'); return }
    if (idle >= limit - 60e3 && !banner) {
      banner = document.createElement('div')
      banner.setAttribute('role', 'alert')
      banner.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:9999;max-width:92vw;padding:12px 16px;border-radius:14px;background:#3a2a06;color:#F7E7C1;border:1px solid #E8A020;font:600 14px Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);text-align:center'
      banner.textContent = 'Tiada aktiviti. Anda akan dilog keluar dalam 1 minit. Sentuh skrin untuk kekal.'
      document.body.appendChild(banner)
    }
  }
  setInterval(check, 15e3)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check() })
}

// ---------- Log ralat ----------
// Ralat JavaScript di peranti staf disimpan dalam jadual client_errors supaya
// admin tahu ada masalah (Portal → Pentadbiran). Maksimum 10 setiap halaman.
const seenErrors = new Set()
export async function reportError(message, stack) {
  try {
    message = String(message || '').slice(0, 2000)
    if (!message || /^Script error\.?$|ResizeObserver loop/i.test(message)) return
    const key = message + '|' + String(stack || '').slice(0, 200)
    if (seenErrors.has(key) || seenErrors.size >= 10) return
    seenErrors.add(key)
    const { data } = await supabase.auth.getSession()
    if (!data?.session) return
    await supabase.from('client_errors').insert({
      message, stack: String(stack || '').slice(0, 8000),
      page: (location.pathname + location.hash).slice(0, 300),
      app_version: APP_VERSION, user_agent: navigator.userAgent.slice(0, 300)
    })
  } catch {}
}
addEventListener('error', (e) => { if (e.error || e.message) reportError(e.message, e.error?.stack) })
addEventListener('unhandledrejection', (e) => reportError(e.reason?.message || String(e.reason), e.reason?.stack))

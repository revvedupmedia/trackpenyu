// Dikongsi oleh semua halaman: landing, login, portal dan setiap app.
// Satu projek Supabase = satu login untuk semua app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const SUPABASE_URL = 'https://oatbghgoxedccxdjwalt.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_gQIBBbRniU3ixnV8eCDuYw_LeWpu0jK'

// Akar laman (folder yang ada index.html landing), dikira dari lokasi fail
// ini supaya pautan betul dari mana-mana subfolder (penyu/, minyak/, ...).
export const ROOT = new URL('../', import.meta.url).href

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

// { user, profile } untuk sesi semasa, atau { user: null } jika belum log masuk.
export async function currentUser() {
  await dropAbandonedRecovery()
  const { data } = await supabase.auth.getSession()
  const user = data?.session?.user || null
  if (!user) return { user: null, profile: null }
  const { data: profile } = await supabase.from('staff_profiles').select('*').eq('id', user.id).maybeSingle()
  return { user, profile: profile || null }
}

export function loginUrl(next) {
  return ROOT + 'login.html' + (next ? '?next=' + encodeURIComponent(next) : '')
}

// Panggil di atas setiap app. Belum log masuk => ke login; tiada akses => ke portal.
export async function requireApp(appId) {
  const { user, profile } = await currentUser()
  if (!user) { location.replace(loginUrl(appId + '/')); return new Promise(() => {}) }
  if (!canUse(profile, appId)) { location.replace(ROOT + 'portal.html?denied=' + appId); return new Promise(() => {}) }
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') location.replace(loginUrl())
  })
  return { user, profile }
}

export async function logout() {
  try { await supabase.auth.signOut() } catch {}
  try { sessionStorage.clear() } catch {}
  location.replace(loginUrl())
}

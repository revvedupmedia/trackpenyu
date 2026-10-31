// Pengganti vendor/supabase-js untuk ujian pelayar: pangkalan data dalam memori.
// Keadaan (sesi, peranan, MFA, jadual) dibaca dari localStorage.__fake supaya
// kekal merentasi navigasi halaman. Panggilan direkod dalam window.__calls.
// RLS TIDAK diemulasi di sini: ia diuji dalam tests/sql/ dengan PostgreSQL sebenar.

const load = () => { try { return JSON.parse(localStorage.__fake || '{}') } catch { return {} } }
const F = () => window.__fake || (window.__fake = load())
const save = () => { try { localStorage.__fake = JSON.stringify(F()) } catch {} }
const calls = window.__calls || (window.__calls = [])
const T = (t) => ((F().tables ||= {})[t] ||= [])
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
const me = () => F().user || { id: 'u-admin', email: 'admin@contoh.my' }

function query(table) {
  const st = { op: 'select', filters: [], order: [], vals: null, ret: false }
  const pass = (r) => st.filters.every((f) => f(r))
  const b = {
    select() { if (st.op !== 'select') st.ret = true; return b },
    eq(c, v) { st.filters.push((r) => String(r[c]) === String(v)); return b },
    is(c, v) { st.filters.push((r) => (r[c] ?? null) === v); return b },
    in(c, vs) { const s = vs.map(String); st.filters.push((r) => s.includes(String(r[c]))); return b },
    gte(c, v) { st.filters.push((r) => r[c] >= v); return b },
    lte(c, v) { st.filters.push((r) => r[c] <= v); return b },
    not(c, op, v) { st.filters.push((r) => (r[c] ?? null) !== v); return b },
    order(c, o = {}) { st.order.push([c, o.ascending !== false]); return b },
    limit(n) { st.limit = n; return b },
    range(a, z) { st.range = [a, z]; return b },
    update(v) { st.op = 'update'; st.vals = v; return b },
    delete() { st.op = 'delete'; return b },
    async maybeSingle() { const { data } = await run(); return { data: data?.[0] || null, error: null } },
    async single() { const { data } = await run(); return { data: data?.[0] || null, error: data?.length ? null : { message: 'no rows' } } },
    insert(v) {
      const rows = (Array.isArray(v) ? v : [v]).map((r) => ({ id: uid(), created_at: new Date().toISOString(), deleted_at: null, ...r }))
      for (const r of rows) {
        if (table === 'minyak_entries' && r.receipt_ref && T(table).some((e) => e.receipt_ref === r.receipt_ref && !e.deleted_at))
          return Promise.resolve({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
      }
      T(table).push(...rows); save(); calls.push(['insert', table, v])
      return Promise.resolve({ data: rows, error: null })
    },
    upsert(v, o = {}) {
      const key = o.onConflict || 'id'
      for (const r of Array.isArray(v) ? v : [v]) {
        const i = T(table).findIndex((x) => x[key] === r[key])
        if (i >= 0) T(table)[i] = { ...T(table)[i], ...r }; else T(table).push(r)
      }
      save(); calls.push(['upsert', table, v])
      return Promise.resolve({ error: null })
    },
    then(res, rej) { return run().then(res, rej) },
  }
  async function run() {
    if ((F().missing || []).includes(table)) return { data: null, error: { message: `relation "public.${table}" does not exist` } }
    let rows = T(table).filter(pass)
    if (st.op === 'update') { rows.forEach((r) => Object.assign(r, st.vals)); save(); calls.push(['update', table, st.vals, rows.length]) }
    if (st.op === 'delete') { F().tables[table] = T(table).filter((r) => !pass(r)); save(); calls.push(['delete', table]); return { data: rows, error: null } }
    rows = [...rows]
    for (const [c, asc] of [...st.order].reverse()) rows.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1))
    if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1)
    if (st.limit) rows = rows.slice(0, st.limit)
    return { data: JSON.parse(JSON.stringify(rows)), error: null }
  }
  return b
}

export function createClient() {
  return {
    from: query,
    rpc: async () => ({ data: null, error: null }),
    storage: {
      from: (bucket) => ({
        upload: async (path, file) => { calls.push(['upload', bucket, path, file.size, file.type, file.name]); return { error: null } },
        remove: async (paths) => { calls.push(['remove', bucket, paths]); return { error: null } },
        createSignedUrl: async (path) => ({ data: { signedUrl: (F().receiptFiles || {})[path] || '/tests/fixtures/receipt-a.txt' }, error: null }),
        getPublicUrl: (path) => ({ data: { publicUrl: '/' + path } }),
      }),
    },
    auth: {
      getSession: async () => ({ data: { session: F().session ? { user: me() } : null } }),
      getUser: async () => ({ data: { user: F().session ? me() : null } }),
      signInWithPassword: async ({ password }) => {
        if (password !== (F().password || 'betul')) return { error: { message: 'Invalid login credentials' } }
        F().session = true; F().aal = 'aal1'; save(); return { data: { user: me() }, error: null }
      },
      signOut: async () => { F().session = false; save(); calls.push(['signOut']); return {} },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      resetPasswordForEmail: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: F().aal || 'aal1', nextLevel: (F().factors || []).some((f) => f.status === 'verified') ? 'aal2' : 'aal1' } }),
        listFactors: async () => ({ data: { totp: (F().factors || []).filter((f) => f.status === 'verified'), all: F().factors || [] } }),
        enroll: async () => {
          calls.push(['enroll'])
          // Bentuk sama seperti Supabase sebenar: SVG mentah dengan tanda petik dan '#'.
          return { data: { id: 'f-new', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 4 4"><path fill="#000000" d="M0 0h2v2H0z"/></svg>', secret: 'JBSWY3DPEHPK3PXP' } }, error: null }
        },
        unenroll: async ({ factorId }) => { calls.push(['unenroll', factorId]); F().factors = (F().factors || []).filter((f) => f.id !== factorId); save(); return {} },
        challengeAndVerify: async ({ factorId, code }) => {
          calls.push(['verify', factorId, code])
          if (code !== '123456') return { error: { message: 'Invalid TOTP code entered' } }
          F().aal = 'aal2'; save(); return { data: {}, error: null }
        },
      },
    },
  }
}

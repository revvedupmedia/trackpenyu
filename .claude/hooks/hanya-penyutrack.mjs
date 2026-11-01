// Sekat tool Supabase yang menyasarkan projek selain PenyuTrack.
// Akaun Supabase yang sama ada projek lain; repo ini hanya untuk PenyuTrack.
// Dipanggil oleh Claude Code sebelum setiap tool mcp__Supabase__* (lihat settings.json).
const PENYUTRACK = 'oatbghgoxedccxdjwalt'
let raw = ''
for await (const chunk of process.stdin) raw += chunk
let input = {}
try { input = JSON.parse(raw).tool_input || {} } catch { process.exit(0) }
const id = input.project_id ?? input.id ?? input.project_ref
if (id !== undefined && id !== PENYUTRACK) {
  console.error(`Disekat: repo trackpenyu hanya boleh guna projek Supabase PenyuTrack (${PENYUTRACK}), bukan "${id}".`)
  process.exit(2)
}

# Penyu Tracker — Simple Version

No npm, no build step, no React, no service worker. One HTML file that
runs directly in the browser using CDN libraries (Supabase JS, Tailwind).
Deploy by pushing files to GitHub — that's it.

## Setup (one-time)

### 1. Supabase
Already done if you ran `schema.sql` before — if not:
1. Supabase project → SQL Editor → paste `schema.sql` → Run
2. Authentication → Add User → create your login
3. Table Editor → `staff_profiles` → insert a row with that user's `id`,
   your name, an island, `role = admin`

Your Supabase URL and key are already filled into `index.html` (lines near
the top of the `<script type="module">` block, marked `CONFIG`).

### 2. Deploy to GitHub Pages
```bash
git init
git add .
git commit -m "Penyu Tracker — simple static version"
git branch -M main
git remote add origin https://github.com/revvedupmedia/penyutrack.git
git push -u origin main --force
```
(`--force` overwrites whatever's currently in the repo — fine since we're
replacing the whole project with this simpler version.)

Then: repo → Settings → Pages → Source → **Deploy from a branch** →
Branch: `main`, folder `/ (root)` → Save.

Live in ~1 minute at `https://revvedupmedia.github.io/penyutrack/`

### 3. Updating later
Edit `index.html` directly (in GitHub's web editor, or locally), then:
```bash
git add .
git commit -m "update"
git push
```
No build, no npm, no waiting on Actions. Push and it's live.

## What's included
- Island-gated login (PTB/PTK/PSB)
- Nest entry (new nest + hatch update), pre-submit summary + 5s delay
- My Entries (edit anytime, own records only)
- Dashboard (totals, target progress, hatch rate)
- Admin panel (yearly target, background video upload)
- Offline queue (saves to browser storage if signal drops, syncs when back online)
- Dark/light toggle, outlined text, frosted cards

## What's simplified vs the full version
- No installable PWA / offline app icon (still works offline via a simpler queue, just not installable to home screen)
- No animated transitions (plain CSS fades instead of spring physics)
- Charts/trend graph not included in this version (totals + progress bar only)
- Staff/island management still done via Supabase dashboard, not in-app

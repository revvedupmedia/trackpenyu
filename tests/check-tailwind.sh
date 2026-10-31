#!/usr/bin/env bash
# Pastikan penyu/tailwind.css sama dengan hasil bina semula dari kelas dalam
# penyu/index.html (lihat vendor/README.md). Gagal => CSS lapuk, bina semula.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > "$tmp/in.css"
echo "module.exports={content:['$(pwd)/penyu/index.html']}" > "$tmp/tailwind.config.js"
npx --yes tailwindcss@3.4.19 -c "$tmp/tailwind.config.js" -i "$tmp/in.css" -o "$tmp/out.css" --minify 2>/dev/null
if tail -n +4 penyu/tailwind.css | cmp -s - "$tmp/out.css"; then
  echo "OK: penyu/tailwind.css terkini"
else
  echo "GAGAL: penyu/tailwind.css lapuk. Bina semula ikut vendor/README.md."; exit 1
fi

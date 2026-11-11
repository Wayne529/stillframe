#!/bin/zsh
cd -- "$(dirname "$0")"
if [[ ! -d node_modules ]]; then
  pnpm install --frozen-lockfile || exit 1
fi
exec npx --yes node@24 node_modules/vite/bin/vite.js --host 0.0.0.0 --open

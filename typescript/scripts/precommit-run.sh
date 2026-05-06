#!/usr/bin/env bash
set -euo pipefail

tool="$1"
flag="$2"
shift 2

files=()
for f in "$@"; do
  files+=("${f#typescript/}")
done

cd "$(dirname "$0")/.."
exec pnpm exec "$tool" "$flag" "${files[@]}"

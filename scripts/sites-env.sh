#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ "${1:-}" == "--" ]] && shift
exec node "${script_dir}/run-with-sites-env.mjs" "$@"

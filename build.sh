#!/usr/bin/env bash
# Build src/ into a single self-contained index.html
set -euo pipefail
cd "$(dirname "$0")"
exec python3 build.py "$@"

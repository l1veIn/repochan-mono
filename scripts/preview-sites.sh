#!/usr/bin/env bash
# preview-sites.sh — 批量启动站点本地预览并在浏览器打开
# 默认服务 packages/starters 下全部 starter；用 PREVIEW_SITES_DIR 环境变量覆盖
# （例如 PREVIEW_SITES_DIR=web-design/sites 预览原型站）。
#
# 用法:
#   scripts/preview-sites.sh            # 服务全部站点并打开浏览器标签
#   scripts/preview-sites.sh --build    # 先强制重新 build 再预览
#   scripts/preview-sites.sh --list     # 只打印 URL 清单，不开浏览器
#
# Ctrl+C 停止全部预览服务。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITES_DIR="${PREVIEW_SITES_DIR:-$ROOT/packages/starters}"
BASE_PORT=4410
OPEN_BROWSER=1
FORCE_BUILD=0

for arg in "$@"; do
  case "$arg" in
    --build) FORCE_BUILD=1 ;;
    --list)  OPEN_BROWSER=0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

[[ -d "$SITES_DIR" ]] || { echo "no sites dir: $SITES_DIR" >&2; exit 1; }

# --list: 只枚举，不起服务
if [[ $OPEN_BROWSER -eq 0 ]]; then
  PORT=$BASE_PORT
  for site in "$SITES_DIR"/*/; do
    echo "  http://127.0.0.1:$PORT  $(basename "$site")"
    PORT=$((PORT + 1))
  done
  exit 0
fi

PIDS=()
cleanup() {
  echo
  if [[ ${#PIDS[@]} -gt 0 ]]; then
    echo "stopping ${#PIDS[@]} preview server(s)…"
    kill "${PIDS[@]}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

PORT=$BASE_PORT
URLS=()
for site in "$SITES_DIR"/*/; do
  name="$(basename "$site")"
  dist="$site/dist"

  if [[ $FORCE_BUILD -eq 1 || ! -d "$dist" ]]; then
    echo "▸ building $name…"
    if [[ ! -d "$site/node_modules" ]]; then
      (cd "$site" && pnpm install --ignore-workspace --silent)
    fi
    (cd "$site" && pnpm build --silent) || { echo "  ✗ build failed: $name" >&2; continue; }
  fi

  (cd "$dist" && exec python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1) &
  PIDS+=($!)
  URLS+=("http://127.0.0.1:$PORT  $name")
  PORT=$((PORT + 1))
done

echo
echo "previews:"
for u in "${URLS[@]}"; do echo "  $u"; done
echo

if [[ $OPEN_BROWSER -eq 1 ]]; then
  for u in "${URLS[@]}"; do open "${u%% *}"; done
  echo "opened ${#URLS[@]} tab(s). Ctrl+C to stop."
fi

wait

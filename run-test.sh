#!/usr/bin/env bash
#
# run-test.sh — RepoChan 批量全流程测试脚本
#
# 对 test-repos/ 下的每个项目执行完整的 repochan yolo 全流程
# (analysis → persona → foundation → sticker/poster/banner)，并将
# 结果归档到 test-results/<timestamp>/。
#
# ── 前置准备 ──────────────────────────────────────────────────────
#
# 1. clone 测试仓库
#    mkdir -p test-repos
#    cd test-repos
#    git clone <repo-url> <name>   # 每个 repo 一个子目录
#
# 2. 安装 repochan CLI（全局可用）
#    pnpm --filter repochan build
#    npm link                      # 或 pnpm link --global
#    repochan --version            # 确认能跑
#
# 3. 安装 skill 到 Claude Code（全局）
#    repochan setup --global --agent claude --yes
#
# 4. 配置图像生成
#    repochan image configure      # 配 OpenAI / 自定义 endpoint + key
#    # 验证：repochan image gen --prompt "test" --out /tmp/t.png
#
# 5. 安装 Claude Code CLI 并登录
#    claude --version              # 确认已安装
#    claude                        # 首次交互登录
#
# ── 用法 ──────────────────────────────────────────────────────────
#
#   ./run-test.sh                  # 跑 test-repos/ 下所有项目
#   ./run-test.sh <project>        # 只跑指定项目
#   ./run-test.sh --help           # 打印此说明
#
set -uo pipefail

# Disable claude -p 10-min SIGKILL ceiling (allows long-running sessions).
export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
TEST_REPOS_DIR="$REPO_ROOT/test-repos"
RESULTS_DIR="$REPO_ROOT/test-results"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_DIR="$RESULTS_DIR/$TIMESTAMP"
LOG_DIR="$ARCHIVE_DIR/logs"

# ── Colors ────────────────────────────────────────────────────────
BOLD='\033[1m'; CYAN='\033[36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; DIM='\033[2m'; RESET='\033[0m'
log()  { echo -e "[$(date +%H:%M:%S)] ${BOLD}[$1]${RESET} $2"; }
ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
warn() { echo -e "  ${YELLOW}⚠${RESET} $1"; }
fail() { echo -e "  ${RED}✗${RESET} $1"; }

# ── Help ──────────────────────────────────────────────────────────
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  # Print the comment block at the top of this file (lines 3-37).
  sed -n '3,37p' "$0" | sed 's/^# \?//'
  echo ""
  echo "Available projects in test-repos/:"
  if [ -d "$TEST_REPOS_DIR" ]; then
    for d in "$TEST_REPOS_DIR"/*/; do
      [ -d "$d" ] && echo "  $(basename "$d")"
    done
  else
    echo "  (test-repos/ not found)"
  fi
  exit 0
fi

# ── Preflight checks ─────────────────────────────────────────────
echo -e "${BOLD}=== Preflight checks ===${RESET}"
PREFLIGHT_OK=1

# repochan CLI
if command -v repochan &>/dev/null; then
  ok "repochan: $(repochan --version 2>&1)"
else
  fail "repochan CLI not found on PATH"
  echo "    → Run: pnpm --filter repochan build && npm link"
  PREFLIGHT_OK=0
fi

# claude CLI
if command -v claude &>/dev/null; then
  ok "claude: $(claude --version 2>&1)"
else
  fail "claude CLI not found on PATH"
  echo "    → Install Claude Code CLI and run 'claude' to login"
  PREFLIGHT_OK=0
fi

# image config
IMAGE_CONFIG="$HOME/.repochan/image.json"
if [ -f "$IMAGE_CONFIG" ]; then
  ok "image config: $IMAGE_CONFIG"
else
  fail "image config not found at $IMAGE_CONFIG"
  echo "    → Run: repochan image configure"
  PREFLIGHT_OK=0
fi

# claude global skills
if [ -d "$HOME/.claude/skills/repochan" ]; then
  ok "claude skills: installed (~/.claude/skills/repochan)"
else
  fail "repochan skills not installed for claude"
  echo "    → Run: repochan setup --global --agent claude --yes"
  PREFLIGHT_OK=0
fi

# test-repos directory
if [ ! -d "$TEST_REPOS_DIR" ]; then
  fail "test-repos/ directory not found at $TEST_REPOS_DIR"
  echo "    → mkdir -p test-repos && cd test-repos && git clone <repo-url> <name>"
  PREFLIGHT_OK=0
fi

if [ $PREFLIGHT_OK -eq 0 ]; then
  echo ""
  echo -e "${RED}Preflight failed. Fix the issues above and retry.${RESET}"
  exit 1
fi

# ── Collect project list ──────────────────────────────────────────
if [ -n "${1:-}" ]; then
  PROJECTS=("$1")
  if [ ! -d "$TEST_REPOS_DIR/$1" ]; then
    fail "Project not found: $TEST_REPOS_DIR/$1"
    exit 1
  fi
else
  PROJECTS=()
  for d in "$TEST_REPOS_DIR"/*/; do
    [ -d "$d" ] || continue
    local_name="$(basename "$d")"
    # Skip directories starting with _
    [[ "$local_name" == _* ]] && continue
    PROJECTS+=("$local_name")
  done
fi

if [ ${#PROJECTS[@]} -eq 0 ]; then
  warn "No projects found in test-repos/ (directories starting with _ are skipped)"
  exit 0
fi

echo ""
echo -e "${BOLD}=== Projects (${#PROJECTS[@]}) ===${RESET}"
for p in "${PROJECTS[@]}"; do echo "  - $p"; done
echo ""

# ── Prepare archive directory ─────────────────────────────────────
mkdir -p "$LOG_DIR"
echo -e "${DIM}Archive: $ARCHIVE_DIR${RESET}"
echo ""

# ── The claude prompt (shared) ────────────────────────────────────
CLAUDE_PROMPT='/repochan yolo 模式，生成全套资产：foundation_sheet、sticker_sheet(chibi 3x3)、poster、readme_banner、pattern。不要部署。完成后 repochan status 汇报。'

# ── Run pipeline for each project ─────────────────────────────────
TOTAL=${#PROJECTS[@]}
IDX=0
FAILED=()

for project in "${PROJECTS[@]}"; do
  IDX=$((IDX + 1))
  proj_dir="$TEST_REPOS_DIR/$project"
  log_file="$LOG_DIR/$project.log"

  echo -e "${BOLD}=== [$IDX/$TOTAL] $project ===${RESET}"

  # Clean state
  log "$project" "cleaning .repochan"
  rm -rf "$proj_dir/.repochan" "$proj_dir/output" "$proj_dir/.pi"

  # Run claude
  log "$project" "starting full pipeline"
  (
    cd "$proj_dir" || exit 1
    claude -p "$CLAUDE_PROMPT" \
      --permission-mode bypassPermissions \
      --output-format text \
      2>&1
  ) | tee "$log_file"

  claude_rc=${PIPESTATUS[0]}

  # Check results
  img_count=$(find "$proj_dir/.repochan/orders" -name "*.png" 2>/dev/null | wc -l | tr -d ' ')
  result_count=$(cd "$proj_dir" && repochan status --json 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)['results']['count'])" 2>/dev/null || echo 0)

  if [ "$result_count" -ge 4 ]; then
    log "$project" "${GREEN}✓ done — $result_count results, $img_count images${RESET}"
  else
    log "$project" "${RED}✗ incomplete — $result_count results, $img_count images${RESET}"
    FAILED+=("$project")
  fi
  echo ""
done

# ── Archive results ───────────────────────────────────────────────
echo -e "${BOLD}=== Archiving ===${RESET}"
mkdir -p "$ARCHIVE_DIR"

declare -a summary_entries=()

for project in "${PROJECTS[@]}"; do
  proj_dir="$TEST_REPOS_DIR/$project"
  src_repochan="$proj_dir/.repochan"

  if [ ! -d "$src_repochan" ]; then
    warn "$project: no .repochan to archive"
    continue
  fi

  # Archive name: shorten tauri-react-i18n-darkmode-starter → tauri-starter
  archive_name="$project"

  dest="$ARCHIVE_DIR/$archive_name"
  mkdir -p "$dest"
  cp -R "$src_repochan/." "$dest/"

  # Collect summary info
  persona_name=$(python3 -c "import json;d=json.load(open('$dest/persona/current.json'));print(d.get('name','?'))" 2>/dev/null || echo "?")
  persona_artstyle=$(python3 -c "import json;d=json.load(open('$dest/persona/current.json'));print(d.get('artStyle','(none)'))" 2>/dev/null || echo "(none)")
  img_count=$(find "$dest/orders" -name "*.png" 2>/dev/null | wc -l | tr -d ' ')
  order_count=$(ls "$dest/orders" 2>/dev/null | wc -l | tr -d ' ')

  ok "$project → $archive_name/ ($img_count images, $order_count orders)"
  summary_entries+=("{\"project\":\"$project\",\"persona\":\"$persona_name\",\"artStyle\":\"$persona_artstyle\",\"images\":$img_count,\"orders\":$order_count}")
done

# Write summary.json
python3 -c "
import json,sys
entries = [json.loads(e) for e in sys.argv[1:]]
print(json.dumps({
  'timestamp': '$TIMESTAMP',
  'totalProjects': ${#PROJECTS[@]},
  'failed': $(python3 -c "import json;print(json.dumps('${FAILED[*]}'.split() if '${FAILED[*]}' else []))" 2>/dev/null || echo '[]'),
  'projects': entries
}, indent=2, ensure_ascii=False))
" "${summary_entries[@]}" > "$ARCHIVE_DIR/summary.json" 2>/dev/null || true

# ── Final report ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}=== Summary ===${RESET}"
echo -e "  Archive: ${CYAN}$ARCHIVE_DIR${RESET}"
echo -e "  Projects: ${#PROJECTS[@]} total, $(( ${#PROJECTS[@]} - ${#FAILED[@]} )) succeeded, ${#FAILED[@]} failed"
if [ ${#FAILED[@]} -gt 0 ]; then
  echo -e "  ${RED}Failed: ${FAILED[*]}${RESET}"
fi
echo -e "  Summary: $ARCHIVE_DIR/summary.json"
echo ""

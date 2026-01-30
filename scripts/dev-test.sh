#!/bin/bash
#
# 🧪 VSMONSTER 開發安裝測試腳本
#
# 用途：測試從零開始的安裝流程，確保每個步驟都能正常運作
# 
# 使用方式：
#   ./scripts/dev-test.sh           # 完整測試
#   ./scripts/dev-test.sh --quick   # 快速測試（跳過部分檢查）
#   ./scripts/dev-test.sh --docker  # 在 Docker 中測試
#
# 注意：此腳本不會上傳到 Git（已加入 .gitignore）
#

set -e  # 遇到錯誤立即停止

# ============================================
# 🎨 顏色定義
# ============================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================
# 📊 測試結果記錄
# ============================================
RESULTS_DIR="./dev-test-results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$RESULTS_DIR/test_$TIMESTAMP.log"
SCREENSHOT_DIR="$RESULTS_DIR/screenshots_$TIMESTAMP"

mkdir -p "$RESULTS_DIR"
mkdir -p "$SCREENSHOT_DIR"

# ============================================
# 🔧 輔助函數
# ============================================
log() {
    echo -e "${CYAN}[$(date +'%H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

fail() {
    echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"
}

header() {
    echo "" | tee -a "$LOG_FILE"
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" | tee -a "$LOG_FILE"
    echo -e "${PURPLE}  $1${NC}" | tee -a "$LOG_FILE"
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" | tee -a "$LOG_FILE"
}

# 測試步驟計數
STEP=0
PASSED=0
FAILED=0
SKIPPED=0

test_step() {
    STEP=$((STEP + 1))
    echo -e "\n${BLUE}[$STEP]${NC} $1" | tee -a "$LOG_FILE"
}

record_pass() {
    PASSED=$((PASSED + 1))
    success "$1"
}

record_fail() {
    FAILED=$((FAILED + 1))
    fail "$1"
}

record_skip() {
    SKIPPED=$((SKIPPED + 1))
    warn "SKIPPED: $1"
}

# ============================================
# 🚀 開始測試
# ============================================
header "🧪 VSMONSTER 開發安裝測試"
log "開始時間: $(date)"
log "測試日誌: $LOG_FILE"
log "截圖目錄: $SCREENSHOT_DIR"

# ============================================
# 1️⃣ 環境檢查
# ============================================
header "1️⃣ 環境檢查"

test_step "檢查 Node.js 版本"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    if [[ "$NODE_VERSION" =~ ^v(1[8-9]|[2-9][0-9])\. ]]; then
        record_pass "Node.js $NODE_VERSION (需要 >= 18)"
    else
        record_fail "Node.js $NODE_VERSION 版本太舊（需要 >= 18）"
    fi
else
    record_fail "Node.js 未安裝"
fi

test_step "檢查 pnpm 版本"
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm -v)
    record_pass "pnpm v$PNPM_VERSION"
else
    record_fail "pnpm 未安裝"
    log "安裝方式: npm install -g pnpm"
fi

test_step "檢查 Git"
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version)
    record_pass "$GIT_VERSION"
else
    record_fail "Git 未安裝"
fi

test_step "檢查 Docker（可選）"
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    record_pass "$DOCKER_VERSION"
else
    record_skip "Docker 未安裝（非必要）"
fi

# ============================================
# 2️⃣ 依賴安裝測試
# ============================================
header "2️⃣ 依賴安裝測試"

test_step "清理 node_modules（乾淨測試）"
if [ "$1" != "--quick" ]; then
    rm -rf node_modules packages/*/node_modules
    record_pass "已清理所有 node_modules"
else
    record_skip "快速模式，跳過清理"
fi

test_step "執行 pnpm install"
START_TIME=$(date +%s)
if pnpm install 2>&1 | tee -a "$LOG_FILE"; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    record_pass "安裝成功（耗時 ${DURATION}s）"
else
    record_fail "pnpm install 失敗"
fi

test_step "檢查 postinstall 腳本"
if [ -f "scripts/post-install.js" ]; then
    record_pass "postinstall 腳本存在"
else
    record_fail "postinstall 腳本不存在"
fi

# ============================================
# 3️⃣ 建構測試
# ============================================
header "3️⃣ 建構測試"

test_step "建構 Gateway"
if pnpm --filter @vsmonster/gateway build 2>&1 | tee -a "$LOG_FILE"; then
    record_pass "Gateway 建構成功"
else
    record_fail "Gateway 建構失敗"
fi

test_step "建構 Mission Control"
if pnpm --filter @vsmonster/mission-control build 2>&1 | tee -a "$LOG_FILE"; then
    record_pass "Mission Control 建構成功"
else
    record_fail "Mission Control 建構失敗"
fi

test_step "建構 VS Code Extension"
if pnpm --filter vsmonster build 2>&1 | tee -a "$LOG_FILE"; then
    record_pass "VS Code Extension 建構成功"
else
    record_fail "VS Code Extension 建構失敗"
fi

# ============================================
# 4️⃣ 類型檢查
# ============================================
header "4️⃣ TypeScript 類型檢查"

test_step "Gateway 類型檢查"
if pnpm --filter @vsmonster/gateway type-check 2>&1 | tee -a "$LOG_FILE"; then
    record_pass "Gateway 類型檢查通過"
else
    record_fail "Gateway 類型檢查失敗"
fi

test_step "Mission Control 類型檢查"
if pnpm --filter @vsmonster/mission-control type-check 2>&1 | tee -a "$LOG_FILE"; then
    record_pass "Mission Control 類型檢查通過"
else
    record_fail "Mission Control 類型檢查失敗"
fi

# ============================================
# 5️⃣ 功能測試
# ============================================
header "5️⃣ 功能測試"

test_step "測試 Gateway 啟動"
# 啟動 Gateway 並在背景運行
timeout 10 pnpm --filter @vsmonster/gateway dev &
GATEWAY_PID=$!
sleep 5

# 檢查是否在運行
if kill -0 $GATEWAY_PID 2>/dev/null; then
    record_pass "Gateway 可以啟動"
    kill $GATEWAY_PID 2>/dev/null || true
else
    record_fail "Gateway 啟動失敗"
fi

test_step "測試 Mission Control 啟動"
# 啟動 Mission Control 並在背景運行
timeout 15 pnpm --filter @vsmonster/mission-control dev &
MISSION_PID=$!
sleep 8

# 檢查 port 3001
if curl -s http://localhost:3001 > /dev/null 2>&1; then
    record_pass "Mission Control 可以啟動 (port 3001)"
    # 截圖（如果有 playwright）
    if command -v npx &> /dev/null; then
        log "嘗試截圖..."
    fi
else
    record_fail "Mission Control 無法在 port 3001 啟動"
fi

# 清理
kill $MISSION_PID 2>/dev/null || true

# ============================================
# 6️⃣ 配置檔案檢查
# ============================================
header "6️⃣ 配置檔案檢查"

test_step "檢查 config.example.json"
if [ -f "configs/config.example.json" ]; then
    record_pass "config.example.json 存在"
else
    record_fail "config.example.json 不存在"
fi

test_step "檢查 config.schema.json"
if [ -f "configs/config.schema.json" ]; then
    record_pass "config.schema.json 存在"
else
    record_fail "config.schema.json 不存在"
fi

test_step "檢查 tsconfig.json"
if [ -f "packages/gateway/tsconfig.json" ]; then
    record_pass "Gateway tsconfig.json 存在"
else
    record_fail "Gateway tsconfig.json 不存在"
fi

# ============================================
# 7️⃣ 文檔檢查
# ============================================
header "7️⃣ 文檔完整性"

DOCS=(
    "README.md"
    "CHANGELOG.md"
    "docs/quick-start.md"
    "docs/setup-line.md"
    "docs/setup-discord.md"
    "docs/setup-telegram.md"
)

for doc in "${DOCS[@]}"; do
    test_step "檢查 $doc"
    if [ -f "$doc" ]; then
        LINES=$(wc -l < "$doc")
        record_pass "$doc 存在 ($LINES 行)"
    else
        record_fail "$doc 不存在"
    fi
done

# ============================================
# 📊 測試報告
# ============================================
header "📊 測試報告"

echo "" | tee -a "$LOG_FILE"
echo -e "${GREEN}✓ 通過: $PASSED${NC}" | tee -a "$LOG_FILE"
echo -e "${RED}✗ 失敗: $FAILED${NC}" | tee -a "$LOG_FILE"
echo -e "${YELLOW}⚠ 跳過: $SKIPPED${NC}" | tee -a "$LOG_FILE"
echo -e "總計: $STEP 項測試" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# 計算成功率
if [ $STEP -gt 0 ]; then
    SUCCESS_RATE=$(echo "scale=1; $PASSED * 100 / $STEP" | bc)
    echo -e "成功率: ${SUCCESS_RATE}%" | tee -a "$LOG_FILE"
fi

log "結束時間: $(date)"
log "完整日誌: $LOG_FILE"

# 退出碼
if [ $FAILED -gt 0 ]; then
    echo -e "\n${RED}❌ 測試有失敗項目，請檢查日誌${NC}"
    exit 1
else
    echo -e "\n${GREEN}✅ 所有測試通過！${NC}"
    exit 0
fi

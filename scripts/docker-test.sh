#!/bin/bash
#
# 🐳 Docker 乾淨安裝測試腳本
#
# 用途：在 Docker 容器中執行乾淨安裝測試
# 每次測試完自動刪除容器和 volumes
#
# 使用方式：
#   ./scripts/docker-test.sh              # 完整測試
#   ./scripts/docker-test.sh install      # 只測試安裝
#   ./scripts/docker-test.sh gateway      # 只測試 Gateway
#   ./scripts/docker-test.sh mission      # 只測試 Mission Control
#   ./scripts/docker-test.sh e2e          # 只測試 E2E（含截圖錄影）
#

set -e

# 顏色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🐳 VSMONSTER Docker 乾淨安裝測試"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${NC}"

# 確保測試結果目錄存在
mkdir -p dev-test-results

# 清理舊的測試容器
echo -e "${YELLOW}🧹 清理舊的測試容器...${NC}"
docker-compose -f docker-compose.test.yml down -v 2>/dev/null || true

case "$1" in
    install)
        echo -e "${GREEN}📦 執行安裝測試...${NC}"
        docker-compose -f docker-compose.test.yml up --build install-test
        ;;
    gateway)
        echo -e "${GREEN}🎯 執行 Gateway 測試...${NC}"
        docker-compose -f docker-compose.test.yml up --build gateway-test
        ;;
    mission)
        echo -e "${GREEN}🖥️ 執行 Mission Control 測試...${NC}"
        docker-compose -f docker-compose.test.yml up --build mission-control-test
        ;;
    e2e)
        echo -e "${GREEN}📸 執行 E2E 截圖測試...${NC}"
        docker-compose -f docker-compose.test.yml up --build gateway-test mission-control-test e2e-test
        ;;
    *)
        echo -e "${GREEN}🧪 執行完整測試...${NC}"
        docker-compose -f docker-compose.test.yml up --build install-test
        ;;
esac

# 測試完成後清理
echo ""
echo -e "${YELLOW}🧹 清理測試容器...${NC}"
docker-compose -f docker-compose.test.yml down -v

echo ""
echo -e "${GREEN}✅ 測試完成！結果保存在 ./dev-test-results/${NC}"
echo ""
echo "查看結果："
echo "  cat dev-test-results/docker-test.log"
echo "  ls dev-test-results/"

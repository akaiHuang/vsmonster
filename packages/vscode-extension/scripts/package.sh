#!/bin/bash
# VSMONSTER VS Code Extension 打包腳本
# 解決 monorepo 環境下 vsce 包含上層目錄的問題

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(dirname "$SCRIPT_DIR")"
TMP_DIR="/tmp/vsmonster-extension-build"

echo "VSMONSTER Extension 打包腳本"
echo "================================"

# 清理臨時目錄
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

# 複製必要檔案
echo "📁 複製檔案到臨時目錄..."
cp -r "$EXT_DIR/src" "$TMP_DIR/"
cp -r "$EXT_DIR/resources" "$TMP_DIR/"
cp "$EXT_DIR/package.json" "$TMP_DIR/"
cp "$EXT_DIR/tsconfig.json" "$TMP_DIR/"
cp "$EXT_DIR/README.md" "$TMP_DIR/"
cp "$EXT_DIR/CHANGELOG.md" "$TMP_DIR/"
cp "$EXT_DIR/LICENSE" "$TMP_DIR/"

# 如果有 .vscodeignore 也複製
if [ -f "$EXT_DIR/.vscodeignore" ]; then
    cp "$EXT_DIR/.vscodeignore" "$TMP_DIR/"
fi

# 如果已有編譯好的 dist，也複製
if [ -d "$EXT_DIR/dist" ]; then
    cp -r "$EXT_DIR/dist" "$TMP_DIR/"
fi

# 進入臨時目錄
cd "$TMP_DIR"

# 安裝依賴
echo "📦 安裝依賴..."
npm install --production=false

# 打包
echo "🔨 打包 VSIX..."
npx @vscode/vsce package --allow-missing-repository

# 複製回原目錄
echo "📋 複製 VSIX 到專案目錄..."
cp "$TMP_DIR"/*.vsix "$EXT_DIR/"

# 清理
rm -rf "$TMP_DIR"

echo ""
echo "✅ 打包完成！"
echo "📦 VSIX 檔案位置: $EXT_DIR/*.vsix"
echo ""
echo "下一步："
echo "  1. 本地測試: code --install-extension $EXT_DIR/*.vsix"
echo "  2. 發布到 Marketplace:"
echo "     - 註冊 Azure DevOps: https://dev.azure.com/"
echo "     - 建立 PAT (Personal Access Token)"
echo "     - npx @vscode/vsce login vsmonster"
echo "     - npx @vscode/vsce publish"

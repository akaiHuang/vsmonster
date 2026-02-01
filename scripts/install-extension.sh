#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="$ROOT_DIR/packages/vscode-extension"
PACKAGE_SCRIPT="$EXT_DIR/scripts/package.sh"

if [ ! -f "$PACKAGE_SCRIPT" ]; then
  echo "❌ 找不到打包腳本: $PACKAGE_SCRIPT" >&2
  exit 1
fi

echo "🚀 打包 VSIX..."
bash "$PACKAGE_SCRIPT"

VSIX_FILE="$(ls -t "$EXT_DIR"/*.vsix 2>/dev/null | head -n 1)"
if [ -z "${VSIX_FILE}" ]; then
  echo "❌ 找不到 VSIX 檔案，請確認打包是否成功。" >&2
  exit 1
fi

CODE_CMD=""
if command -v code >/dev/null 2>&1; then
  CODE_CMD="code"
elif command -v code-insiders >/dev/null 2>&1; then
  CODE_CMD="code-insiders"
fi

if [ -z "${CODE_CMD}" ]; then
  echo "❌ 找不到 VS Code CLI (code / code-insiders)。" >&2
  echo "請在 VS Code 開啟命令面板，執行: Shell Command: Install 'code' command in PATH" >&2
  exit 1
fi

echo "📦 安裝 VSIX: $VSIX_FILE"
"$CODE_CMD" --install-extension "$VSIX_FILE"

echo "✅ 安裝完成。若未自動生效，請重新載入 VS Code 視窗。"

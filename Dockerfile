FROM node:20-alpine

WORKDIR /app

# 安裝 pnpm
RUN npm install -g pnpm

# 複製 package files
COPY package.json pnpm-workspace.yaml ./
COPY packages/gateway/package.json ./packages/gateway/
COPY packages/shared/package.json ./packages/shared/

# 安裝依賴
RUN pnpm install --frozen-lockfile

# 複製原始碼
COPY packages/gateway ./packages/gateway
COPY packages/shared ./packages/shared

# 建置
RUN pnpm --filter @vsmolt/gateway build

# 設定環境變數
ENV NODE_ENV=production
ENV PORT=3000

# 暴露端口
EXPOSE 3000

# 啟動命令
CMD ["node", "packages/gateway/dist/server.js"]

FROM node:26.5.1-bookworm-slim AS builder

WORKDIR /app

# 依存の取得はソースの変更で無効化されないよう、先に manifest だけを渡す
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 本番イメージに devDependencies を持ち込まないため、実行用の依存を別に用意する
FROM node:26.5.1-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:26.5.1-bookworm-slim AS app

WORKDIR /app

COPY --from=deps /app/node_modules node_modules
COPY --from=builder /app/dist dist
# ESM として解決させるために "type": "module" が要る
COPY package.json package.json

USER node
# npm を挟むと SIGTERM がプロセスまで伝播しないため node を直接起動する。
# .env はイメージに含めず環境変数は Fly.io から注入されるので dotenvx は通さない
CMD ["node", "dist/server.js"]

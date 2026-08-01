# ベース OS は実行イメージの distroless (debian13) に合わせて trixie で統一する
FROM node:26.5.0-trixie-slim AS builder

WORKDIR /app

# 依存の取得はソースの変更で無効化されないよう、先に manifest だけを渡す
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 本番イメージに devDependencies を持ち込まないため、実行用の依存を別に用意する
FROM node:26.5.0-trixie-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# distroless はシェルもパッケージマネージャも持たないため攻撃面が小さい。
# タグは更新で中身の Node が変わるので、Node 26.5.0 を含む digest で固定する
FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:d440510c9ef4ff874b240bb6b855e4de4e797db283e41d8d506da5085a677f26 AS app

WORKDIR /app

COPY --from=deps /app/node_modules node_modules
COPY --from=builder /app/dist dist
# ESM として解決させるために "type": "module" が要る
COPY package.json package.json

USER nonroot
# ENTRYPOINT が node なので、渡すのはスクリプトのパスだけでよい。
# .env はイメージに含めず環境変数は Fly.io から注入されるので dotenvx は通さない
CMD ["dist/server.js"]

FROM node:26.5.1-bookworm-slim AS builder

WORKDIR /app
COPY . /app

RUN npm install --ignore-scripts
RUN npm run build

FROM node:26.5.1-bookworm-slim AS app

WORKDIR /app

COPY --from=builder /app/package.json package.json
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/dist dist
CMD ["npm", "start"]
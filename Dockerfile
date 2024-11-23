FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY . /app

RUN npm install
RUN npm run build

FROM node:22-bookworm-slim AS app

WORKDIR /app

COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/dist dist
CMD ["npm", "start"]
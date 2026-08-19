# Gotardo Finanças — imagem de produção (api + web) a partir do monorepo.
# Multi-stage: dependências (com tools de build nativo) → build → runtime.

FROM node:22-alpine AS deps
RUN apk add --no-cache python3 make g++ libtool autoconf automake openssl
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ packages/
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
ENV NODE_ENV=production
WORKDIR /app
COPY . .
RUN pnpm build
ENV NEXT_PUBLIC_API_URL=

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3000
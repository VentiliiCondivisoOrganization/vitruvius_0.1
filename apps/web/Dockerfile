# Web app container.
# Build context = repo root: docker build -f apps/web/Dockerfile -t vitruvius-web .
FROM node:lts-bookworm-slim

# Enable pnpm via corepack.
RUN corepack enable

WORKDIR /app

# Install workspace deps (copy manifests first for layer caching).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm config set store-dir /app/.pnpm-store && pnpm install --frozen-lockfile

# Build the web app and its workspace dependencies.
RUN pnpm --filter @vitruvius/web... build

RUN chown -R node:node /app

USER node

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", "apps/web/build/index.js"]

# Engine worker container.
# Build context = repo root:  docker build -f apps/engine/Dockerfile -t vitruvius-engine .
FROM node:lts-bookworm-slim

# System deps: ffmpeg (packages/media) + the libraries Chromium needs for
# Playwright print-to-PDF (packages/export). Kept minimal but buildable.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
      fonts-liberation \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
      libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
      libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 \
      procps \
  && rm -rf /var/lib/apt/lists/*

# Enable pnpm via corepack.
RUN corepack enable

WORKDIR /app

# Install workspace deps (copy manifests first for better layer caching).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/engine ./apps/engine
RUN pnpm install --frozen-lockfile

# Build the engine and its workspace dependencies.
RUN pnpm --filter @vitruvius/engine... build

# Playwright Chromium is installed in spec 09; the system libs above are already present.
RUN chown -R node:node /app

USER node

# Healthcheck to verify the engine worker process is running.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD pgrep -f "pnpm --filter @vitruvius/engine start" || exit 1

CMD ["pnpm", "--filter", "@vitruvius/engine", "start"]

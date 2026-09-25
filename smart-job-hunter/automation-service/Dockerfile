# =============================================
# Automation Service: Node.js + Playwright
# Multi-stage production build
# =============================================
FROM node:20-slim AS base

# Playwright system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libpango-1.0-0 libasound2 \
    libxshmfence1 fonts-liberation wget ca-certificates \
    dumb-init curl \
    && rm -rf /var/lib/apt/lists/*

# ---------- Build stage ----------
FROM base AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npx tsc

# ---------- Production stage ----------
FROM base AS production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Install Playwright chromium only
RUN npx playwright install chromium --with-deps

# Copy compiled JS
COPY --from=build /app/dist/ ./dist/

# Security: non-root user
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
RUN mkdir -p /app/sessions /app/logs /app/tmp && chown -R appuser:appgroup /app

USER appuser

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Health check endpoint (the service exposes a lightweight HTTP health route)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD curl -f http://localhost:9090/health || exit 1

EXPOSE 9090

ENTRYPOINT ["dumb-init", "node", "dist/index.js"]
CMD ["serve"]

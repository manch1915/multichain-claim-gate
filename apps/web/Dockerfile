# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci --include-workspace-root -w @mcg/core -w @mcg/web
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/web apps/web
ARG NEXT_PUBLIC_REOWN_PROJECT_ID
ARG NEXT_PUBLIC_SITE_URL
# Rewrites are resolved at build time, so the API address is baked into the build.
ARG API_INTERNAL_URL=http://meridian-api:4000
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @mcg/core && npm run build -w @mcg/web

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
COPY --from=build /app/apps/web/public apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

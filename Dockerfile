# The image Render runs (ADR-0006): one build, configured entirely at runtime by NUXT_*
# variables, so staging and production run the same image with different secrets.
#
# Deliberately basic. Phase 6 hardens it with a non-root user, a HEALTHCHECK against
# /api/health and a smaller runtime base.

FROM node:22-slim AS build
WORKDIR /app

# Install scripts are skipped: postinstall runs `nuxt prepare` before the source is copied
# in, and the supabase devDependency would download a CLI binary the image never uses.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

# Nitro's node-server output carries the dependencies it needs, so node_modules stays in
# the build stage.
COPY --from=build /app/.output ./.output

# Nitro listens on PORT, which Render sets; 3000 is only the local default.
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

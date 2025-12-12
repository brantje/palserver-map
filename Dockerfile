##
## Build + runtime image for Nuxt (Nitro node-server output)
##

FROM node:20-alpine AS deps
WORKDIR /app

# Install dependencies (leverages Docker layer caching)
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Nuxt for production (creates .output/)
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

# Copy the built output
COPY --from=build --chown=node:node /app/.output ./.output

USER node
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]



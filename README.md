# Palserver Online Map

A **Nuxt 4** web app that serves an interactive map and exposes a small API layer to:

- Load map objects from `public/data/map_objects.json` (served at `/data/map_objects.json`, used by the frontend map UI).
- Proxy selected **Palworld** server REST endpoints (players/info) so the UI can fetch them from the same origin.

## API

- **`GET /api/palworld/players`**: fetches Palworld players from `http://<host>:<port>/v1/api/players` (basic auth `admin:<password>`).
- **`GET /api/palworld/info`**: fetches Palworld server info from `http://<host>:<port>/v1/api/info` (basic auth `admin:<password>`).

## Configuration (env vars)

This app uses Nuxt runtime config. These environment variables are the ones you’ll typically set:

- **`NITRO_AUTH_SECRET`**: secret used by the server for auth-related logic (set this in production).
- **`NUXT_PALWORLD_HOST`**: Palworld REST API host.
- **`NUXT_PALWORLD_PORT`**: Palworld REST API port (default: `3333`).
- **`NUXT_PALWORLD_PASSWORD`**: Palworld REST API password (**required** for the `/api/palworld/*` routes).

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## Docker

Build and run locally:

```bash
docker build -t palserver-map:local .
docker run --rm -p 3000:3000 \
  -e NITRO_AUTH_SECRET=change-me \
  -e NUXT_PALWORLD_HOST=host.docker.internal \
  -e NUXT_PALWORLD_PORT=3333 \
  -e NUXT_PALWORLD_PASSWORD=your-password \
  palserver-map:local
```

## Docker Compose

Start with:

```bash
docker compose up -d --build
```

Then open `http://localhost:3000`.


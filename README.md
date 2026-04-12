# RV Trip

Database-backed RV itinerary app built with Next.js, Prisma, and PostgreSQL.

## Stack

- Next.js App Router + TypeScript
- Prisma + PostgreSQL
- Leaflet + OpenStreetMap tiles
- Server Actions for admin CRUD
- Cookie-based single-admin auth

## Local Setup

1. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
2. Install dependencies:

```bash
npm install
```

3. Generate the Prisma client and apply schema changes:

```bash
npx prisma db push
```

4. Seed the default admin user and import the itinerary markdown:

```bash
npm run seed
```

5. Start the app:

```bash
npm run dev
```

## Railway Deploy

This app is ready to deploy to Railway with:
- one web service
- one PostgreSQL service
- one persistent Volume mounted at `/app/public/uploads`

### Required Railway Variables

Set these in the Railway app service:
- `DATABASE_URL`
- `AUTH_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

### Recommended Railway Setup

1. Connect the GitHub repo to a Railway project.
2. Add a PostgreSQL service in the same project.
3. Add a Volume and mount it at:

```text
/app/public/uploads
```

This is required because uploaded photos and videos are stored under `public/uploads`.

4. After the first deploy, run these commands against the Railway environment:

```bash
npx prisma db push
npm run seed
npm run prefetch:hotdogs marcellus-trip
npm run recompute:activity-distances -- marcellus-trip
```

5. Generate a Railway public domain first, confirm the app works, then attach your custom domain in Railway Networking.

### Production Runtime

- Next.js is configured with `output: "standalone"` in [`next.config.ts`](/Users/brian/Development/rv-trip/next.config.ts).
- The production start command uses the standalone server from [`package.json`](/Users/brian/Development/rv-trip/package.json).

## Routes

- `/trips/[slug]`: public trip viewer
- `/admin/login`: admin login
- `/admin`: trip list and trip creation
- `/admin/trips/[tripId]`: trip, place, day, and stop editor

## Data Flow

- The initial itinerary lives in [`data/rv-trip-itinerary.md`](/Users/brian/Development/rv-trip/data/rv-trip-itinerary.md).
- `prisma/seed.ts` imports that markdown into Postgres using [`lib/markdown-import.ts`](/Users/brian/Development/rv-trip/lib/markdown-import.ts).
- After import, Postgres is the source of truth.

## Notes

- The admin login is seeded from env vars into the `AdminUser` table.
- The “Re-import seed markdown” admin action is intended for resetting the seeded RV trip content.
- No automated verification is included here until dependencies are installed and Prisma is pointed at a running Postgres database.

# Forge

Shared AI workforce for Korben OS.

## Local development

1. Install dependencies:

   npm install

2. Copy `.env.example` to `.env.local` and fill in your Supabase project values.

3. Apply database migrations:

   supabase db push

4. Start the app:

   npm run dev

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (safe for the browser)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon/publishable key (safe for the browser)
- `SUPABASE_SERVICE_ROLE_KEY` - server-only service role key. Never expose this to the browser.

## Authentication

Forge uses Supabase Auth with cookie-based SSR sessions (`@supabase/ssr`). The
`(protected)` route group is gated by `requireUser()`, so unauthenticated users
are redirected to `/login`. The root middleware refreshes sessions on each
request, which keeps signed-in users authenticated across navigation.

# Water for Laura 💧

A small, friendly hydration tracker that runs as an installable web app on an iPhone and sends gentle reminders during the day, even when the app is closed.

- **Frontend:** Vite + React + TypeScript + Tailwind, deployed to GitHub Pages at https://water.chrisquinn.ie
- **Backend:** Supabase (Postgres, Auth, one Edge Function, pg_cron) sending Web Push with VAPID
- **Tests:** `pnpm test` (hydration maths) and `pnpm test:functions` (reminder logic, Deno)

The design brief lives in [CLAUDE.md](CLAUDE.md); setup and recovery steps in [docs/setup.md](docs/setup.md).

## How a reminder happens

Every five minutes pg_cron calls `send-hydration-reminders`. For each user with reminders on it works out the local time, finds whether a slot such as 11:00 is due, claims that slot exactly once, checks that the day's goal is not met and that no water was logged in the last hour, and then pushes a short message to each registered device.

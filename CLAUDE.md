# Water for Laura — Developer Brief

**Version:** 3.0 (hobby edition)
**Production URL:** https://water.chrisquinn.ie
**Product:** Personal hydration tracker for one person, with cloud persistence and scheduled iPhone push reminders.

## 1. Objective

A polished, mobile-first hydration tracker for Laura. Logging a glass takes one tap. Progress is a single animated water fill. A friendly reminder arrives on her iPhone a few times a day, even when the app is closed, and goes quiet when she has already had a drink or reached her goal.

This is a hobby project. Keep it small: few dependencies, few tables, one scheduled function, light tests on the logic that would fail silently.

## 2. Architecture

| Layer | Technology |
|---|---|
| Frontend | Vite + React + TypeScript |
| Styling | Tailwind CSS v4 only (no component library) |
| Animation | CSS keyframes and transitions |
| Charts | CSS grid bars and heatmap (no charting library) |
| Backend | Supabase: Postgres, Auth, one Edge Function, pg_cron |
| Notifications | Web Push + VAPID, sent from the Edge Function with `jsr:@negrel/webpush` |
| Service worker | vite-plugin-pwa (injectManifest) with a hand-written `src/sw.ts` |
| Offline | localStorage pending-write queue with client-generated UUIDs |
| Hosting | GitHub Pages at water.chrisquinn.ie, deployed by GitHub Actions |

GitHub Pages hosts the frontend only. Supabase holds the data, sends the reminders and runs the schedule.

The frontend never contains the service-role key, the private VAPID key or the cron secret.

### Why Supabase is still here

Reminders that arrive while the app is closed need a server to send Web Push, somewhere to keep the push subscription, and a scheduler. Supabase's free tier gives all three with no server to run. Everything else that Supabase offered in earlier briefs (goal history, delivery logs, three functions, IndexedDB sync) has been cut.

## 3. Design Direction

- Powder blue, aqua and soft lavender on a warm off-white background.
- Rounded cards, large readable type, generous tap targets.
- A fluid water-fill gauge with a gentle wave animation.
- Subtle feedback on each tap, a soft celebration when the goal is reached.
- Greeting by time of day: "Morning Laura ☀️ Ready for your first glass?"
- Three tabs: **Today | History | Settings**. Today is the default.

## 4. Today Screen

- Water gauge showing `1,450 / 2,000 ml`, percent complete and the amount remaining.
- Three quick-add buttons from settings (default 150, 250, 500 ml) plus a custom amount sheet.
- Each tap updates the total immediately, animates the gauge, writes to Supabase, and shows a 6-second undo toast.
- Writes are optimistic. If the write fails or the device is offline the entry goes into a localStorage queue and shows a "will sync" badge until it lands.
- Below the gauge, today's entries can be edited or deleted.
- Opening the app from a notification lands on Today with the quick-add row highlighted.

## 5. Database

Three tables, one migration (`supabase/migrations/`). All user-owned rows have Row Level Security with `auth.uid() = user_id`.

**settings** (one row per user, created by a trigger on sign-up)
`user_id`, `display_name`, `daily_goal_ml`, `quick_adds int[]`, `timezone` (default Europe/Dublin), `reminder_enabled`, `reminder_start`, `reminder_end`, `reminder_interval_minutes`, `suppression_minutes`, `last_reminder_slot`, `updated_at`.

**entries**
`id` (UUID generated on the client so retries upsert instead of duplicating), `user_id`, `amount_ml`, `consumed_at`, `created_at`, `updated_at`.

**push_subscriptions**
`id`, `user_id`, `endpoint` (unique), `p256dh`, `auth`, `device_name`, `enabled`, `created_at`, `last_seen_at`.

A SQL function `claim_reminder_slot(user_id, slot)` atomically records the current slot and returns true exactly once per slot. This replaces a delivery-log table.

## 6. Authentication

Supabase Auth with magic-link email sign-in. Sessions persist, so Laura signs in once per device.

Invite-only is enforced server-side by turning off "Allow new users to sign up" in the Supabase dashboard and inviting Laura from the Users page. No allowlist code.

## 7. Reminders

One Edge Function, `send-hydration-reminders`, invoked every five minutes by pg_cron through pg_net with an `x-cron-secret` header. The same function, called with the user's own JWT and `?test=1`, sends a test notification to that user's devices.

Defaults: 09:00 to 21:00, every 2 hours, Europe/Dublin, suppress for 60 minutes after a drink, stop once the goal is reached, off until Laura opts in. Intervals of 30, 60, 90, 120 and 180 minutes plus a custom value.

For each user with reminders enabled the function:

1. Works out local wall-clock time in the stored IANA zone with `Intl.DateTimeFormat`, which handles daylight saving.
2. Finds the due slot: slots are `start + k × interval` up to `end`; a slot is due if now falls within a short window after it. The slot key is the local date plus `HH:MM`.
3. Claims the slot with `claim_reminder_slot`. If it was already claimed, stops. This makes retries and the repeated hour on the autumn clock change safe.
4. Skips if today's total has reached the goal or if any entry falls inside the suppression window.
5. Sends a Web Push to every enabled subscription, rotating through six friendly messages. Subscriptions that return 404 or 410 are disabled.

Messages: "A little water break? 💧", "Hey Laura, time for a sip.", "Your water bottle misses you.", "A quick glass of water would be lovely.", "You're making good progress today.", "Just a gentle reminder to hydrate."

Tapping a notification opens the installed app on Today. No notification action buttons.

Secrets live in Supabase Edge Function secrets: `VAPID_KEYS` (JWK pair as JSON), `VAPID_SUBJECT`, `CRON_SECRET`. The public key is also built into the client as `VITE_VAPID_PUBLIC_KEY`.

## 8. iPhone Setup

iOS only delivers Web Push to web apps installed on the Home Screen. The Settings tab guides this:

1. If running in Safari on iOS, show the Add to Home Screen steps.
2. Once installed, show an **Enable reminders** button. Permission is requested only on that tap.
3. Subscribe with the public VAPID key and insert the subscription under RLS.
4. Offer **Send test notification** and report what the push service answered. Never claim delivery because the push service accepted the message.

Status shown as one of: Notifications active, Permission required, Notifications disabled, Device unsupported, Needs repair.

## 9. History

Computed client-side from `entries`, bucketed into local days.

- **Week:** seven bars with the goal line, average, days goal met, current streak, best streak.
- **Month:** calendar heatmap, tap a day for its entries, monthly average, completion percentage.

The current goal applies to all history. Historical goals are not preserved; this is a deliberate simplification.

## 10. Settings

Daily goal, three quick-add amounts, reminder toggle, start and end time, interval, suppression minutes, export all data as JSON, delete all data with a two-step confirmation, sign out. All persisted to `settings` and restored on sign-in.

Not included on purpose: unit switching, themes, timezone picker.

## 11. Project Structure

    hydr/
    ├── .github/workflows/deploy.yml
    ├── public/            CNAME, icons/
    ├── src/
    │   ├── main.tsx, App.tsx, index.css, sw.ts
    │   ├── lib/           supabase.ts, hydration.ts (+ tests), queue.ts, push.ts, types.ts
    │   └── features/      auth/, today/, history/, settings/, notifications/
    ├── supabase/
    │   ├── config.toml
    │   ├── migrations/
    │   ├── cron.sql
    │   └── functions/send-hydration-reminders/  index.ts, reminders.ts (+ tests)
    ├── docs/setup.md
    └── README.md

## 12. Deployment

- GitHub Actions builds with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_VAPID_PUBLIC_KEY` from repository variables and deploys to GitHub Pages on every push to `main`.
- Vite base path `/`, `public/CNAME` contains `water.chrisquinn.ie`, DNS CNAME points at `chris-88.github.io`.
- Supabase changes are deployed by hand with the CLI: `supabase db push`, `supabase functions deploy send-hydration-reminders --no-verify-jwt`, `supabase secrets set`, and `supabase/cron.sql` once. See `docs/setup.md`.
- Auth redirect URL `https://water.chrisquinn.ie/` is configured in the Supabase dashboard.

## 13. Testing

Light by design:

- Vitest on `src/lib/hydration.ts`: local-day bucketing across the Dublin clock changes, totals, streaks, month grid.
- Deno tests on `reminders.ts`: due-slot maths across both clock changes, window edges, suppression, goal reached, slot dedup.
- Manual: sign in, log water, reload, install on the iPhone, send a test notification, wait for a scheduled one with the app closed.

No automated RLS or end-to-end tests.

## 14. Definition of Done

- Laura signs in with a magic link and stays signed in.
- The app installs on her iPhone from Safari.
- Water is logged in one tap and survives reload and reinstall.
- Week and month views work.
- Reminder settings persist.
- A scheduled reminder arrives with the app closed, and is skipped after a recent drink or once the goal is met.
- Reminders can be turned off in Settings.
- Pushing to `main` deploys to water.chrisquinn.ie.
- Both test suites pass.

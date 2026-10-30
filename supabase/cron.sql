-- Schedule the reminder function every five minutes.
-- Run once against the hosted project after deploying the function:
--   supabase db query --linked -f supabase/cron.sql
-- Replace PROJECT_REF and CRON_SECRET first (both are kept out of the repo).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('send-hydration-reminders')
 where exists (select 1 from cron.job where jobname = 'send-hydration-reminders');

select cron.schedule(
  'send-hydration-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/send-hydration-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'CRON_SECRET'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

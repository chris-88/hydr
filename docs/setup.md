# Setup

Everything needed to stand the app up from scratch, or to recover it later.
Secrets generated during setup live outside the repo in `~/.config/water-for-laura/`.

## 1. Supabase project

1. Create a project (free tier) in the Supabase dashboard or with the CLI:
   `supabase projects create water --org-id <org> --region eu-west-2 --db-password "$(cat ~/.config/water-for-laura/db-password)"`
2. Link and push the schema:
   ```sh
   supabase link --project-ref <ref>
   supabase db push
   ```
3. **Auth → Providers → Email**: leave Email enabled, turn **off** "Confirm email" is fine either way, and in **Auth → Settings** turn **off** "Allow new users to sign up". This is what makes the app invite-only.
4. **Auth → Users → Invite user**: invite Laura's email (and yours for testing).
5. **Auth → URL Configuration**: Site URL `https://water.chrisquinn.ie`, and add `https://water.chrisquinn.ie/**` plus `http://localhost:5173/**` to Redirect URLs.
6. **Auth → Email Templates → Magic Link**: include the one-time code so the installed app can sign in without leaving it. Add a line such as:
   `<p>Your code: <strong>{{ .Token }}</strong></p>`
   The link `{{ .ConfirmationURL }}` can stay for Safari users.

## 2. Edge Function and secrets

VAPID keys were generated into `~/.config/water-for-laura/vapid.json` (JWK pair plus the raw public key). Regenerate with:

```sh
node -e 'const {webcrypto:c}=require("node:crypto");(async()=>{const k=await c.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);const pub=await c.subtle.exportKey("jwk",k.publicKey),priv=await c.subtle.exportKey("jwk",k.privateKey),raw=Buffer.from(await c.subtle.exportKey("raw",k.publicKey));console.log(JSON.stringify({publicKey:pub,privateKey:priv,publicKeyBase64Url:raw.toString("base64url")}))})()'
```

Set the secrets and deploy:

```sh
CRON_SECRET=$(openssl rand -hex 32); echo "$CRON_SECRET" > ~/.config/water-for-laura/cron-secret
supabase secrets set \
  VAPID_KEYS="$(node -e 'const k=require(process.env.HOME+"/.config/water-for-laura/vapid.json");console.log(JSON.stringify({publicKey:k.publicKey,privateKey:k.privateKey}))')" \
  VAPID_SUBJECT="mailto:you@example.com" \
  CRON_SECRET="$CRON_SECRET" \
  APP_URL="https://water.chrisquinn.ie/"
supabase functions deploy send-hydration-reminders --no-verify-jwt
```

`--no-verify-jwt` is required because pg_cron calls the function with a shared secret header rather than a user token. The function rejects anything that has neither a valid secret nor a valid user JWT.

## 3. Schedule

Edit `supabase/cron.sql`, replacing `PROJECT_REF` and `CRON_SECRET`, then run it once:

```sh
sed -e "s/PROJECT_REF/<ref>/" -e "s/CRON_SECRET/$(cat ~/.config/water-for-laura/cron-secret)/" supabase/cron.sql \
  | supabase db query --linked -f /dev/stdin
```

Check it is running: `select * from cron.job_run_details order by start_time desc limit 5;` in the SQL editor.

## 4. GitHub Pages

Repository variables (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the project's anon / publishable key |
| `VITE_VAPID_PUBLIC_KEY` | `publicKeyBase64Url` from `vapid.json` |

Pages: Settings → Pages → Source **GitHub Actions**, custom domain `water.chrisquinn.ie`, Enforce HTTPS once DNS resolves.

DNS: `CNAME water.chrisquinn.ie → chris-88.github.io`.

## 5. Local development

```sh
cp .env.example .env   # fill in the hosted project's URL, anon key and VAPID public key
pnpm install
pnpm dev
pnpm test              # hydration maths
pnpm test:functions    # reminder logic (needs Deno)
```

## 6. iPhone

1. Open https://water.chrisquinn.ie in Safari, sign in with the emailed code.
2. Share → Add to Home Screen.
3. Open **Water** from the Home Screen → Settings → Enable reminders on this device.
4. Send test notification. Then switch the reminder schedule on.

Reminders arrive only while the phone is online and iOS chooses to deliver them; Focus modes and Low Power Mode can delay them.

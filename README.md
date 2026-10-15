# Lista

Shared grocery list for two phones. No accounts: whoever has the link can see and edit the list. Works offline and syncs when the connection comes back.

## 1. Create the database (Supabase, ~5 min)

1. Go to supabase.com → **New project**. Name it `lista`, pick the **Frankfurt (eu-central-1)** region, set any database password.
2. When it's ready, open **SQL Editor → New query**.
3. Paste all of `supabase/1-schema.sql` and click **Run**.
4. New query again: paste all of `supabase/2-seed.sql` and click **Run**. This loads your 86 catalog items and the three cards.
5. Open **Project Settings → API** and copy two values:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (a long text starting with `eyJ…`)

## 2. Connect the app

Open `config.js` and paste the two values between the quotes:

```js
window.LISTA_CONFIG = {
  supabaseUrl: "https://abcd1234.supabase.co",
  supabaseAnonKey: "eyJ..."
};
```

## 3. Put it online (Vercel)

Either way works:

- **From the terminal:** in this folder run `npx vercel --prod` and accept the defaults. Use a project name nobody would guess, e.g. `lista-rv7k`.
- **From GitHub:** push this folder to a private repo, then in Vercel choose **Add New → Project**, import the repo, keep the defaults (no build command, no framework) and deploy.

## 4. On both iPhones

Open the Vercel link in **Safari** → Share button → **Add to Home Screen**. Send the same link to your wife.

## Good to know

- The link is the key. Anyone who has it can edit the list, so share it only between the two of you.
- The anon key in `config.js` is meant to be public; it only allows access to these two tables.
- To change the app later, edit the files and deploy again; both phones pick up the new version the next time they open it.

## Notifications (when the other person adds items)

One-time setup:

1. **Supabase → SQL Editor:** run `supabase/4-notifications.sql`.
2. **Vercel → your project → Settings → Environment Variables:** add `VAPID_PRIVATE_KEY` with the private key (kept only there, never in the code). Then **Deployments → ⋯ on the latest → Redeploy**.
3. **On each iPhone:** open Lista from the home-screen icon (not from Safari), tap the bell at the top right, type your name, tap **Ativar notificações** and allow.

Finishing a trip also notifies the other phone ("Rodrigo finalizou a compra: 12 itens comprados. Em falta: Pão"). Adds are grouped: the other phone gets one notification a few seconds after you stop adding, or as soon as you leave the app. You never get notified about your own adds.

If the private key is ever lost, generate a new key pair, put the public one in `config.js` and `api/notify.js`, the private one in Vercel, and turn notifications on again on each phone.

## Aisle order

Run `supabase/5-aisles.sql` once. Then in the app: **Ordem dos corredores** (bottom of the Lista or Catálogo), drag the categories, **Salvar**. Both phones use the same order.

## Siri ("Adicionar na Lista")

`api/add.js` adds items by name: POST JSON `{"item": "leite e pão", "by": "Rodrigo"}` to `https://lista-rs47.vercel.app/api/add`. It reuses catalog items (ignoring accents and a final "s"), creates new ones with a category, notifies the other phone, and replies with a sentence for Siri to read.

Shortcut (Shortcuts app → +):
1. **Ask for Input** — Text, prompt "O que adicionar?"
2. **Get Contents of URL** — the URL above; Method **POST**; Request Body **JSON**; fields `item` = *Provided Input*, `by` = your name (exactly as typed in the bell settings).
3. **Show Result** — *Contents of URL*.
Name it "Adicionar na Lista".

# Restaurant platform

A mobile-first restaurant site with online ordering (delivery and pickup), PayPal payments, live order tracking, table reservations with an optional PayPal deposit, and an owner dashboard that works from a phone.

**Stack:** React 19, TypeScript, Vite, React Router, Supabase (Postgres, Auth, Realtime, Edge Functions), PayPal (`@paypal/react-paypal-js` in the browser, PayPal REST API inside Edge Functions), `date-fns`, `lucide-react`.

The brand name, contact details, hours, currency, delivery rules and deposit all come from the database (`restaurant_settings`, `business_hours`). Nothing about the restaurant is hard-coded.

---

## Contents

1. [How it fits together](#1-how-it-fits-together)
2. [Set up the database](#2-set-up-the-database)
3. [Create your admin user](#3-create-your-admin-user)
4. [Environment variables](#4-environment-variables)
5. [PayPal sandbox setup](#5-paypal-sandbox-setup)
6. [Deploy the Edge Functions](#6-deploy-the-edge-functions)
7. [Run the site](#7-run-the-site)
8. [Test with a PayPal sandbox buyer](#8-test-with-a-paypal-sandbox-buyer)
9. [Going live](#9-going-live)
10. [Project layout](#10-project-layout)
11. [Security model](#11-security-model)
12. [Where to extend it](#12-where-to-extend-it)
13. [Known limits](#13-known-limits)

---

## 1. How it fits together

```
Browser (React) ──reads──────────────► Supabase Postgres (RLS)   menu, tables, hours, own orders
   │
   ├─ "I want these dishes / this table" ─► Edge Function  create-checkout ──► inserts order/reservation
   │                                                                          creates the PayPal order
   ├─ PayPal buttons (popup, approve)                                          (prices computed server-side)
   │
   └─ "PayPal approved this id" ─────────► Edge Function  capture-checkout ──► captures, verifies amount,
                                                                              then marks paid / confirmed
```

* The browser never sends a price and never writes to `orders`, `order_items`, `payments` or `reservations`. Only the Edge Functions do, with the service role, after validating everything.
* The PayPal **secret** exists only in Supabase Edge Function secrets. The PayPal **client id** is public and lives in the frontend.
* `supabase/functions/_shared/rules.ts` holds the pure business rules (slot generation, overlap, delivery postcodes, restaurant-timezone maths). The browser uses it to *offer* slots; the functions use the same file to *enforce* them, so the two cannot disagree.

## 2. Set up the database

The schema is already live in your Supabase project, and this app builds on it without renaming or adding anything. Nothing here runs SQL for you. For reference (and for setting up a fresh project) the scripts run in the Supabase **SQL Editor** in this order:

1. Your original tables script (7 tables, starter data, basic RLS).
2. `01_schema.sql`: additive columns, `profiles`, `orders`, `order_items`, `payments`, RLS policies, helper functions, triggers, realtime.
3. `04_fixes_after_first_setup.sql`: security fixes and data rules (removes the "Anyone can create reservations" policy).
4. `02_seed.sql`: optional starter data.
5. `03_make_admin.sql`: makes one account an admin (see the next step).

> The copies of these files were not present in the folder this project was generated in. Put them in `/supabase` if you want them alongside the code.

If you find something missing from the schema, add it with SQL rather than changing the app. The app deliberately never alters the schema.

## 3. Create your admin user

1. Supabase dashboard → **Authentication → Users → Add user**. Enter an email and password and tick **Auto Confirm User**.
2. Make that user an admin, either with `03_make_admin.sql`, or by running:

   ```sql
   insert into admin_users (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

3. Sign in at **`/admin/login`**. Admin access is checked against `admin_users.user_id = auth.uid()`, never by email. Anyone else who signs in sees *"You are signed in, but you are not authorized as an admin."*

The admin has no `profiles` row if the account was created before the signup trigger existed. The app creates it automatically the first time they sign in.

## 4. Environment variables

Create `.env.local` (a template is committed as `.env.example`):

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
VITE_PAYPAL_CLIENT_ID=YOUR_PAYPAL_CLIENT_ID
```

* Supabase: **Project Settings → API** for the URL and the publishable (anon) key.
* PayPal: the **client id** only. Never put the secret here.
* If any value is missing or still says `PASTE_YOUR_…`, the app shows a setup screen instead of a blank page.

## 5. PayPal sandbox setup

1. Go to <https://developer.paypal.com/dashboard/applications/sandbox> and create an app (or use *Default Application*).
2. Copy its **Client ID** into `VITE_PAYPAL_CLIENT_ID`, and note the **Secret** for step 6.
3. **Testing tools → Sandbox accounts**: PayPal creates a *Business* (merchant) and a *Personal* (buyer) test account. Note the buyer's email and password.
4. Choose your currency in **Dashboard → Restaurant Settings**. PayPal must support it (USD, EUR, GBP, CAD, AUD and others are fine).

## 6. Deploy the Edge Functions

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from the project folder:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Set the PayPal secrets (these never appear in the frontend or in git):

```bash
supabase secrets set PAYPAL_CLIENT_ID=your_sandbox_client_id PAYPAL_CLIENT_SECRET=your_sandbox_secret PAYPAL_ENV=sandbox
```

Deploy both functions:

```bash
supabase functions deploy create-checkout capture-checkout --no-verify-jwt
```

`--no-verify-jwt` (also set in `supabase/config.toml`) is required: guests may reserve a table without an account, and the browser sends your publishable key (not a user JWT) when nobody is signed in. Each function checks the user's token itself, and `create-checkout` refuses order requests without a valid signed-in user.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions automatically.

## 7. Run the site

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # TypeScript
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build locally
```

## 8. Test with a PayPal sandbox buyer

**Order flow**

1. Open the site → **Create account** (sign-up needs name, phone, email, password. If Supabase requires email confirmation, the app tells the guest to check their inbox).
2. Add dishes (use the item sheet for notes such as "medium-rare"), open the cart, choose Delivery or Pickup, and check out.
3. For delivery, use a postcode listed in **Restaurant Settings → Delivery postcodes** (blank means "deliver anywhere"). A postcode outside the list offers a one-tap switch to Pickup.
4. Pay with the sandbox **buyer** account. You land on `/order/:id` with a success animation.
5. In another window, sign in at `/admin/login`. The order appears instantly with a chime (tap **Sound off/on** once to allow audio) and a "New order" highlight.
6. **Accept order**, choose a preparation time, and watch the customer page update live with a countdown. Step it through Preparing → Ready → Out for delivery → Completed, and try **Adjust time**.

**Reservation with a deposit**

1. Set **Deposit per guest** above 0 in Restaurant Settings.
2. `/reserve`: choose party size, date and time, enter details, and pay the deposit with the sandbox buyer.
3. The reservation is confirmed and can be added to a calendar (`.ics`). In the dashboard it shows as paid. Confirm, complete or cancel it there.
4. With deposit set to 0, the same flow ends with **Confirm reservation** and no payment.

**Things worth checking**

* Block a date (**Blocked Dates**), close a weekday (**Business Hours**), or deactivate a table (**Restaurant Tables**). Each removes availability immediately.
* Start a deposit reservation, then wait more than 15 minutes before approving the PayPal popup. The hold expires; on capture the server tries to bring the reservation back (same table, then any other free table). If the table is gone, the guest is told, and the payment appears on **Payments** as **Needs refund**.
* Decline or cancel a paid order. The dashboard reminds you to refund it in PayPal, and it appears as **Needs refund** until you mark it refunded.

## 9. Going live

1. In the PayPal dashboard, switch to **Live** and create live app credentials.
2. `supabase secrets set PAYPAL_CLIENT_ID=live_id PAYPAL_CLIENT_SECRET=live_secret PAYPAL_ENV=live`, then redeploy the functions.
3. Set `VITE_PAYPAL_CLIENT_ID` to the **live** client id in your host's environment settings.
4. Build and host the `dist/` folder on any static host. Single-page-app rewrites are included for Netlify (`public/_redirects`) and Vercel (`vercel.json`). Every path must serve `index.html`.
5. Supabase → **Authentication → URL Configuration**: set the Site URL and redirect URLs to your live address, and check your email-confirmation settings and SMTP sender.
6. Optional: replace `'*'` in `supabase/functions/_shared/cors.ts` with your site's origin.
7. Optional: add real Open Graph tags to `index.html`. The page title and description are set at runtime from your settings, but link previews read the static HTML.
8. Run one small live order and one live deposit as a final check.

## 10. Project layout

```
src/
  lib/          supabase client, types, env check, slot generation, formatting, images.ts, brand.ts, api.ts
  context/      Auth, Cart, Settings, Toast
  hooks/        useAsync, useMenuItems, useAddToCart, useDocumentMeta
  components/   public UI (top bar, bottom nav, hero, dish cards, sheets, PayPal wrapper, ...)
  pages/        Home, Menu, Cart, Checkout, Login, Account, OrderTracking, Reserve, More, NotFound
  pages/admin/  Overview, Orders, Payments, Reservations, Tables, MenuItems, BusinessHours, BlockedDates, Settings
  styles/       tokens.css, base.css, public.css, admin.css
supabase/
  config.toml                 function settings (JWT checked inside the functions)
  functions/_shared/          rules (pure), booking, paypal, delivery, cors, http, clients, notify, types
  functions/create-checkout/  order and reservation creation
  functions/capture-checkout/ capture, verification, confirmation
```

**Editing content**

* All photography: `src/lib/images.ts` (Unsplash photo ids plus per-category fallbacks).
* Marketing wording (hero slides, About text, "How ordering works"): `src/lib/brand.ts`. The restaurant *name* is never in there.
* Colours and spacing: the tokens at the top of `src/styles/tokens.css`.

## 11. Security model

* **RLS is the real enforcement.** Hiding buttons is only cosmetic. Public visitors read active menu items, tables, hours, blocked dates and settings. Customers read only their own orders and reservations. Only admins read payments or change order status.
* **No browser writes for money.** Orders, order items, payments and reservations are inserted only by Edge Functions using the service role.
* **Server-side pricing.** Item prices, the delivery fee and the total are computed from the database. Inactive or zero-price items are rejected. Ordering, delivery and pickup switches, the minimum order and the delivery postcode rule are enforced on the server.
* **Reservations are re-validated** against opening hours, blocked dates, notice hours, party size, slot alignment, active tables and overlaps. A database trigger (`TABLE_ALREADY_BOOKED`) is the last line of defence against double booking, even under race conditions.
* **Capture is verified and idempotent.** The capture must be `COMPLETED` with the exact stored amount and currency. A repeated call reports the existing result and never double-processes. Concurrent calls race for a single "claim" update.
* **Late payments never vanish.** If a paid reservation's hold expired and the table is gone, or if an order was cancelled before the payment landed, the payment stays `completed` and shows as **Needs refund**.

## 12. Where to extend it

| Later feature | Where it slots in |
| --- | --- |
| Distance-based delivery fees | `calculateDeliveryFee()` in `supabase/functions/_shared/delivery.ts`. Every total already flows through it. |
| Confirmation emails (Resend, etc.) | `sendConfirmationEmail()` in `supabase/functions/_shared/notify.ts`, called by `capture-checkout`. |
| Automatic PayPal refunds | Add a `refund-payment` function that calls PayPal's refund API and updates the order/reservation. The **Needs refund** buttons already mark the state. |
| Promo codes | Apply the discount in `create-checkout/order.ts` before `totalCents`. |
| Driver assignment, loyalty, kitchen tickets, multi-language | The order card in `pages/admin/Orders.tsx` and the status flow in `lib/orderStatus.ts` are the natural starting points. |

## 13. Known limits

* **Refunds are manual.** The dashboard tells you when one is needed; you issue it in PayPal, then click **Mark refunded**.
* **PayPal pending captures.** If PayPal holds a capture for review, the payment stays "not completed" and nothing is confirmed. Finishing that automatically needs a PayPal webhook, which is not included.
* **Abandoned checkouts.** Closing the PayPal popup leaves a `pending_payment` order or an unpaid reservation hold. Holds expire after 15 minutes. Unpaid orders are visible under **Orders → Unpaid** and are hidden from customers after 30 minutes.
* **Postcode rules are prefix matches.** `SW1` also matches `SW10…`. List longer prefixes (`SW1A`) when that matters.
* **Currencies** are assumed to have two decimal places.
* **No rate limiting** on the Edge Functions beyond Supabase's platform limits. Add limits before opening to heavy public traffic.
* Link previews (WhatsApp, iMessage) read the static `index.html`, so they show a generic title until you add your own tags there.

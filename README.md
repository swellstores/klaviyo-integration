# Klaviyo integration

A Swell app that sends store events to [Klaviyo](https://www.klaviyo.com/) and subscribes customers who opted in to email or SMS marketing.
It replicates the native Swell Klaviyo integration, so you can use it as is or adapt it to your needs.

## Features

### Event tracking

The app listens to Swell model events and sends them to the Klaviyo [Client Events API](https://developers.klaviyo.com/en/reference/create_client_event):

| Swell event       | Klaviyo metric       | Function                    | Setting                    |
| ----------------- | -------------------- | --------------------------- | -------------------------- |
| `cart.created`    | Checkout Started     | `functions/cart-events.ts`  | `event_checkout_started`   |
| `cart.abandoned`  | Abandoned Checkout   | `functions/cart-events.ts`  | `event_checkout_abandoned` |
| `order.submitted` | Order Submitted      | `functions/order-events.ts` | `event_order_submitted`    |
| `order.delivered` | Order Fulfilled      | `functions/order-events.ts` | `event_order_fulfilled`    |
| `order.canceled`  | Order Canceled       | `functions/order-events.ts` | `event_order_canceled`     |

Each event includes:

- **Value** – the record `grand_total` and `currency`.
- **Profile** – email, name, phone and shipping location of the linked customer account.
  If no account is linked, an anonymous profile is used (`checkout-<checkout_id>` for carts, `record-<id>` otherwise).
- **Properties** – the full cart/order record, its items mapped to a flat format
  (`id`, `price`, `price_total`, `discount_total`, `tax_total`, `product_slug`, `product_name`, `product_sku`, `product_image_url`, `quantity`)
  and `items_product_slugs`.
- **Unique ID** – `<metric-name>-<record id>`. Klaviyo records only the first event with the same `unique_id` for the same profile and metric,
  so repeated deliveries are ignored.

Phone numbers are normalized to E.164 using the shipping country (`functions/lib/phone.ts`).
If Klaviyo rejects an event because of the phone number, the event is resent once without it.

### List subscription

After tracking an event for a customer with an account, the app subscribes the profile to a Klaviyo list based on the account's opt-ins:

- `email_optin: true` → email marketing consent, subscribed to **Email List ID**.
- `sms_optin: true` and **Enable SMS Marketing** is on and the account has a valid phone → SMS marketing and transactional consent,
  subscribed to **SMS List ID** (or **Email List ID** when SMS List ID is empty).
- Both opt-ins with a separate SMS list → one call per list: email consent to **Email List ID**, SMS consent to **SMS List ID**.
- No opt-in → no subscription call.

## Settings

All credentials and options are configured by the merchant in the app settings (`settings/klaviyo.json`) and are never stored in code.

| Setting                    | Type    | Required | Default | Description                                                                 |
| -------------------------- | ------- | -------- | ------- | --------------------------------------------------------------------------- |
| `public_api_key`           | text    | yes      |         | Klaviyo Public API Key (Site ID). Used to send events.                      |
| `private_api_key`          | text    | yes      |         | Klaviyo Private API Key. Used to look up profiles and subscribe them.       |
| `list_id`                  | text    | yes      |         | List for customers who opt in to email marketing.                           |
| `enable_sms`               | toggle  | no       | off     | Subscribe customers to SMS marketing when they opt in.                      |
| `sms_list_id`              | text    | no       |         | Separate list for SMS subscribers. Empty → `list_id` is used.               |
| `event_checkout_started`   | toggle  | no       | on      | Send "Checkout Started".                                                    |
| `event_checkout_abandoned` | toggle  | no       | on      | Send "Abandoned Checkout".                                                  |
| `event_order_submitted`    | toggle  | no       | on      | Send "Order Submitted".                                                     |
| `event_order_fulfilled`    | toggle  | no       | on      | Send "Order Fulfilled".                                                     |
| `event_order_canceled`     | toggle  | no       | on      | Send "Order Canceled".                                                      |

If any of the three required settings is missing, functions log an error and send nothing.

The private API key needs read/write access to **Profiles**, **Lists** and **Subscriptions** in Klaviyo.

## Setup

1. Install the Swell CLI and log in:

   ```bash
   npm install -g @swell/cli
   swell login
   ```

2. Clone this repository and install dependencies:

   ```bash
   cd /path/to/klaviyo-integration
   npm install
   ```

3. Push the app to your store's test environment:

   ```bash
   swell app push
   ```

4. In the Swell dashboard open **Apps → Klaviyo → Settings** and fill in the API keys and list IDs
   (Klaviyo → Account → Settings → API Keys; list IDs are under Audience → Lists & Segments → list settings).
5. **Disable the native Klaviyo integration** in Swell (Settings → Integrations), otherwise every event is sent twice.
6. To install in the live environment, create a version and install it:

   ```bash
   swell app version minor
   swell app install
   ```

## Limits and known behavior

- **Duplicate events** if the native Swell Klaviyo integration is enabled at the same time.
- **Subscription delay** – subscribing waits 2 seconds so Klaviyo can create the profile from the event before it is looked up.
  Combined with the API calls, this uses part of the 10 s function timeout.
- **Subscriptions require an account** – guest carts/orders without a linked account are tracked anonymously and never subscribed.
- **No retries** – failed Klaviyo calls are logged (`console.error`) and dropped; there is no queue or backfill of past records.
  The only retry is resending an event without a rejected phone number.
- **One event per metric per record** – because the unique ID is built from the cart/order ID, a metric is recorded once per cart or order for a profile.
  For example, a cart abandoned a second time does not create a second "Abandoned Checkout". If the profile differs between deliveries
  (e.g. a guest cart later linked to an account), Klaviyo treats it as a new event.
- **Checkout Started** fires on `cart.created`, i.e. when the cart record is first created, not on a later checkout step.
- **Single list** – one email list and optionally one SMS list; per-product or per-segment lists are not supported.
- Klaviyo API revision is pinned to `2024-02-15` (`functions/lib/klaviyo.ts`).

## Development

### Project layout

```
functions/
  cart-events.ts      # cart.created, cart.abandoned → Klaviyo
  order-events.ts     # order.submitted, order.delivered, order.canceled → Klaviyo
  lib/klaviyo.ts      # event mapping, Klaviyo API calls, list subscription
  lib/phone.ts        # E.164 phone formatting
settings/klaviyo.json # merchant settings
assets/icon.png       # app icon
assets/image.png      # social card (1200×630)
assets/images/        # App Store listing images (referenced by `images` in swell.json)
test/unit/            # vitest unit tests (Klaviyo API mocked)
test/integration/     # vitest tests against the store using CLI auth
```

### Commands

```bash
npm run typecheck   # TypeScript check for functions and tests
npm test            # run all vitest tests
swell app dev       # run functions locally, triggered by the test environment
swell app push      # deploy to the test environment
swell logs -f --app klaviyo   # follow function logs
swell inspect functions --app=.   # check deployed functions and failures
```

Tests run in the Cloudflare Workers runtime via `@cloudflare/vitest-pool-workers`, and use your `swell login` session
(or `SWELL_STORE_ID` / `SWELL_SESSION_ID` environment variables in CI). Unit tests mock `fetch`, so no real Klaviyo calls are made.

### Adding an event

1. Add the Swell event to `config.model.events` in the relevant function.
2. Map it to a Klaviyo metric name and setting key in `getEventNameAndSetting` (`functions/lib/klaviyo.ts`).
3. Add a toggle for it in `settings/klaviyo.json`.
4. Add tests and update the tables in this README.

Logs are also available in the dashboard under **Developer → Console → Logs**.

## Contributing

Contributions are welcome! Visit the [Swell Discord](https://discord.gg/VakSbyjDGZ) or [GitHub discussions](https://github.com/orgs/swellstores/discussions/) to get help and share ideas.

## License

This project is licensed under the MIT License - see [LICENSE.md](LICENSE.md) file for details.

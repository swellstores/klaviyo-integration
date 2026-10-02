# Klaviyo

Send store events to Klaviyo and subscribe customers who opt in to email or SMS marketing.

## How it works

1. **Listens to store events.** Cart and order events trigger the app:

   | Store event       | Klaviyo metric     |
   | ----------------- | ------------------ |
   | `cart.created`    | Checkout Started   |
   | `cart.abandoned`  | Abandoned Checkout |
   | `order.submitted` | Order Submitted    |
   | `order.delivered` | Order Fulfilled    |
   | `order.canceled`  | Order Canceled     |

   Each event can be turned on or off in the app settings.

2. **Sends the event to Klaviyo.** The app loads the cart or order with its items and sends it with:
   - the order value and currency;
   - the customer profile: email, name, phone (E.164) and shipping location, or an anonymous profile for guests;
   - the items with product name, SKU, image, price, discount, tax and quantity.

   Each event is sent with an ID made of the metric name and the cart or order ID. Klaviyo records only the first event with the same ID for the same profile, so repeated deliveries are ignored and each metric is recorded once per cart or order.

3. **Subscribes opted-in customers.** For customers with an account:
   - email opt-in → subscribed to the email list;
   - SMS opt-in (when SMS marketing is enabled and a valid phone exists) → subscribed to the SMS list, or to the email list when no SMS list is set.

   Customers who did not opt in are not subscribed.

## Setup

Enter your Klaviyo Public API Key, Private API Key and Email List ID in the app settings. Optionally enable SMS marketing and set an SMS list. Disable the native Klaviyo integration to avoid sending events twice.

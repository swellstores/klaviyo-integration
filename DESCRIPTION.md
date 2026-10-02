Send your store's checkout and order events to Klaviyo, and subscribe customers who opt in to email or SMS marketing. Each event arrives in Klaviyo as a metric, like Order Submitted, with the order value, the items and the customer's profile, ready to trigger your flows.

Connect your Klaviyo account with its API keys, choose the list for customers who opt in, and pick the events to send. From then on, each event is sent to Klaviyo when it happens in your store.

- **Five store events.** Checkout Started when a cart is created, Abandoned Checkout when a cart is abandoned, Order Submitted when an order is placed, Order Fulfilled when it's delivered, and Order Canceled. Each has its own switch.
- **Customer profiles.** Events for a customer's account carry their email, name, phone number and shipping address, so they land on the right Klaviyo profile. Carts that aren't linked to a customer yet are tracked with an anonymous ID.
- **Order details for your emails.** Each event includes the cart or order total and currency, and every item with its name, SKU, image, price, discount, tax and quantity.
- **Email and SMS opt-ins.** Customers who accept email or SMS marketing are subscribed in Klaviyo and added to the list you choose. SMS subscriptions are optional and need a valid phone number.
- **Counted once.** Each metric is recorded once per cart or order, so a repeated delivery doesn't create a duplicate event.

**Replaces the built-in integration.** The app sends the same metric names and properties as Swell's built-in Klaviyo integration, so flows built on them keep working when you switch. If the built-in integration is on when you install the app, Swell offers to turn it off so events aren't sent twice.

Setup takes a few minutes. In Klaviyo, open Settings → API keys, copy your public API key (Site ID) and create a private API key with full access to Lists, Profiles and Subscriptions. Paste both keys and your list ID in the app settings and save. Then place a test order and look for Order Submitted on the customer's Klaviyo profile.

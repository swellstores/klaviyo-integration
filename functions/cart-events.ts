import { trackKlaviyoEvent } from './lib/klaviyo';

export const config: SwellConfig = {
  description: 'Track cart checkout events in Klaviyo',
  model: {
    events: ['cart.created', 'cart.abandoned'],
  },
};

export default async function (req: SwellRequest) {
  const { swell, data } = req;
  const event = data.$event;

  const settings = await swell.settings();
  const appSettings = settings?.klaviyo as any;
  
  const cart = await swell.get('/carts/{id}', {
    id: data.id,
    expand: ['account', 'items.product', 'items.variant'],
  });

  if (!cart) {
    console.error(`Klaviyo: cart ${data.id} not found`);
    return;
  }

  await trackKlaviyoEvent(event?.type, data.id, cart, appSettings);
}

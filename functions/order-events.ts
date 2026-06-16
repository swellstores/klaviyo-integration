import { trackKlaviyoEvent } from './lib/klaviyo';

export const config: SwellConfig = {
  description: 'Track order lifecycle events in Klaviyo',
  model: {
    events: ['order.submitted', 'order.delivered', 'order.canceled'],
  },
};

export default async function (req: SwellRequest) {
  const { swell, data } = req;
  const event = data.$event;

  const settings = await swell.settings();
  const appSettings = settings?.klaviyo as any;
  
  const order = await swell.get('/orders/{id}', {
    id: data.id,
    expand: ['account', 'items.product', 'items.variant'],
  });

  if (!order) {
    console.error(`Klaviyo: order ${data.id} not found`);
    return;
  }

  await trackKlaviyoEvent(event?.type, data.id, order, appSettings);
}

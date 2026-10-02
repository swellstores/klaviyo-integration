import { formatPhone } from './phone';

const API_BASE = 'https://a.klaviyo.com';
const REVISION = '2024-02-15';

interface MappedItem {
  id: string;
  price: number;
  price_total: number;
  discount_total: number;
  tax_total: number;
  product_slug: string | undefined;
  product_name: string | undefined;
  product_sku: string | undefined;
  product_image_url: string | undefined;
  quantity: number;
}

// map items to Klaviyo format
export function buildMappedItems(items: any[]): MappedItem[] {
  if (!items?.length) {
    return [];
  }

  return items.map((item) => ({
    id: item.id,
    price: item.price,
    price_total: item.price_total,
    discount_total: item.discount_total,
    tax_total: item.tax_total,
    product_slug: item.product?.slug,
    product_name: item.product?.name,
    product_sku: item.variant?.sku ?? item.product?.sku,
    product_image_url:
      item.variant?.images?.[0]?.file?.url ?? item.product?.images?.[0]?.file?.url,
    quantity: item.quantity,
  }));
}

// prepare Klaviyo event
export function buildEventProps(
  eventName: string,
  eventId: string,
  record: any,
  phoneNumber: string | null | undefined,
): object {
  const mappedItems = buildMappedItems(record.items ?? []);

  const profileAttributes = record.account?.email
    ? {
        email: record.account.email,
        phone_number: phoneNumber,
        first_name: record.account.first_name,
        last_name: record.account.last_name,
        location: {
          city: record.account.shipping?.city,
          region: record.account.shipping?.state,
          country: record.account.shipping?.country,
          zip: record.account.shipping?.zip,
          address1: record.account.shipping?.address1,
          address2: record.account.shipping?.address2,
        },
      }
    : {
        // Klaviyo anonymous tracking when no account is linked:
        // checkout_id (for carts) or id (for orders) as anonymous id
        anonymous_id: record.checkout_id
          ? `checkout-${record.checkout_id}`
          : `record-${record.id}`,
      };

  return {
    type: 'event',
    attributes: {
      // unique event id
      unique_id: `${eventName.toLowerCase().replace(/\s+/g, '-')}-${eventId}`,
      // order value and its currency
      value: record.grand_total,
      value_currency: record.currency,
      // event name
      metric: {
        data: { type: 'metric', attributes: { name: eventName } },
      },
      // user profile details
      profile: {
        data: { type: 'profile', attributes: profileAttributes },
      },
      // additional properties: order, its mappedItems and slugs
      properties: {
        ...record,
        items: mappedItems,
        items_product_slugs: mappedItems.map((item) => item.product_slug),
      },
    },
  };
}

// send Klaviyo event
export async function track(
  publicApiKey: string,
  eventProps: object,
  retryWithoutPhone = false,
): Promise<void> {
  const url = `${API_BASE}/client/events/?company_id=${publicApiKey}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        revision: REVISION,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ data: eventProps }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status}: ${body}`);
    }

    const name = (eventProps as any).attributes?.metric?.data?.attributes?.name;
    console.log(`Klaviyo: tracked "${name}"`);
  } catch (err) {
    const props = eventProps as any;
    if (retryWithoutPhone || !props?.attributes?.profile?.data?.attributes?.phone_number) {
      console.error('Klaviyo track error:', err);
      return;
    }
    // Known issue: Klaviyo rejects some phone numbers - retry the same event without phone
    delete props.attributes.profile.data.attributes.phone_number;
    await track(publicApiKey, props, true);
  }
}

// subscribe email and phone
export async function subscribeToList(
  privateApiKey: string,
  email: string,
  phoneNumber: string | null | undefined,
  listId: string,
  emailOptin: boolean | null,
  smsOptin: boolean | null,
  enableSms: boolean,
  smsListId: string | null | undefined,
): Promise<void> {
  const headers = {
    Authorization: `Klaviyo-API-Key ${privateApiKey}`,
    accept: 'application/json',
    'content-type': 'application/json',
    revision: REVISION,
  };

  const subscriptions: any = {};

  // Email consent
  if (emailOptin === true) {
    subscriptions.email = { marketing: { consent: 'SUBSCRIBED' } };
  }

  // SMS consent
  if (enableSms && smsOptin === true && phoneNumber) {
    subscriptions.sms = {
      marketing: { consent: 'SUBSCRIBED' },
      transactional: { consent: 'SUBSCRIBED' },
    };
  }

  if (!Object.keys(subscriptions).length) {
    console.log(`Klaviyo: no opt-in for ${email}, skipping subscribe`);
    return;
  }

  try {
    // Give the Events API time to create the profile before searching
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const searchRes = await fetch(
      `${API_BASE}/api/profiles/?filter=equals(email,"${encodeURIComponent(email)}")`,
      { headers },
    );

    if (!searchRes.ok) {
      throw new Error(`Profile search ${searchRes.status}`);
    }

    const searchData = (await searchRes.json()) as any;
    const profile = searchData?.data?.[0];

    if (!profile) {
      console.error(`Klaviyo: profile not found after event tracking for ${email}`);
      return;
    }

    // Email consent goes to the email list and SMS consent to the SMS list.
    // Without a separate SMS list, both go to the email list in one call.
    const jobs: { listId: string; subscriptions: any }[] = [];
    if (subscriptions.sms && smsListId && smsListId !== listId) {
      if (subscriptions.email) {
        jobs.push({ listId, subscriptions: { email: subscriptions.email } });
      }
      jobs.push({ listId: smsListId, subscriptions: { sms: subscriptions.sms } });
    } else {
      jobs.push({ listId, subscriptions });
    }

    for (const job of jobs) {
      const profileAttrs: any = { email, subscriptions: job.subscriptions };
      if (job.subscriptions.sms && phoneNumber) {
        profileAttrs.phone_number = phoneNumber;
      }

      const res = await fetch(`${API_BASE}/api/profile-subscription-bulk-create-jobs/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          data: {
            type: 'profile-subscription-bulk-create-job',
            attributes: {
              profiles: {
                data: [{ type: 'profile', id: profile.id, attributes: profileAttrs }],
              },
            },
            relationships: {
              list: { data: { type: 'list', id: job.listId } },
            },
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Subscribe ${res.status}: ${body}`);
      }
    }

    let channels = 'email only';
    if (subscriptions.sms && subscriptions.email) {
      channels = 'email + SMS';
    } else if (subscriptions.sms) {
      channels = 'SMS only';
    }
    console.log(`Klaviyo: subscribed ${email} (${channels})`);
  } catch (err) {
    console.error('Klaviyo subscribe error:', err);
  }
}

// resolve Klaviyo event name and corresponding setting
function getEventNameAndSetting(
  type: string,
): { eventName: string; settingKey: string } | null {
  switch (type) {
    case 'order.submitted':
      return { eventName: 'Order Submitted', settingKey: 'event_order_submitted' };
    case 'order.canceled':
      return { eventName: 'Order Canceled', settingKey: 'event_order_canceled' };
    case 'order.delivered':
      return { eventName: 'Order Fulfilled', settingKey: 'event_order_fulfilled' };
    case 'cart.created': 
      return { eventName: 'Checkout Started', settingKey: 'event_checkout_started' };
    case 'cart.abandoned':
      return { eventName: 'Abandoned Checkout', settingKey: 'event_checkout_abandoned' };
    default:
  }

  return null;
}

// track event
export async function trackKlaviyoEvent(
  eventType: string,
  eventId: string,
  record: any,
  appSettings: any,
) {
  if (!appSettings?.public_api_key || !appSettings?.private_api_key || !appSettings?.list_id) {
    console.error('Klaviyo: missing required settings (public_api_key, private_api_key, list_id)');
    return;
  }

  const resolvedEvent = getEventNameAndSetting(eventType);
  if (!resolvedEvent) {
    console.log(`Klaviyo: unsupported event`);
    return;
  }

  const { eventName, settingKey } = resolvedEvent;
  if (appSettings[settingKey] === false) {
    // event is disabled
    return;
  }

  const hasAccount = Boolean(record.account?.email);
  const phoneNumber = hasAccount
    ? formatPhone(record.account.phone, record.account.shipping?.country)
    : null;
  
  const eventProps = buildEventProps(eventName, eventId, record, phoneNumber);

  // send event to Klaviyo
  await track(appSettings.public_api_key, eventProps);

  // subscribe to the channels the customer opted into
  if (hasAccount) {
    await subscribeToList(
      appSettings.private_api_key,
      record.account.email,
      phoneNumber,
      appSettings.list_id,
      record.account.email_optin ?? null,
      record.account.sms_optin ?? null,
      appSettings.enable_sms === true,
      appSettings.sms_list_id ?? null,
    );
  }
};

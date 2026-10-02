import { vi } from "vitest";

export const settings = {
  public_api_key: "PUB123",
  private_api_key: "pk_secret",
  list_id: "LIST1",
  enable_sms: false,
  sms_list_id: "",
};

export function makeRecord(overrides: Record<string, any> = {}) {
  return {
    id: "rec_1",
    grand_total: 25,
    currency: "USD",
    items: [
      {
        id: "item_1",
        price: 10,
        price_total: 20,
        discount_total: 0,
        tax_total: 1,
        quantity: 2,
        product: {
          slug: "shirt",
          name: "Shirt",
          sku: "SKU-P",
          images: [{ file: { url: "https://cdn/p.jpg" } }],
        },
        variant: { sku: "SKU-V", images: [{ file: { url: "https://cdn/v.jpg" } }] },
      },
    ],
    account: {
      email: "jane@example.com",
      first_name: "Jane",
      last_name: "Doe",
      phone: "(201) 555-0123",
      email_optin: true,
      sms_optin: false,
      shipping: { city: "NYC", state: "NY", country: "US", zip: "10001" },
    },
    ...overrides,
  };
}

// Mocks global fetch with Klaviyo-like responses, keyed by URL
export function mockKlaviyoFetch(
  opts: { trackStatus?: number[]; profile?: object | null; subscribeStatus?: number } = {},
) {
  const trackStatus = [...(opts.trackStatus ?? [202])];
  const profile = opts.profile === undefined ? { id: "PROFILE1" } : opts.profile;

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    const url = String(input);
    if (url.includes("/client/events/")) {
      const status = trackStatus.length > 1 ? trackStatus.shift()! : trackStatus[0];
      return new Response(status < 300 ? "" : "bad", { status });
    }
    if (url.includes("/api/profiles/")) {
      return Response.json({ data: profile ? [profile] : [] });
    }
    if (url.includes("/api/profile-subscription-bulk-create-jobs/")) {
      const status = opts.subscribeStatus ?? 202;
      return new Response(status < 300 ? "" : "bad", { status });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
}

// Skips the 2s profile-propagation delay in subscribeToList
export function skipDelays() {
  return vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
    fn();
    return 0;
  }) as any);
}

export function bodyOf(call: any[]): any {
  return JSON.parse(call[1].body);
}

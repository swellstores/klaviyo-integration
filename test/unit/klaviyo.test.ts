import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildMappedItems,
  buildEventProps,
  track,
  subscribeToList,
  trackKlaviyoEvent,
} from "../../functions/lib/klaviyo";
import {
  settings,
  makeRecord,
  mockKlaviyoFetch,
  skipDelays,
  bodyOf,
} from "../helpers/klaviyo-fixtures";

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  skipDelays();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildMappedItems", () => {
  it("returns empty array for missing items", () => {
    expect(buildMappedItems(undefined as any)).toEqual([]);
    expect(buildMappedItems([])).toEqual([]);
  });

  it("prefers variant sku and image over product", () => {
    const [item] = buildMappedItems(makeRecord().items);
    expect(item).toEqual({
      id: "item_1",
      price: 10,
      price_total: 20,
      discount_total: 0,
      tax_total: 1,
      product_slug: "shirt",
      product_name: "Shirt",
      product_sku: "SKU-V",
      product_image_url: "https://cdn/v.jpg",
      quantity: 2,
    });
  });

  it("falls back to product sku and image when no variant", () => {
    const items = makeRecord().items.map((i: any) => ({ ...i, variant: undefined }));
    const [item] = buildMappedItems(items);
    expect(item.product_sku).toBe("SKU-P");
    expect(item.product_image_url).toBe("https://cdn/p.jpg");
  });
});

describe("buildEventProps", () => {
  it("builds an identified profile event", () => {
    const props: any = buildEventProps("Order Submitted", "rec_1", makeRecord(), "+12015550123");
    const attrs = props.attributes;
    expect(props.type).toBe("event");
    expect(attrs.unique_id).toBe("order-submitted-rec_1");
    expect(attrs.value).toBe(25);
    expect(attrs.value_currency).toBe("USD");
    expect(attrs.metric.data.attributes.name).toBe("Order Submitted");
    expect(attrs.profile.data.attributes).toMatchObject({
      email: "jane@example.com",
      phone_number: "+12015550123",
      first_name: "Jane",
      location: { city: "NYC", region: "NY", country: "US", zip: "10001" },
    });
    expect(attrs.properties.items_product_slugs).toEqual(["shirt"]);
  });

  it("uses checkout-based anonymous id for carts without account", () => {
    const record = makeRecord({ account: undefined, checkout_id: "chk_9" });
    const props: any = buildEventProps("Checkout Started", "rec_1", record, null);
    expect(props.attributes.profile.data.attributes).toEqual({ anonymous_id: "checkout-chk_9" });
  });

  it("uses record-based anonymous id otherwise", () => {
    const record = makeRecord({ account: undefined });
    const props: any = buildEventProps("Order Canceled", "rec_1", record, null);
    expect(props.attributes.profile.data.attributes).toEqual({ anonymous_id: "record-rec_1" });
  });
});

describe("track", () => {
  it("posts the event to the client events API", async () => {
    const fetchMock = mockKlaviyoFetch();
    const props = buildEventProps("Order Submitted", "rec_1", makeRecord(), null);

    await track("PUB123", props);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as any[];
    expect(url).toBe("https://a.klaviyo.com/client/events/?company_id=PUB123");
    expect(init.headers.revision).toBe("2024-02-15");
    expect(bodyOf(fetchMock.mock.calls[0]).data).toEqual(props);
  });

  it("retries once without phone number when Klaviyo rejects the event", async () => {
    const fetchMock = mockKlaviyoFetch({ trackStatus: [400, 202] });
    const props = buildEventProps("Order Submitted", "rec_1", makeRecord(), "+12015550123");

    await track("PUB123", props);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retried = bodyOf(fetchMock.mock.calls[1]);
    expect(retried.data.attributes.profile.data.attributes.phone_number).toBeUndefined();
  });

  it("does not retry and logs error when there is no phone number", async () => {
    const fetchMock = mockKlaviyoFetch({ trackStatus: [500] });
    await track("PUB123", buildEventProps("X", "1", makeRecord(), null));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("subscribeToList", () => {
  it("skips when customer has not opted in", async () => {
    const fetchMock = mockKlaviyoFetch();
    await subscribeToList("pk", "a@b.c", null, "LIST1", false, false, true, null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("subscribes email consent to the email list", async () => {
    const fetchMock = mockKlaviyoFetch();
    await subscribeToList("pk", "a@b.c", "+12015550123", "LIST1", true, true, false, null);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [searchUrl, searchInit] = fetchMock.mock.calls[0] as any[];
    expect(searchUrl).toContain("/api/profiles/?filter=equals(email,");
    expect(searchInit.headers.Authorization).toBe("Klaviyo-API-Key pk");

    const body = bodyOf(fetchMock.mock.calls[1]);
    expect(body.data.relationships.list.data.id).toBe("LIST1");
    const profile = body.data.attributes.profiles.data[0];
    expect(profile.id).toBe("PROFILE1");
    // SMS disabled in settings: no sms consent, no phone
    expect(profile.attributes.subscriptions).toEqual({
      email: { marketing: { consent: "SUBSCRIBED" } },
    });
    expect(profile.attributes.phone_number).toBeUndefined();
  });

  it("subscribes SMS consent to the SMS list when enabled", async () => {
    const fetchMock = mockKlaviyoFetch();
    await subscribeToList("pk", "a@b.c", "+12015550123", "LIST1", false, true, true, "SMSLIST");

    const body = bodyOf(fetchMock.mock.calls[1]);
    expect(body.data.relationships.list.data.id).toBe("SMSLIST");
    const profile = body.data.attributes.profiles.data[0];
    expect(profile.attributes.subscriptions.sms.marketing.consent).toBe("SUBSCRIBED");
    expect(profile.attributes.phone_number).toBe("+12015550123");
  });

  it("subscribes each channel to its own list when the customer opts in to both", async () => {
    const fetchMock = mockKlaviyoFetch();
    await subscribeToList("pk", "a@b.c", "+12015550123", "LIST1", true, true, true, "SMSLIST");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const emailJob = bodyOf(fetchMock.mock.calls[1]);
    expect(emailJob.data.relationships.list.data.id).toBe("LIST1");
    const emailProfile = emailJob.data.attributes.profiles.data[0];
    expect(emailProfile.attributes.subscriptions).toEqual({
      email: { marketing: { consent: "SUBSCRIBED" } },
    });
    expect(emailProfile.attributes.phone_number).toBeUndefined();

    const smsJob = bodyOf(fetchMock.mock.calls[2]);
    expect(smsJob.data.relationships.list.data.id).toBe("SMSLIST");
    const smsProfile = smsJob.data.attributes.profiles.data[0];
    expect(smsProfile.attributes.subscriptions.email).toBeUndefined();
    expect(smsProfile.attributes.subscriptions.sms.marketing.consent).toBe("SUBSCRIBED");
    expect(smsProfile.attributes.phone_number).toBe("+12015550123");
  });

  it("subscribes both channels to the email list when no SMS list is set", async () => {
    const fetchMock = mockKlaviyoFetch();
    await subscribeToList("pk", "a@b.c", "+12015550123", "LIST1", true, true, true, null);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = bodyOf(fetchMock.mock.calls[1]);
    expect(body.data.relationships.list.data.id).toBe("LIST1");
    const subscriptions = body.data.attributes.profiles.data[0].attributes.subscriptions;
    expect(subscriptions.email.marketing.consent).toBe("SUBSCRIBED");
    expect(subscriptions.sms.marketing.consent).toBe("SUBSCRIBED");
  });

  it("does not subscribe SMS without a phone number", async () => {
    const fetchMock = mockKlaviyoFetch();
    await subscribeToList("pk", "a@b.c", null, "LIST1", false, true, true, null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops when the profile is not found", async () => {
    const fetchMock = mockKlaviyoFetch({ profile: null });
    await subscribeToList("pk", "a@b.c", null, "LIST1", true, null, false, null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("logs and swallows subscribe API errors", async () => {
    mockKlaviyoFetch({ subscribeStatus: 400 });
    await expect(
      subscribeToList("pk", "a@b.c", null, "LIST1", true, null, false, null),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("trackKlaviyoEvent", () => {
  it("does nothing when required settings are missing", async () => {
    const fetchMock = mockKlaviyoFetch();
    await trackKlaviyoEvent("order.submitted", "rec_1", makeRecord(), { list_id: "x" });
    await trackKlaviyoEvent("order.submitted", "rec_1", makeRecord(), undefined);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores unsupported event types", async () => {
    const fetchMock = mockKlaviyoFetch();
    await trackKlaviyoEvent("order.updated", "rec_1", makeRecord(), settings);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips events disabled in settings", async () => {
    const fetchMock = mockKlaviyoFetch();
    await trackKlaviyoEvent("order.canceled", "rec_1", makeRecord(), {
      ...settings,
      event_order_canceled: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["order.submitted", "Order Submitted"],
    ["order.delivered", "Order Fulfilled"],
    ["order.canceled", "Order Canceled"],
    ["cart.created", "Checkout Started"],
    ["cart.abandoned", "Abandoned Checkout"],
  ])("maps %s to \"%s\"", async (type, name) => {
    const fetchMock = mockKlaviyoFetch();
    await trackKlaviyoEvent(type, "rec_1", makeRecord(), settings);
    const event = bodyOf(fetchMock.mock.calls[0]);
    expect(event.data.attributes.metric.data.attributes.name).toBe(name);
  });

  it("tracks the event with formatted phone and subscribes the account", async () => {
    const fetchMock = mockKlaviyoFetch();
    await trackKlaviyoEvent("order.submitted", "rec_1", makeRecord(), settings);

    const urls = fetchMock.mock.calls.map((c: any[]) => String(c[0]));
    expect(urls[0]).toContain("/client/events/");
    expect(urls[1]).toContain("/api/profiles/");
    expect(urls[2]).toContain("/api/profile-subscription-bulk-create-jobs/");

    const event = bodyOf(fetchMock.mock.calls[0]);
    expect(event.data.attributes.profile.data.attributes.phone_number).toBe("+12015550123");
  });

  it("tracks anonymously and skips subscription without an account", async () => {
    const fetchMock = mockKlaviyoFetch();
    await trackKlaviyoEvent("cart.abandoned", "rec_1", makeRecord({ account: undefined }), settings);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

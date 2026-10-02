import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockRequest } from "../helpers/mock-request";
import { settings, makeRecord, mockKlaviyoFetch, skipDelays, bodyOf } from "../helpers/klaviyo-fixtures";
import cartEvents, { config as cartConfig } from "../../functions/cart-events";
import orderEvents, { config as orderConfig } from "../../functions/order-events";

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  skipDelays();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const cases = [
  {
    name: "cart-events",
    handler: cartEvents,
    config: cartConfig,
    path: "/carts/{id}",
    events: ["cart.created", "cart.abandoned"],
    event: "cart.abandoned",
    metric: "Abandoned Checkout",
  },
  {
    name: "order-events",
    handler: orderEvents,
    config: orderConfig,
    path: "/orders/{id}",
    events: ["order.submitted", "order.delivered", "order.canceled"],
    event: "order.submitted",
    metric: "Order Submitted",
  },
];

describe.each(cases)("$name", ({ handler, config, path, events, event, metric }) => {
  it("subscribes to the expected model events", () => {
    expect(config.model?.events).toEqual(events);
  });

  it("loads the record with expansions and sends the Klaviyo event", async () => {
    const fetchMock = mockKlaviyoFetch();
    const get = vi.fn().mockResolvedValue(makeRecord());
    const req = createMockRequest({
      data: { id: "rec_1", $event: { type: event } },
      swell: { get, settings: vi.fn().mockResolvedValue({ klaviyo: settings }) },
    });

    await handler(req);

    expect(get).toHaveBeenCalledWith(path, {
      id: "rec_1",
      expand: ["account", "items.product", "items.variant"],
    });
    const sent = bodyOf(fetchMock.mock.calls[0]);
    expect(sent.data.attributes.metric.data.attributes.name).toBe(metric);
  });

  it("does nothing when the record is not found", async () => {
    const fetchMock = mockKlaviyoFetch();
    const req = createMockRequest({
      data: { id: "missing", $event: { type: event } },
      swell: {
        get: vi.fn().mockResolvedValue(null),
        settings: vi.fn().mockResolvedValue({ klaviyo: settings }),
      },
    });

    await handler(req);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("does nothing when settings are not configured", async () => {
    const fetchMock = mockKlaviyoFetch();
    const req = createMockRequest({
      data: { id: "rec_1", $event: { type: event } },
      swell: {
        get: vi.fn().mockResolvedValue(makeRecord()),
        settings: vi.fn().mockResolvedValue({}),
      },
    });

    await handler(req);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

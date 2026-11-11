import { describe, it, expect, vi, afterEach } from "vitest";
import { createMockRequest } from "../helpers/mock-request";
import { settings } from "../helpers/klaviyo-fixtures";
import testConnection, { config } from "../../functions/test-connection";

afterEach(() => {
  vi.restoreAllMocks();
});

function run(klaviyo: object) {
  return testConnection(
    createMockRequest({ swell: { settings: vi.fn().mockResolvedValue({ klaviyo }) } }),
  );
}

// list and account responses from Klaviyo, keyed by URL
function mockFetch(list: Response, account: Response = new Response("", { status: 403 })) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) =>
    String(input).includes("/api/lists/") ? list : account,
  );
}

const listOk = () => Response.json({ data: { id: "LIST1", attributes: { name: "Newsletter" } } });

describe("test-connection", () => {
  it("is an action", () => {
    expect(config.action).toBe(true);
  });

  it("asks for missing settings without calling Klaviyo", async () => {
    const fetchMock = mockFetch(listOk());
    await expect(run({ public_api_key: "PUB123" })).rejects.toMatchObject({
      status: 400,
      message: "Add the private API key, email list ID and save the settings first.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names the account and list", async () => {
    const fetchMock = mockFetch(
      listOk(),
      Response.json({
        data: [{ id: "PUB123", attributes: { public_api_key: "PUB123", contact_information: { organization_name: "Acme" } } }],
      }),
    );
    await expect(run(settings)).resolves.toEqual({
      message: "Connected to Klaviyo account Acme, email list Newsletter.",
    });
    const [url, init] = fetchMock.mock.calls[0] as any[];
    expect(String(url)).toBe("https://a.klaviyo.com/api/lists/LIST1/");
    expect(init.headers.Authorization).toBe("Klaviyo-API-Key pk_secret");
    expect(init.method).toBeUndefined();
  });

  it("names only the list when the key has no Accounts access", async () => {
    mockFetch(listOk());
    await expect(run(settings)).resolves.toEqual({ message: "Connected to Klaviyo, email list Newsletter." });
  });

  it("rejects a public key from another account", async () => {
    mockFetch(listOk(), Response.json({ data: [{ id: "OTHER1", attributes: { public_api_key: "OTHER1" } }] }));
    await expect(run(settings)).rejects.toThrow(/public API key in settings is PUB123/);
  });

  it.each([
    [401, /didn't accept the private API key/],
    [403, /no access to lists/],
    [404, /no list with the ID LIST1/],
  ])("explains a %s from Klaviyo", async (status, message) => {
    mockFetch(new Response("{}", { status }));
    await expect(run(settings)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(message) });
  });

  it("says when Klaviyo can't be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    await expect(run(settings)).rejects.toThrow(/couldn't be reached/);
  });
});

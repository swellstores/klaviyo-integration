import { describe, it, expect } from "vitest";
import { formatPhone } from "../../functions/lib/phone";

describe("formatPhone", () => {
  it("returns undefined for empty input", () => {
    expect(formatPhone(undefined)).toBeUndefined();
    expect(formatPhone(null)).toBeUndefined();
    expect(formatPhone("")).toBeUndefined();
  });

  it("formats a national number using the country code", () => {
    expect(formatPhone("(201) 555-0123", "US")).toBe("+12015550123");
  });

  it("keeps an international number without a country code", () => {
    expect(formatPhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("returns undefined for unparseable input", () => {
    expect(formatPhone("not a phone", "US")).toBeUndefined();
  });
});

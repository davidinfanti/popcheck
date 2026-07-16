import { describe, expect, it } from "vitest";
import {
  isApprovedEbayHostname,
  isApprovedEbayUrl,
  parseApprovedEbayUrl,
} from "../../supabase/functions/_shared/ebay-url";

describe("eBay URL allowlist", () => {
  it.each([
    "https://www.ebay.com/itm/123456789012",
    "https://m.ebay.com/itm/123456789012",
    "https://ebay.it/itm/123456789012",
    "https://www.ebay.co.uk/itm/123456789012",
    "https://m.ebay.de/itm/123456789012",
    "https://www.ebay.com.au/itm/123456789012",
  ])("accepts an official listing host: %s", (url) => {
    expect(isApprovedEbayUrl(url)).toBe(true);
    expect(parseApprovedEbayUrl(url)?.protocol).toBe("https:");
  });

  it.each([
    "https://ebay.attacker.com/itm/123",
    "https://ebay.com.attacker.net/itm/123",
    "https://fake-ebay.com/itm/123",
    "http://www.ebay.com/itm/123",
    "https://user:password@www.ebay.com/itm/123",
    "ftp://www.ebay.com/itm/123",
    "javascript:alert(1)",
    "https://pages.ebay.com/itm/123",
    "https://www.ebay.com:8443/itm/123",
  ])("rejects an unsafe or unsupported URL: %s", (url) => {
    expect(isApprovedEbayUrl(url)).toBe(false);
  });

  it("does not accept lookalike hostname suffixes", () => {
    expect(isApprovedEbayHostname("ebay.attacker.com")).toBe(false);
    expect(isApprovedEbayHostname("fake-ebay.com")).toBe(false);
  });
});

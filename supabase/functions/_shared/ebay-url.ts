const EBAY_DOMAIN_ROOTS = new Set([
  "ebay.com",
  "ebay.co.uk",
  "ebay.de",
  "ebay.fr",
  "ebay.it",
  "ebay.es",
  "ebay.ca",
  "ebay.com.au",
  "ebay.at",
  "ebay.be",
  "ebay.ch",
  "ebay.ie",
  "ebay.nl",
  "ebay.pl",
  "ebay.com.hk",
  "ebay.com.my",
  "ebay.com.sg",
  "ebay.ph",
]);

const APPROVED_HOST_PREFIXES = new Set(["", "www", "m"]);

export function isApprovedEbayHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");

  for (const root of EBAY_DOMAIN_ROOTS) {
    if (normalized === root) return true;
    if (!normalized.endsWith(`.${root}`)) continue;

    const prefix = normalized.slice(0, -(root.length + 1));
    return APPROVED_HOST_PREFIXES.has(prefix);
  }

  return false;
}

export function parseApprovedEbayUrl(input: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port && parsed.port !== "443") return null;
  if (!isApprovedEbayHostname(parsed.hostname)) return null;

  return parsed;
}

export function isApprovedEbayUrl(input: string): boolean {
  return parseApprovedEbayUrl(input) !== null;
}

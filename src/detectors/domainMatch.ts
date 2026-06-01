/**
 * OLM Parser - Anchored domain matching helper
 * @packageDocumentation
 */

/**
 * Look up a domain in a registry keyed by registrable domain.
 * Matches only on exact equality or a true subdomain suffix
 * (`domain === key` or `domain.endsWith('.' + key)`), never on a
 * bare substring. This avoids false positives such as `fedex.com`
 * matching `x.com` or `amazonaws.com` matching `amazon.com`.
 */
export function matchKnownDomain<T>(
  domain: string,
  registry: Record<string, T>
): T | null {
  if (!domain) return null;
  if (Object.prototype.hasOwnProperty.call(registry, domain)) {
    return registry[domain];
  }
  for (const [knownDomain, value] of Object.entries(registry)) {
    if (domain === knownDomain || domain.endsWith('.' + knownDomain)) {
      return value;
    }
  }
  return null;
}

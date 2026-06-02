/**
 * OLM Parser - Utility Functions
 * @packageDocumentation
 */

/**
 * Clean and normalize an email address
 * @param email - Raw email string
 * @returns Cleaned, lowercase email address, or '' when none is found
 */
export function cleanEmailAddress(email: string): string {
  if (!email) return '';

  // Remove angle brackets and extra whitespace
  const cleaned = email.replace(/[<>]/g, '').trim();

  // Preferred: a fully-qualified address with a dotted TLD
  const fqMatch = cleaned.match(
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
  );
  if (fqMatch) {
    return fqMatch[1].toLowerCase();
  }

  // Fallback: a bare "local@host" token (e.g. user@localhost), no display name
  const bareMatch = cleaned.match(/(?:^|\s)([^\s<>@]+@[^\s<>@]+)(?:\s|$)/);
  if (bareMatch) {
    // Strip any trailing punctuation picked up from list separators
    return bareMatch[1].replace(/[.,;:!?]+$/, '').toLowerCase();
  }

  // No address found — don't leak display-name text
  return '';
}

/**
 * Strip HTML tags from a string
 * Works in both Node.js and browser environments
 * @param html - HTML string to strip
 * @returns Plain text content
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  
  // Check if we're in a browser environment
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  }
  
  // Node.js fallback - simple regex-based stripping
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')  // must be last to avoid double-decoding &amp;lt; -> <
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract domain from an email address
 * @param email - Email address
 * @returns Domain portion of the email
 */
export function extractDomain(email: string): string {
  if (!email) return '';
  
  const cleaned = cleanEmailAddress(email);
  const atIndex = cleaned.indexOf('@');
  if (atIndex === -1) return '';
  
  return cleaned.substring(atIndex + 1).toLowerCase();
}

/**
 * Normalize a subject line for thread matching
 * Removes Re:, Fwd:, etc. prefixes
 * @param subject - Email subject
 * @returns Normalized subject
 */
export function normalizeSubject(subject: string): string {
  if (!subject) return '';
  
  // Remove Re:, Fwd:, Fw:, etc. prefixes (multiple times)
  let normalized = subject;
  const prefixPattern = /^(re|fwd|fw|aw|sv|vs|antw|r):\s*/i;
  
  while (prefixPattern.test(normalized)) {
    normalized = normalized.replace(prefixPattern, '');
  }
  
  // Remove leading/trailing whitespace and normalize internal whitespace
  return normalized.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Truncate text to a maximum length
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format file size for display
 * @param bytes - Size in bytes
 * @returns Human-readable size string
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1
  );

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Generate initials from a name or email
 * @param name - Name or email address
 * @returns Two-character initials
 */
export function getInitials(name: string): string {
  if (!name) return '?';
  
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  
  return (parts[0][0] + parts[parts.length > 1 ? 1 : 0][0]).toUpperCase();
}

/**
 * Parse a date string into a Date object
 * @param dateStr - Date string to parse
 * @returns Parsed Date or null if invalid
 */
export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Map common MIME charset aliases to labels TextDecoder accepts.
 * @param charset - Declared charset (e.g. from a header or encoded-word)
 * @returns A normalized label suitable for `new TextDecoder(...)`
 */
function normalizeCharset(charset: string): string {
  const c = charset.trim().toLowerCase();
  if (c === 'utf8') return 'utf-8';
  if (c === 'latin1' || c === 'iso8859-1') return 'iso-8859-1';
  return c || 'utf-8';
}

/**
 * Decode a byte array using the declared charset, falling back to UTF-8.
 * `TextDecoder` is available in Node, so we can honor non-UTF-8 charsets;
 * if the charset label is unknown we degrade gracefully to UTF-8 (which is
 * the historical CLI behavior).
 */
function decodeBytes(bytes: Uint8Array, charset: string): string {
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder(normalizeCharset(charset)).decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
  // Node.js fallback (older runtimes without a global TextDecoder).
  try {
    return Buffer.from(bytes).toString(normalizeCharset(charset) as BufferEncoding);
  } catch {
    return Buffer.from(bytes).toString('utf-8');
  }
}

/**
 * Decode quoted-printable encoding into text using the declared charset.
 * Soft line breaks are removed, then every `=XX` sequence and literal
 * character is accumulated as raw bytes and decoded together, so multi-byte
 * sequences (e.g. `=C3=A9` -> 'é') and astral code points (emoji) survive.
 * Defaults to UTF-8 when no charset is given.
 * @param str - Quoted-printable encoded string
 * @param charset - Declared charset (default 'utf-8')
 * @returns Decoded string
 */
export function decodeQuotedPrintable(str: string, charset = 'utf-8'): string {
  // Remove soft line breaks first ("=\n" or "=\r\n")
  const cleaned = str.replace(/=\r?\n/g, '');

  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '=' && i + 2 < cleaned.length) {
      const hex = cleaned.substring(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    // Literal character. Surrogate pairs (astral code points such as emoji)
    // must be encoded together; non-ASCII literals are UTF-8 encoded so they
    // are not corrupted by a naive `& 0xff` byte mask.
    const code = char.charCodeAt(0);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < cleaned.length) {
      const next = cleaned.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        // High surrogate followed by low surrogate: encode the pair together.
        const enc = new TextEncoder().encode(cleaned[i] + cleaned[i + 1]);
        for (const b of enc) bytes.push(b);
        i += 1; // skip the low surrogate on the next iteration
        continue;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else {
      const enc = new TextEncoder().encode(char);
      for (const b of enc) bytes.push(b);
    }
  }

  return decodeBytes(new Uint8Array(bytes), charset);
}

/**
 * Decode an RFC 2047 encoded header value.
 * Handles the `=?charset?encoding?text?=` format for both `B` (base64)
 * and `Q` (quoted-printable) encodings, honoring the charset captured from
 * each encoded-word. Falls back to the raw payload on decode errors.
 * @param str - Encoded header value
 * @returns Decoded string
 */
export function decodeHeaderValue(str: string): string {
  // RFC 2047 §6.2 — linear whitespace between two adjacent encoded-words must
  // be removed before decoding. Whitespace between an encoded-word and
  // ordinary text is preserved.
  const collapsed = str.replace(/\?=\s+=\?/g, '?==?');
  return collapsed.replace(
    // Allow empty encoded payloads ([^?]* not [^?]+).
    /=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi,
    (_, charset: string, encoding: string, text: string) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          // Base64-encoded bytes -> decode with the declared charset.
          if (typeof atob !== 'undefined') {
            const binary = atob(text);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i) & 0xff;
            }
            return decodeBytes(bytes, charset);
          }
          // Node.js fallback without a global atob.
          return decodeBytes(
            new Uint8Array(Buffer.from(text, 'base64')),
            charset
          );
        }
        // Quoted-printable: underscores represent spaces in encoded words.
        return decodeQuotedPrintable(text.replace(/_/g, ' '), charset);
      } catch {
        return text;
      }
    }
  );
}

/**
 * Format domain as a readable service name
 * @param domain - Domain to format
 * @returns Formatted name
 */
export function formatDomainAsName(domain: string): string {
  if (!domain) return '';
  
  // Remove common prefixes (subdomains used for email)
  let name = domain
    .replace(/^(mail|email|noreply|no-reply|billing|notifications?|support|info|newsletter|news|updates?|marketing|promo|alerts?|digest|reply|bounce|mailer|sender|e\.)\./i, '');
  
  // Extract main domain part
  const parts = name.split('.');
  
  // Handle TLDs - get the main domain name
  if (parts.length >= 2) {
    // Check for country-code second-level domains (e.g., co.uk, com.au)
    const lastTwo = parts.slice(-2).join('.');
    const countrySecondLevel = ['co.uk', 'co.au', 'com.au', 'org.uk', 'co.nz', 'com.br'];
    
    if (countrySecondLevel.includes(lastTwo.toLowerCase()) && parts.length >= 3) {
      name = parts[parts.length - 3];
    } else {
      name = parts[parts.length - 2];
    }
  } else {
    name = parts[0];
  }
  
  // Skip if result is too generic
  const genericNames = ['mail', 'email', 'noreply', 'info', 'support', 'contact', 'hello', 'team'];
  if (genericNames.includes(name.toLowerCase())) {
    // Try to get the domain root
    if (parts.length >= 2) {
      name = parts[0];
    }
  }
  
  // Handle common compound domains
  name = name
    .replace(/[_-]/g, ' ')  // Convert separators to spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2');  // Split camelCase
  
  // Capitalize each word
  return name
    .split(/\s+/)
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ') || domain;
}

/**
 * Parse a monetary amount string into a number, resolving the decimal
 * separator from its position rather than assuming a single locale. Handles
 * space and apostrophe (CHF) grouping, comma-decimal (EUR/BRL) and dot-decimal.
 * @param amountStr - Raw captured amount (e.g. '1.234,56', "1'234.56")
 * @param currency - Currency code, used only to disambiguate ambiguous formats
 * @returns Parsed number, or 0 when unparseable
 */
export function parseMoney(amountStr: string, currency: string): number {
  let cleaned = amountStr.replace(/[\s']/g, '');

  const commaDecimalLocale = currency === 'EUR' || currency === 'BRL';
  const commaDecimalOrCHF = commaDecimalLocale || currency === 'CHF';
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const tail = cleaned.slice(lastComma + 1);
    const oneComma = cleaned.indexOf(',') === lastComma;
    if (tail.length >= 1 && tail.length <= 2 && (commaDecimalOrCHF || oneComma)) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (lastDot !== -1) {
    const tail = cleaned.slice(lastDot + 1);
    const oneDot = cleaned.indexOf('.') === lastDot;
    if (commaDecimalLocale) {
      cleaned = cleaned.replace(/\./g, '');
    } else if (!(tail.length >= 1 && tail.length <= 2 && oneDot)) {
      cleaned = cleaned.replace(/\./g, '');
    }
  }

  const amount = parseFloat(cleaned);
  return isNaN(amount) ? 0 : amount;
}


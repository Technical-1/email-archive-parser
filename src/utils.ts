/**
 * OLM Parser - Utility Functions
 * @packageDocumentation
 */

/**
 * Decode a UTF-8 byte array to a string, using TextDecoder where available
 * and falling back to Node's Buffer. Centralizes correct multi-byte handling.
 */
function utf8BytesToString(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  // Node.js fallback
  return Buffer.from(bytes).toString('utf-8');
}

/**
 * Decode a base64 string whose decoded bytes are UTF-8 text.
 * `atob` yields a Latin-1 string (one char per byte), so we re-read those
 * char codes as bytes and UTF-8 decode them. In Node, Buffer handles it directly.
 */
function base64ToUtf8(str: string): string {
  if (typeof atob !== 'undefined') {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i) & 0xff;
    }
    return utf8BytesToString(bytes);
  }
  return Buffer.from(str, 'base64').toString('utf-8');
}

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
    return bareMatch[1].toLowerCase();
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
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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
 * Decode quoted-printable encoding into UTF-8 text.
 * Soft line breaks are removed, then every `=XX` sequence and literal
 * character is accumulated as raw bytes and decoded together as UTF-8,
 * so multi-byte sequences (e.g. `=C3=A9` -> 'é') decode correctly.
 * @param str - Quoted-printable encoded string
 * @returns Decoded string
 */
export function decodeQuotedPrintable(str: string): string {
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
    // Literal character — quoted-printable literals are ASCII, but mask to a
    // byte defensively so any stray code point stays in range.
    bytes.push(char.charCodeAt(0) & 0xff);
  }

  return utf8BytesToString(new Uint8Array(bytes));
}

/**
 * Decode an RFC 2047 encoded header value.
 * Handles the `=?charset?encoding?text?=` format for both `B` (base64)
 * and `Q` (quoted-printable) encodings, decoding the payload as UTF-8.
 * @param str - Encoded header value
 * @returns Decoded string
 */
export function decodeHeaderValue(str: string): string {
  return str.replace(
    /=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi,
    (_, _charset, encoding, text) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          // Base64-encoded UTF-8
          return base64ToUtf8(text);
        }
        // Quoted-printable: underscores represent spaces in encoded words
        return decodeQuotedPrintable(text.replace(/_/g, ' '));
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


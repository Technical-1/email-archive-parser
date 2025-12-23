/**
 * OLM Parser - Utility Functions
 * @packageDocumentation
 */

/**
 * Clean and normalize an email address
 * @param email - Raw email string
 * @returns Cleaned, lowercase email address
 */
export function cleanEmailAddress(email: string): string {
  if (!email) return '';
  
  // Remove angle brackets and extra whitespace
  let cleaned = email.replace(/[<>]/g, '').trim();
  
  // If it's in "Name <email>" format, extract just the email
  const match = cleaned.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (match) {
    cleaned = match[1];
  }
  
  return cleaned.toLowerCase();
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
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
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
 * Decode quoted-printable encoding
 * @param str - Quoted-printable encoded string
 * @returns Decoded string
 */
export function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=\r?\n/g, '') // Remove soft line breaks
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => 
      String.fromCharCode(parseInt(hex, 16))
    );
}

/**
 * Decode RFC 2047 encoded header value
 * @param str - Encoded header value
 * @returns Decoded string
 */
export function decodeHeaderValue(str: string): string {
  // Handle =?charset?encoding?text?= format
  return str.replace(
    /=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi,
    (_, _charset, encoding, text) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          // Base64
          if (typeof atob !== 'undefined') {
            return atob(text);
          }
          return Buffer.from(text, 'base64').toString('utf-8');
        } else {
          // Quoted-printable
          return decodeQuotedPrintable(text.replace(/_/g, ' '));
        }
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


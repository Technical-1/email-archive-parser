/**
 * OLM Parser - Email Archive Parsing Library
 *
 * A powerful library for parsing email archives (OLM, MBOX) and detecting
 * accounts, purchases, subscriptions, and newsletters.
 *
 * @packageDocumentation
 * @module @technical-1/email-archive-parser
 */

// ============================================================================
// Parsers
// ============================================================================
export { OLMParser } from './parsers/olm';
export { MBOXParser, type EmailBatchCallback } from './parsers/mbox';

// ============================================================================
// Detectors
// ============================================================================
export { AccountDetector } from './detectors/account';
export { PurchaseDetector } from './detectors/purchase';
export { SubscriptionDetector } from './detectors/subscription';
export { NewsletterDetector } from './detectors/newsletter';

// ============================================================================
// Types
// ============================================================================
export type {
  // Core types
  Email,
  Attachment,
  Contact,
  CalendarEvent,

  // Detection types
  Account,
  ServiceType,
  Purchase,
  PurchaseCategory,
  Subscription,
  SubscriptionFrequency,
  SubscriptionCategory,
  Newsletter,

  // Detection results
  AccountDetectionResult,
  PurchaseDetectionResult,
  SubscriptionDetectionResult,
  NewsletterDetectionResult,

  // Parser types
  ParseOptions,
  ParseResult,
  ParseProgress,
  ParsingStage,
  ProgressCallback,
} from './types';

// ============================================================================
// Utilities
// ============================================================================
export {
  cleanEmailAddress,
  stripHtml,
  extractDomain,
  normalizeSubject,
  truncateText,
  formatFileSize,
  getInitials,
  parseDate,
  decodeQuotedPrintable,
  decodeHeaderValue,
  formatDomainAsName,
} from './utils';

// ============================================================================
// Convenience Functions
// ============================================================================

import { OLMParser } from './parsers/olm';
import { MBOXParser } from './parsers/mbox';
import { AccountDetector } from './detectors/account';
import { PurchaseDetector } from './detectors/purchase';
import { SubscriptionDetector } from './detectors/subscription';
import { NewsletterDetector } from './detectors/newsletter';
import type { ParseOptions, ParseResult, Email } from './types';

/**
 * Parse an email archive file (OLM or MBOX)
 * Automatically detects the file format and uses the appropriate parser
 *
 * @param file - File to parse (File in browser, Buffer in Node.js)
 * @param options - Parsing options
 * @returns Parsed result with emails, contacts, and calendar events
 *
 * @example
 * ```typescript
 * import { parseArchive } from '@technical-1/email-archive-parser';
 *
 * // Browser
 * const input = document.querySelector('input[type="file"]');
 * input.addEventListener('change', async (e) => {
 *   const file = e.target.files[0];
 *   const result = await parseArchive(file, {
 *     onProgress: (p) => console.log(p.message),
 *   });
 *   console.log(`Parsed ${result.emails.length} emails`);
 * });
 *
 * // Node.js
 * import { readFileSync } from 'fs';
 * const buffer = readFileSync('archive.olm');
 * const result = await parseArchive(buffer, { detectAccounts: true });
 * ```
 */
export async function parseArchive(
  file: File | Buffer | ArrayBuffer,
  options: ParseOptions = {}
): Promise<ParseResult> {
  // Determine which parser to use.
  let useMbox = false;

  if (file instanceof File) {
    const name = file.name.toLowerCase();
    useMbox = name.endsWith('.mbox') || name.endsWith('.mbx');
  } else {
    // No filename available — sniff the leading bytes.
    const head = getFirstBytes(file, 5);
    if (looksLikeMbox(head) && !looksLikeZip(head)) {
      useMbox = true;
    }
    // Otherwise default to OLM (ZIP container).
  }

  // Use appropriate parser
  let result: ParseResult;

  if (useMbox) {
    const parser = new MBOXParser();
    result = await parser.parse(file, options);
  } else {
    const parser = new OLMParser();
    result = await parser.parse(file, options);
  }

  // Run detectors if requested
  if (options.detectAccounts || options.detectPurchases || 
      options.detectSubscriptions || options.detectNewsletters) {
    result = await runDetectors(result, options);
  }

  return result;
}

/**
 * Run detectors on parsed emails
 * @internal
 */
async function runDetectors(
  result: ParseResult,
  options: ParseOptions
): Promise<ParseResult> {
  const emails = result.emails;

  if (options.detectAccounts) {
    const detector = new AccountDetector();
    result.accounts = detector.detectBatch(emails as Email[]);
    result.stats.accountCount = result.accounts.length;
  }

  if (options.detectPurchases) {
    const detector = new PurchaseDetector();
    result.purchases = detector.detectBatch(emails as Email[]);
    result.stats.purchaseCount = result.purchases.length;
  }

  if (options.detectSubscriptions) {
    const detector = new SubscriptionDetector();
    result.subscriptions = detector.detectBatch(emails as Email[]);
    result.stats.subscriptionCount = result.subscriptions.length;
  }

  if (options.detectNewsletters) {
    const detector = new NewsletterDetector();
    result.newsletters = detector.detectBatch(emails as Email[]);
    result.stats.newsletterCount = result.newsletters.length;
  }

  return result;
}

/**
 * Create default parser instances
 * @returns Object with parser and detector instances
 */
export function createParsers() {
  return {
    olm: new OLMParser(),
    mbox: new MBOXParser(),
    detectors: {
      account: new AccountDetector(),
      purchase: new PurchaseDetector(),
      subscription: new SubscriptionDetector(),
      newsletter: new NewsletterDetector(),
    },
  };
}

/**
 * Read the first `n` bytes of a Buffer or ArrayBuffer for format sniffing.
 */
function getFirstBytes(file: Buffer | ArrayBuffer, n: number): Uint8Array {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(file)) {
    return Uint8Array.from(file.subarray(0, n));
  }
  if (file instanceof ArrayBuffer) {
    return new Uint8Array(file.slice(0, n));
  }
  if (ArrayBuffer.isView(file)) {
    const view = file as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, Math.min(n, view.byteLength));
  }
  return new Uint8Array(0);
}

/** ZIP local-file-header magic: 50 4B 03 04 ("PK\x03\x04") — OLM is a ZIP. */
function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/** MBOX files begin with the ASCII bytes for "From " (46 72 6f 6d 20). */
function looksLikeMbox(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x46 &&
    bytes[1] === 0x72 &&
    bytes[2] === 0x6f &&
    bytes[3] === 0x6d &&
    bytes[4] === 0x20
  );
}


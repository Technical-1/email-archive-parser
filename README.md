# Email Archive Parser

Parse OLM and MBOX email archives and extract structured signal: accounts, purchases, subscriptions, and newsletters.

`@technical-1/email-archive-parser` is a dependency-light TypeScript library for turning raw email-export files into typed `Email` objects, then mining those objects for the things people actually care about — which services they signed up for, what they bought, what they pay for monthly, and which senders are newsletters. It runs the same code in Node.js and the browser, streams multi-gigabyte MBOX files without exhausting memory, and ships as both CommonJS and ESM with full type declarations.

## Features

- **OLM parsing** — reads Outlook for Mac `.olm` archives (a ZIP container) via JSZip, extracting emails, contacts, and calendar events.
- **MBOX parsing** — handles Gmail Takeout, Thunderbird, and Apple Mail exports, including Gmail label extraction and mboxrd `>From ` unescaping.
- **Streaming for large files** — MBOX input is processed in chunks (file streams in Node, sliced reads in the browser) so multi-GB archives parse without loading the whole file into memory.
- **Charset-aware MIME decoding** — quoted-printable and RFC 2047 encoded-words (`=?charset?B/Q?...?=`) are decoded byte-accurately through `TextDecoder`, with surrogate-pair handling so emoji and astral code points survive.
- **Account detection** — recognizes 100+ services across streaming, e-commerce, social, banking, development, and communication, with boundary-safe domain matching.
- **Purchase detection** — identifies order/receipt/invoice emails, filters out promotional noise, and extracts amounts across 8 currencies (USD, EUR, GBP, JPY, CAD, AUD, INR, CHF).
- **Locale-aware money parsing** — correctly reads `1.234,56`, `1,234.56`, and `1'234.56` by resolving the decimal separator from its position rather than assuming a single format.
- **Subscription detection** — finds recurring services, infers billing frequency, normalizes prices to a monthly figure, and only trusts amounts that sit inside a billing context.
- **Newsletter detection** — flags newsletters and promotional senders, extracts unsubscribe links, and estimates sending frequency — without misflagging `gmail.com`/`hotmail.com` as promotional.
- **Cross-platform** — no DOM assumptions; uses `Buffer` and `atob`/`TextDecoder` fallbacks so encoding works in Node and the browser alike.
- **TypeScript-first** — every public surface is fully typed, shipped with `.d.ts` declarations.

## Tech Stack

- **Language:** TypeScript (`^5.3`), targeting ES2020
- **Build:** [tsup](https://tsup.egoist.dev/) — dual CJS + ESM output with type declarations
- **Tests:** [Vitest](https://vitest.dev/)
- **Runtime dependency:** [JSZip](https://stuk.github.io/jszip/) (`^3.10`) for OLM archive extraction

## Getting Started

### Prerequisites

- Node.js >= 16

### Installation

```bash
npm install @technical-1/email-archive-parser
```

### Usage

```typescript
import { parseArchive } from '@technical-1/email-archive-parser';
import { readFileSync } from 'fs';

// Node.js: parse a Buffer and run all four detectors
const buffer = readFileSync('archive.mbox');
const result = await parseArchive(buffer, {
  detectAccounts: true,
  detectPurchases: true,
  detectSubscriptions: true,
  detectNewsletters: true,
  onProgress: (p) => console.log(`${p.progress}% — ${p.message}`),
});

console.log(`Parsed ${result.emails.length} emails`);
console.log(`Accounts: ${result.accounts?.length ?? 0}`);
console.log(`Purchases: ${result.purchases?.length ?? 0}`);
console.log(`Subscriptions: ${result.subscriptions?.length ?? 0}`);
console.log(`Newsletters: ${result.newsletters?.length ?? 0}`);
```

`parseArchive` accepts a `File` (browser), `Buffer`, or `ArrayBuffer`, auto-detecting OLM (a ZIP container) vs. MBOX by filename or magic bytes.

For very large MBOX files in Node, use the file-path streaming entry point directly:

```typescript
import { MBOXParser } from '@technical-1/email-archive-parser';

const parser = new MBOXParser();
const result = await parser.parseFile('/path/to/huge-archive.mbox', {
  onProgress: (p) => console.log(`${p.progress}%: ${p.message}`),
});
```

Detectors can also be run on their own against already-parsed emails:

```typescript
import { PurchaseDetector } from '@technical-1/email-archive-parser';

const purchases = new PurchaseDetector().detectBatch(result.emails);
```

## Development

```bash
# Install dependencies
npm install

# Run tests (watch mode)
npm test

# Run tests once
npm run test:run

# Build CJS + ESM + type declarations
npm run build
```

## Project Structure

```
src/
├── index.ts                  # Public exports + parseArchive() convenience entry point
├── types.ts                  # Email, Account, Purchase, Subscription, Newsletter types
├── utils.ts                  # MIME/RFC 2047 decoding, address/domain helpers
├── parsers/
│   ├── mbox.ts               # Streaming MBOX parser (Gmail/Thunderbird/Apple Mail)
│   └── olm.ts                # OLM (Outlook for Mac) ZIP archive parser
└── detectors/
    ├── account.ts            # Account/signup detection
    ├── purchase.ts           # Purchase/receipt detection + multi-currency amounts
    ├── subscription.ts       # Recurring-subscription detection
    ├── newsletter.ts         # Newsletter/promotional detection
    └── domainMatch.ts        # Boundary-safe domain lookup shared by detectors
```

## License

MIT

## Author

Jacob Kanfer — [GitHub](https://github.com/Technical-1)

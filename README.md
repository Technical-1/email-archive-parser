# 📧 OLM Parser

<div align="center">

![npm](https://img.shields.io/npm/v/@jacobkanfer/olm-parser?style=for-the-badge&color=blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![License](https://img.shields.io/npm/l/@jacobkanfer/olm-parser?style=for-the-badge)

**A powerful TypeScript library for parsing email archives and detecting accounts, purchases, subscriptions, and newsletters.**

Works with **Outlook for Mac (.olm)**, **Gmail Takeout (.mbox)**, and **Thunderbird (.mbox)** archives.

[Installation](#-installation) • [Quick Start](#-quick-start) • [API Reference](#-api-reference) • [Publishing to npm](#-publishing-to-npm)

</div>

---

## ✨ Features

- 📁 **Multi-format Support** - Parse OLM (Outlook for Mac) and MBOX (Gmail, Thunderbird) archives
- ⚡ **Streaming Parser** - Memory-efficient chunked processing for large files (100MB+)
- 🏷️ **Gmail Label Support** - Automatically maps Gmail labels to folders
- 🔍 **Account Detection** - Identify 100+ known services (Netflix, GitHub, Amazon, etc.)
- 🛒 **Purchase Detection** - Extract orders with multi-currency support (USD, EUR, GBP, JPY, etc.)
- 🔄 **Subscription Detection** - Track recurring services and billing frequencies
- 📰 **Newsletter Detection** - Find newsletters with frequency analysis and unsubscribe links
- 🌐 **Cross-Platform** - Works in Node.js and browsers
- 📦 **Zero Config** - Just install and use
- 💪 **Full TypeScript Support** - Complete type definitions included

---

## 📦 Installation

```bash
npm install @jacobkanfer/olm-parser
```

```bash
yarn add @jacobkanfer/olm-parser
```

```bash
pnpm add @jacobkanfer/olm-parser
```

---

## 🚀 Quick Start

### Basic Parsing

```typescript
import { parseArchive } from '@jacobkanfer/olm-parser';

// Browser: File input
const fileInput = document.querySelector('input[type="file"]');
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  
  const result = await parseArchive(file, {
    onProgress: (progress) => {
      console.log(`${progress.progress}% - ${progress.message}`);
    },
  });
  
  console.log(`Parsed ${result.emails.length} emails`);
});

// Node.js: Buffer
import { readFileSync } from 'fs';

const buffer = readFileSync('archive.olm');
const result = await parseArchive(buffer);
```

### With Detection

```typescript
import { parseArchive } from '@jacobkanfer/olm-parser';

const result = await parseArchive(file, {
  detectAccounts: true,
  detectPurchases: true,
  detectSubscriptions: true,
  detectNewsletters: true,
});

console.log(`Found ${result.accounts?.length} accounts`);
console.log(`Found ${result.purchases?.length} purchases`);
console.log(`Found ${result.subscriptions?.length} subscriptions`);
console.log(`Found ${result.newsletters?.length} newsletters`);
```

### Using Individual Parsers

```typescript
import { OLMParser, MBOXParser } from '@jacobkanfer/olm-parser';

// OLM files (Outlook for Mac)
const olmParser = new OLMParser();
const olmResult = await olmParser.parse(olmFile);

// MBOX files (Gmail Takeout, Thunderbird)
const mboxParser = new MBOXParser();
const mboxResult = await mboxParser.parse(mboxFile);
```

### Using Individual Detectors

```typescript
import { 
  AccountDetector, 
  PurchaseDetector,
  SubscriptionDetector,
  NewsletterDetector 
} from '@jacobkanfer/olm-parser';

const accountDetector = new AccountDetector();
const purchaseDetector = new PurchaseDetector();

// Detect single email
const accountResult = accountDetector.detect(email);
if (accountResult.type === 'account') {
  console.log(`Account signup: ${accountResult.data?.serviceName}`);
}

// Batch detection (more efficient)
const accounts = accountDetector.detectBatch(emails);
const purchases = purchaseDetector.detectBatch(emails);
```

---

## 📖 API Reference

### `parseArchive(file, options?)`

The main convenience function for parsing email archives.

```typescript
function parseArchive(
  file: File | Buffer | ArrayBuffer,
  options?: ParseOptions
): Promise<ParseResult>
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `onProgress` | `(progress: ParseProgress) => void` | - | Progress callback |
| `detectAccounts` | `boolean` | `false` | Run account detection |
| `detectPurchases` | `boolean` | `false` | Run purchase detection |
| `detectSubscriptions` | `boolean` | `false` | Run subscription detection |
| `detectNewsletters` | `boolean` | `false` | Run newsletter detection |

#### Returns

```typescript
interface ParseResult {
  emails: Email[];
  contacts: Contact[];
  calendarEvents: CalendarEvent[];
  accounts?: Account[];
  purchases?: Purchase[];
  subscriptions?: Subscription[];
  newsletters?: Newsletter[];
  stats: {
    emailCount: number;
    contactCount: number;
    calendarEventCount: number;
    accountCount: number;
    purchaseCount: number;
    subscriptionCount: number;
    newsletterCount: number;
  };
}
```

---

### Parsers

#### `OLMParser`

```typescript
import { OLMParser } from '@jacobkanfer/olm-parser';

const parser = new OLMParser();

// Parse file
const result = await parser.parse(file, options);

// Check if file is OLM
if (OLMParser.isOLMFile(file)) {
  // ...
}
```

#### `MBOXParser`

```typescript
import { MBOXParser } from '@jacobkanfer/olm-parser';

const parser = new MBOXParser();

// Parse file
const result = await parser.parse(file, options);

// Check if file is MBOX
if (MBOXParser.isMBOXFile(file)) {
  // ...
}
```

##### Streaming API (Large Files)

For files over 20MB, use the streaming API for better memory efficiency:

```typescript
import { MBOXParser, type EmailBatchCallback } from '@jacobkanfer/olm-parser';

const parser = new MBOXParser();
const allEmails: Email[] = [];

const onBatch: EmailBatchCallback = async (batch, batchNumber) => {
  console.log(`Processing batch ${batchNumber} with ${batch.length} emails`);
  allEmails.push(...batch);
  // Or: save to database, process in chunks, etc.
};

const totalCount = await parser.parseStreaming(
  file,
  (progress) => console.log(progress.message),
  onBatch
);

console.log(`Parsed ${totalCount} emails in batches`);
```

##### Gmail Label Support

The MBOX parser automatically extracts Gmail labels from the `X-Gmail-Labels` header:

```typescript
const parser = new MBOXParser();

// Parse Gmail labels
const labels = parser.parseGmailLabels('Inbox,Starred,"My Custom Label"');
// ['inbox', 'starred', 'my custom label']

// Get all folder IDs from labels
const folders = parser.getAllFolderIdsFromLabels(labelsHeader);
// ['inbox', 'my-custom-label']
```

Labels are automatically mapped to folders:
- `Inbox` → `inbox`
- `Sent` / `Sent Mail` → `sent`
- `Draft` / `Drafts` → `drafts`
- `Spam` → `spam`
- `Trash` → `trash`
- Custom labels → kebab-case folder IDs

---

### Detectors

#### `AccountDetector`

Detects account signup/registration emails from 100+ known services.

```typescript
import { AccountDetector } from '@jacobkanfer/olm-parser';

const detector = new AccountDetector();

// Single email detection
const result = detector.detect(email);
// Returns: { type: 'account' | 'none', confidence: number, data?: { serviceName, serviceType } }

// Batch detection (deduplicated)
const accounts = detector.detectBatch(emails);

// Get all known services
const services = detector.getKnownServices();
```

#### `PurchaseDetector`

Detects purchase/order confirmation emails with multi-currency support.

```typescript
import { PurchaseDetector } from '@jacobkanfer/olm-parser';

const detector = new PurchaseDetector();

// Single email detection
const result = detector.detect(email);
// Returns: { type: 'purchase' | 'none', confidence: number, data?: { merchant, amount, currency, orderNumber } }

// Batch detection
const purchases = detector.detectBatch(emails);

// Get purchase category
const category = detector.getCategory('Amazon'); // 'ecommerce'
```

#### `SubscriptionDetector`

Detects recurring subscription services.

```typescript
import { SubscriptionDetector } from '@jacobkanfer/olm-parser';

const detector = new SubscriptionDetector();

// Single email detection
const result = detector.detect(email);
// Returns: { isSubscription: boolean, serviceName?, category?, amount?, currency?, frequency? }

// Batch detection (grouped by service)
const subscriptions = detector.detectBatch(emails);
```

#### `NewsletterDetector`

Detects newsletters and promotional emails, extracts unsubscribe links.

```typescript
import { NewsletterDetector } from '@jacobkanfer/olm-parser';

const detector = new NewsletterDetector();

// Single email detection
const result = detector.detect(email);
// Returns: { isNewsletter: boolean, isPromotional: boolean, confidence: number, unsubscribeLink? }

// Batch detection (grouped by sender)
const newsletters = detector.detectBatch(emails);

// Categorize email
const category = detector.categorize(email); // 'newsletter' | 'promotional' | 'regular'
```

---

### Types

```typescript
// Core types
interface Email {
  id?: number;
  subject: string;
  sender: string;
  senderName?: string;
  recipients: string[];
  date: Date;
  body: string;
  htmlBody?: string;
  attachments: Attachment[];
  size: number;
  isRead: boolean;
  isStarred: boolean;
  folderId: string;
  threadId?: string;
}

interface Account {
  serviceName: string;
  signupDate: Date;
  serviceType: 'streaming' | 'ecommerce' | 'social' | 'banking' | 'communication' | 'development' | 'other';
  domain: string;
  emailCount: number;
}

interface Purchase {
  merchant: string;
  amount: number;
  currency: string;
  purchaseDate: Date;
  orderNumber?: string;
  category: string;
}

interface Subscription {
  serviceName: string;
  monthlyAmount: number;
  currency: string;
  frequency: 'weekly' | 'monthly' | 'yearly';
  lastRenewalDate: Date;
  isActive: boolean;
  category: 'streaming' | 'software' | 'news' | 'fitness' | 'other';
}

interface Newsletter {
  senderEmail: string;
  senderName: string;
  emailCount: number;
  lastEmailDate: Date;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'irregular';
  unsubscribeLink?: string;
  isPromotional: boolean;
}
```

---

### Utilities

```typescript
import {
  cleanEmailAddress,    // Clean and normalize email addresses
  stripHtml,            // Remove HTML tags from string
  extractDomain,        // Get domain from email address
  normalizeSubject,     // Normalize subject for thread matching
  formatFileSize,       // Human-readable file size
  formatDomainAsName,   // Convert domain to readable name
} from '@jacobkanfer/olm-parser';
```

---

## 📤 Publishing to npm

Follow these steps to publish the package to npm:

### 1. Create an npm Account

If you don't have one, create an account at [npmjs.com](https://www.npmjs.com/signup).

### 2. Login to npm

```bash
npm login
```

Enter your username, password, and email when prompted.

### 3. Update Package Name (Optional)

If `@jacobkanfer/olm-parser` is not your npm username, update the package name in `package.json`:

```json
{
  "name": "@yourusername/olm-parser"
}
```

Or use an unscoped name:

```json
{
  "name": "olm-email-parser"
}
```

### 4. Build the Package

```bash
cd /Users/jacobkanfer/Desktop/Code/OLMParser
npm install
npm run build
```

This creates the `dist/` folder with compiled JavaScript and TypeScript declarations.

### 5. Test Locally (Optional)

You can test the package locally before publishing:

```bash
# In OLMParser directory
npm link

# In another project
npm link @jacobkanfer/olm-parser
```

### 6. Publish to npm

```bash
# For scoped packages (@username/package)
npm publish --access public

# For unscoped packages
npm publish
```

### 7. Verify Publication

Visit your package page:
```
https://www.npmjs.com/package/@jacobkanfer/olm-parser
```

### 8. Update Version for Future Releases

```bash
# Patch release (1.0.0 -> 1.0.1)
npm version patch

# Minor release (1.0.0 -> 1.1.0)
npm version minor

# Major release (1.0.0 -> 2.0.0)
npm version major

# Then publish
npm publish --access public
```

---

## 🧪 Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test
```

---

## 📋 Supported Email Formats

| Format | Source | Extension | Support |
|--------|--------|-----------|---------|
| OLM | Outlook for Mac | `.olm` | ✅ Full |
| MBOX | Gmail Takeout | `.mbox` | ✅ Full |
| MBOX | Mozilla Thunderbird | `.mbox` | ✅ Full |
| MBOX | Apple Mail | `.mbox` | ✅ Full |

---

## 🔐 Privacy

This library processes all data **locally**. No email content is ever sent to external servers.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- Built with [TypeScript](https://www.typescriptlang.org/)
- Archive extraction powered by [JSZip](https://stuk.github.io/jszip/)
- Bundled with [tsup](https://tsup.egoist.dev/)

---

<div align="center">

**Made with ❤️ by [Jacob Kanfer](https://jacobkanfer.com)**

</div>


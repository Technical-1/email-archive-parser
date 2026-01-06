# 📖 API Reference

Detailed API documentation for [@technical-1/email-archive-parser](https://www.npmjs.com/package/@technical-1/email-archive-parser).

---

### Core Function

#### `parseArchive(file, options?)`

The primary function for parsing email archives with intelligent detection.

```typescript
function parseArchive(
  file: File | Buffer | ArrayBuffer,
  options?: ParseOptions
): Promise<ParseResult>
```

**Parameters:**
- `file`: Email archive file (OLM, MBOX, or Gmail export)
- `options`: Configuration options (see below)

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `onProgress` | `ProgressCallback` | - | Progress updates during parsing |
| `detectAccounts` | `boolean` | `false` | Detect account registrations |
| `detectPurchases` | `boolean` | `false` | Extract purchase confirmations |
| `detectSubscriptions` | `boolean` | `false` | Find recurring subscriptions |
| `detectNewsletters` | `boolean` | `false` | Identify newsletters & promotional emails |

**Returns:**
```typescript
interface ParseResult {
  emails: Email[];                    // Parsed email data
  contacts: Contact[];               // Extracted contacts
  calendarEvents: CalendarEvent[];   // Calendar events
  accounts?: Account[];              // Detected accounts
  purchases?: Purchase[];            // Purchase transactions
  subscriptions?: Subscription[];    // Subscription services
  newsletters?: Newsletter[];        // Newsletter sources
  stats: ParseStats;                // Comprehensive statistics
}
```

### Parsers

#### `OLMParser` - Outlook for Mac Archives

```typescript
import { OLMParser } from '@technical-1/email-archive-parser';

const parser = new OLMParser();

// Browser: Parse from File object
const result = await parser.parse(olmFile, {
  onProgress: (p) => console.log(p.message)
});

// Node.js: Parse from file path
const result = await parser.parseFile('/path/to/archive.olm', {
  onProgress: (p) => console.log(p.message)
});

// Check file type
if (OLMParser.isOLMFile(file)) {
  // Handle OLM file
}
```

**Features:**
- Full OLM archive parsing
- Email, contact, and calendar extraction
- **Automatic contact extraction from email senders**
- XML-based message parsing
- Automatic content type detection

#### `MBOXParser` - MBOX Archives

```typescript
import { MBOXParser } from '@technical-1/email-archive-parser';

const parser = new MBOXParser();

// Browser: Parse from File object (any size)
const result = await parser.parse(mboxFile, options);

// Node.js: Parse from file path with TRUE STREAMING (handles multi-GB files!)
const result = await parser.parseFile('/path/to/huge-archive.mbox', {
  onProgress: (p) => console.log(`${p.progress}%: ${p.message}`)
});

// Streaming for large files (>20MB)
const totalCount = await parser.parseStreaming(
  mboxFile,
  (progress) => console.log(progress.message),
  async (batch, batchNumber) => {
    // Process each batch of 100 emails
    console.log(`Batch ${batchNumber}: ${batch.length} emails`);
  }
);
```

**Features:**
- MBOX format support (Gmail, Thunderbird, Apple Mail)
- **Streaming processing** for 2GB+ files
- **Gmail label parsing** and folder mapping
- MIME multipart support
- Memory-efficient batch processing

**Gmail Label Support:**
```typescript
const parser = new MBOXParser();

// Parse Gmail labels from header
const labels = parser.parseGmailLabels('Inbox,Starred,"My Custom Label"');
// → ['inbox', 'starred', 'my custom label']

// Get folder IDs
const folders = parser.getAllFolderIdsFromLabels(labelsHeader);
// → ['inbox', 'my-custom-label']
```

### Detectors

#### `AccountDetector` - Service Account Detection

```typescript
import { AccountDetector } from '@technical-1/email-archive-parser';

const detector = new AccountDetector();

// Single email detection
const result = detector.detect(email);
// → { type: 'account', confidence: 85, data: { serviceName: 'Netflix', serviceType: 'streaming' } }

// Batch detection (deduplicated)
const accounts = detector.detectBatch(emails);

// Get all known services
const services = detector.getKnownServices();
// → [{ domain: 'netflix.com', name: 'Netflix', type: 'streaming' }, ...]
```

**Supported Services:** 100+ services including Netflix, GitHub, Amazon, PayPal, Slack, Zoom, etc.

#### `PurchaseDetector` - Transaction Detection

```typescript
import { PurchaseDetector } from '@technical-1/email-archive-parser';

const detector = new PurchaseDetector();

// Single email detection
const result = detector.detect(email);
// → { type: 'purchase', confidence: 90, data: { merchant: 'Amazon', amount: 49.99, currency: 'USD' } }

// Batch detection
const purchases = detector.detectBatch(emails);

// Get merchant category
const category = detector.getCategory('Amazon'); // 'ecommerce'
```

**Features:**
- Multi-currency support (USD, EUR, GBP, JPY, etc.)
- Order number extraction
- Merchant categorization
- Anti-pattern filtering (removes promotional emails)

#### `SubscriptionDetector` - Recurring Service Detection

```typescript
import { SubscriptionDetector } from '@technical-1/email-archive-parser';

const detector = new SubscriptionDetector();

// Single email detection
const result = detector.detect(email);
// → { isSubscription: true, serviceName: 'Spotify', amount: 9.99, frequency: 'monthly' }

// Batch detection (grouped by service)
const subscriptions = detector.detectBatch(emails);
```

**Features:**
- Billing frequency detection (weekly, monthly, yearly)
- Amount extraction and currency support
- Service categorization
- Active/inactive status tracking

#### `NewsletterDetector` - Newsletter & Promotional Detection

```typescript
import { NewsletterDetector } from '@technical-1/email-archive-parser';

const detector = new NewsletterDetector();

// Single email detection
const result = detector.detect(email);
// → { isNewsletter: true, confidence: 95, unsubscribeLink: 'https://...' }

// Batch detection (grouped by sender)
const newsletters = detector.detectBatch(emails);

// Categorize email
const category = detector.categorize(email); // 'newsletter' | 'promotional' | 'regular'
```

**Features:**
- Unsubscribe link extraction
- Sending frequency analysis (daily, weekly, monthly, irregular)
- Promotional vs informational classification
- Sender email analysis and deduplication

---

### Parsers

#### `OLMParser`

```typescript
import { OLMParser } from '@technical-1/email-archive-parser';

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
import { MBOXParser } from '@technical-1/email-archive-parser';

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
import { MBOXParser, type EmailBatchCallback } from '@technical-1/email-archive-parser';

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
import { AccountDetector } from '@technical-1/email-archive-parser';

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
import { PurchaseDetector } from '@technical-1/email-archive-parser';

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
import { SubscriptionDetector } from '@technical-1/email-archive-parser';

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
import { NewsletterDetector } from '@technical-1/email-archive-parser';

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

### Data Types

#### Core Email Structure

```typescript
interface Email {
  id?: number;              // Auto-generated ID
  subject: string;          // Email subject line
  sender: string;           // Sender email address
  senderName?: string;      // Sender display name
  recipients: string[];     // To/CC/BCC recipients
  date: Date;               // Send/receive date
  body: string;             // Plain text content
  htmlBody?: string;        // HTML content (if available)
  attachments: Attachment[]; // File attachments
  size: number;             // Email size in bytes
  isRead: boolean;          // Read/unread status
  isStarred: boolean;       // Starred/flagged status
  folderId: string;         // Folder/category (inbox, sent, spam, etc.)
  threadId?: string;        // Conversation thread ID
}

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;     // e.g., 'image/png', 'application/pdf'
  size: number;         // Size in bytes
  data?: string;        // Base64 encoded data (optional)
}
```

#### Detection Results

```typescript
interface Account {
  id?: number;
  serviceName: string;       // e.g., 'Netflix', 'GitHub'
  signupEmailId?: number;    // ID of signup confirmation email
  signupDate: Date;          // Account creation date
  serviceType: ServiceType;  // Category of service
  domain: string;           // Service domain (e.g., 'netflix.com')
  lastActivityDate?: Date;  // Last email activity
  emailCount: number;       // Total emails from this service
}

interface Purchase {
  id?: number;
  emailId?: number;         // Source email ID
  merchant: string;         // e.g., 'Amazon', 'Target'
  amount: number;           // Purchase amount
  currency: string;         // 'USD', 'EUR', 'GBP', etc.
  purchaseDate: Date;       // Transaction date
  orderNumber?: string;     // Order/confirmation number
  items: string[];          // Purchased items (if extractable)
  category: PurchaseCategory; // 'ecommerce', 'food', 'technology', etc.
}

interface Subscription {
  id?: number;
  serviceName: string;      // e.g., 'Spotify Premium', 'Adobe Creative Cloud'
  monthlyAmount: number;    // Normalized monthly cost
  currency: string;         // Billing currency
  frequency: SubscriptionFrequency; // 'weekly' | 'monthly' | 'yearly'
  lastRenewalDate: Date;    // Most recent billing date
  nextRenewalDate?: Date;   // Calculated next renewal
  emailIds: number[];       // Related email IDs
  isActive: boolean;        // Currently active
  category: SubscriptionCategory; // 'streaming', 'software', 'news', etc.
}

interface Newsletter {
  id?: number;
  senderEmail: string;      // Newsletter sender address
  senderName: string;       // Display name (e.g., 'TechCrunch', 'NYTimes')
  emailCount: number;       // Total emails received
  lastEmailDate: Date;      // Most recent email date
  frequency?: NewsletterFrequency; // 'daily' | 'weekly' | 'monthly' | 'irregular'
  unsubscribeLink?: string; // Unsubscribe URL (if found)
  isPromotional: boolean;   // Promotional vs informational
}
```

#### Type Definitions

```typescript
// Service categories
type ServiceType =
  | 'streaming' | 'ecommerce' | 'social' | 'banking'
  | 'communication' | 'development' | 'other';

// Purchase categories
type PurchaseCategory =
  | 'ecommerce' | 'technology' | 'payment' | 'entertainment'
  | 'food' | 'transportation' | 'travel' | 'home' | 'fashion'
  | 'beauty' | 'pets' | 'other';

// Subscription categories
type SubscriptionCategory = 'streaming' | 'software' | 'news' | 'fitness' | 'other';

// Frequency types
type SubscriptionFrequency = 'weekly' | 'monthly' | 'yearly';
type NewsletterFrequency = 'daily' | 'weekly' | 'monthly' | 'irregular';

// Progress tracking
interface ParseProgress {
  stage: ParsingStage;
  progress: number;      // 0-100 percentage
  message: string;       // Human-readable status
}

type ParsingStage =
  | 'extracting' | 'parsing_emails' | 'parsing_contacts'
  | 'parsing_calendar' | 'detecting' | 'complete';

// Detection results
interface AccountDetectionResult {
  type: 'account' | 'none';
  confidence: number;
  data?: { serviceName?: string; serviceType?: ServiceType };
}

interface PurchaseDetectionResult {
  type: 'purchase' | 'none';
  confidence: number;
  data?: { merchant?: string; amount?: number; currency?: string; orderNumber?: string };
}

interface SubscriptionDetectionResult {
  isSubscription: boolean;
  serviceName?: string;
  category?: SubscriptionCategory;
  amount?: number;
  currency?: string;
  frequency?: SubscriptionFrequency;
}

interface NewsletterDetectionResult {
  isNewsletter: boolean;
  isPromotional: boolean;
  confidence: number;
  unsubscribeLink?: string;
}
```

### Utilities

```typescript
import {
  // Email processing
  cleanEmailAddress,        // Normalize email addresses
  stripHtml,               // Remove HTML tags
  extractDomain,           // Get domain from email
  normalizeSubject,        // Standardize subject lines
  formatFileSize,          // Human-readable file sizes

  // Data formatting
  getInitials,             // Generate initials from names
  formatDomainAsName,      // Convert domain to readable name

  // Encoding
  decodeQuotedPrintable,   // Decode QP encoding
  decodeHeaderValue,       // Decode RFC 2047 headers
  parseDate,              // Parse various date formats
} from '@technical-1/email-archive-parser';
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
} from '@technical-1/email-archive-parser';
```

---

## ⚡ Advanced Features

### Memory-Efficient Streaming

For processing large email archives without memory constraints:

```typescript
import { MBOXParser } from '@technical-1/email-archive-parser';

const parser = new MBOXParser();

// Process 2GB Gmail export in chunks
const emailCount = await parser.parseStreaming(
  gmailFile,
  (progress) => console.log(`${progress.progress}% processed`),
  async (batch, batchNum) => {
    // Each batch contains ~100 emails
    const accounts = accountDetector.detectBatch(batch);
    const purchases = purchaseDetector.detectBatch(batch);

    // Save to database or process incrementally
    await saveBatchToDatabase(batch, accounts, purchases);
  }
);

console.log(`Processed ${emailCount} emails efficiently`);
```

### Real-Time Progress Tracking

```typescript
const result = await parseArchive(file, {
  onProgress: (progress) => {
    // Update UI with detailed progress
    switch (progress.stage) {
      case 'extracting':
        updateStatus(`Extracting archive... ${progress.progress}%`);
        break;
      case 'parsing_emails':
        updateProgressBar(progress.progress);
        updateStatus(`Parsing emails: ${progress.message}`);
        break;
      case 'detecting':
        updateStatus(`Running AI detection... ${progress.progress}%`);
        break;
    }
  }
});
```

### Custom Detection Rules

Extend detectors with custom logic:

```typescript
import { AccountDetector } from '@technical-1/email-archive-parser';

class CustomAccountDetector extends AccountDetector {
  detect(email: Email) {
    // Custom detection logic
    const customServices = ['mycompany.com', 'internal-service.com'];

    if (customServices.some(domain => email.sender.includes(domain))) {
      return {
        type: 'account' as const,
        confidence: 95,
        data: {
          serviceName: 'Custom Service',
          serviceType: 'other' as const
        }
      };
    }

    // Fall back to parent detection
    return super.detect(email);
  }
}
```

### Batch Processing Strategies

```typescript
// Strategy 1: Memory-efficient processing
const result = await parseArchive(largeFile, {
  detectPurchases: true,
  onProgress: (p) => console.log(p.message)
});

// Strategy 2: Selective detection for large files
const basicResult = await parseArchive(largeFile); // No detection
const purchases = purchaseDetector.detectBatch(basicResult.emails.slice(0, 10000));

// Strategy 3: Incremental processing with database
let offset = 0;
const batchSize = 5000;

while (offset < basicResult.emails.length) {
  const batch = basicResult.emails.slice(offset, offset + batchSize);
  const batchPurchases = purchaseDetector.detectBatch(batch);

  await savePurchasesToDatabase(batchPurchases);
  offset += batchSize;
}
```

---

---

## 🎯 Use Cases

### Personal Finance Management
```typescript
import { parseArchive, PurchaseDetector } from '@technical-1/email-archive-parser';

// Analyze spending patterns from Gmail export
const result = await parseArchive(gmailExport, {
  detectPurchases: true,
  detectSubscriptions: true
});

// Get monthly spending by category
const monthlySpending = result.purchases?.reduce((acc, purchase) => {
  const month = purchase.purchaseDate.toISOString().slice(0, 7);
  acc[month] = (acc[month] || 0) + purchase.amount;
  return acc;
}, {});

console.log('Monthly spending:', monthlySpending);
```

### Account Inventory & Security Audit
```typescript
import { parseArchive, AccountDetector, SubscriptionDetector } from '@technical-1/email-archive-parser';

// Complete account and subscription inventory
const result = await parseArchive(emailArchive, {
  detectAccounts: true,
  detectSubscriptions: true
});

// Security audit: find accounts you might have forgotten
const oldAccounts = result.accounts?.filter(account =>
  account.signupDate < new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
);

console.log(`Found ${oldAccounts?.length} accounts older than 1 year`);
```

### Email Organization & Cleanup
```typescript
import { parseArchive, NewsletterDetector } from '@technical-1/email-archive-parser';

// Identify newsletter subscriptions for cleanup
const result = await parseArchive(emailArchive, {
  detectNewsletters: true
});

// Group newsletters by frequency
const newslettersByFreq = result.newsletters?.reduce((acc, newsletter) => {
  const freq = newsletter.frequency || 'unknown';
  acc[freq] = (acc[freq] || 0) + 1;
  return acc;
}, {});

console.log('Newsletter frequency distribution:', newslettersByFreq);
```

### Business Intelligence & Analytics
```typescript
import { parseArchive } from '@technical-1/email-archive-parser';

// Extract business insights from email archives
const result = await parseArchive(companyEmails, {
  detectPurchases: true,
  detectAccounts: true
});

// Analyze vendor spending
const vendorSpending = result.purchases?.reduce((acc, purchase) => {
  acc[purchase.merchant] = (acc[purchase.merchant] || 0) + purchase.amount;
  return acc;
}, {});

// Top 5 vendors by spending
const topVendors = Object.entries(vendorSpending || {})
  .sort(([,a], [,b]) => b - a)
  .slice(0, 5);

console.log('Top spending vendors:', topVendors);
```

### Research & Data Analysis
```typescript
import { parseArchive } from '@technical-1/email-archive-parser';

// Academic research: analyze email communication patterns
const result = await parseArchive(researchEmails);

// Email volume by month
const emailVolume = result.emails.reduce((acc, email) => {
  const month = email.date.toISOString().slice(0, 7);
  acc[month] = (acc[month] || 0) + 1;
  return acc;
}, {});

// Most active correspondents
const topSenders = result.emails.reduce((acc, email) => {
  acc[email.sender] = (acc[email.sender] || 0) + 1;
  return acc;
}, {});

const sortedSenders = Object.entries(topSenders)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 10);

console.log('Most active email correspondents:', sortedSenders);
```

---

### One-Line Archive Analysis

```typescript
import { parseArchive } from '@technical-1/email-archive-parser';

// Parse any email archive with full detection
const result = await parseArchive(file, {
  detectAccounts: true,
  detectPurchases: true,
  detectSubscriptions: true,
  detectNewsletters: true,
  onProgress: (progress) => console.log(`${progress.progress}% - ${progress.message}`)
});

// Get comprehensive insights
console.log(`
📊 Analysis Complete:
   📧 ${result.stats.emailCount} emails parsed
   🔍 ${result.stats.accountCount} accounts detected
   🛒 ${result.stats.purchaseCount} purchases found
   🔄 ${result.stats.subscriptionCount} subscriptions identified
   📰 ${result.stats.newsletterCount} newsletter sources
`);
```

### Browser File Upload

```typescript
import { parseArchive } from '@technical-1/email-archive-parser';

const fileInput = document.querySelector('input[type="file"]');
const resultsDiv = document.querySelector('#results');

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Show progress
  const result = await parseArchive(file, {
    detectAccounts: true,
    detectPurchases: true,
    detectSubscriptions: true,
    detectNewsletters: true,
    onProgress: (progress) => {
      resultsDiv.textContent = `${progress.progress}% - ${progress.message}`;
    }
  });

  // Display results
  resultsDiv.innerHTML = `
    <h3>Analysis Results</h3>
    <p>📧 ${result.stats.emailCount} emails parsed</p>
    <p>🔍 ${result.stats.accountCount} accounts found</p>
    <p>🛒 ${result.stats.purchaseCount} purchases detected</p>
    <p>🔄 ${result.stats.subscriptionCount} subscriptions active</p>
    <p>📰 ${result.stats.newsletterCount} newsletters identified</p>
  `;
});
```

### Node.js Processing

```typescript
import { readFileSync } from 'fs';
import { parseArchive } from '@technical-1/email-archive-parser';

// Handle large files efficiently
const buffer = readFileSync('gmail-takeout.mbox');
const result = await parseArchive(buffer, {
  detectPurchases: true,
  detectSubscriptions: true
});

// Analyze spending patterns
const totalSpent = result.purchases?.reduce((sum, p) => sum + p.amount, 0) || 0;
const monthlySubs = result.subscriptions?.reduce((sum, s) => sum + s.monthlyAmount, 0) || 0;

console.log(`💰 Total spent: $${totalSpent.toFixed(2)}`);
console.log(`🔄 Monthly subscriptions: $${monthlySubs.toFixed(2)}`);
```

### Advanced Streaming (Large Files)

```typescript
import { MBOXParser } from '@technical-1/email-archive-parser';

// Process 2GB+ files without memory issues
const parser = new MBOXParser();
let processedCount = 0;

const totalEmails = await parser.parseStreaming(
  file, // 2GB+ file
  (progress) => console.log(`📊 ${progress.progress}% - ${progress.message}`),
  async (batch, batchNumber) => {
    processedCount += batch.length;

    // Process batch (e.g., save to database, analyze, etc.)
    console.log(`🔄 Batch ${batchNumber}: ${batch.length} emails`);

    // Example: Real-time purchase detection
    const purchaseDetector = new PurchaseDetector();
    const purchases = purchaseDetector.detectBatch(batch);
    purchases.forEach(purchase => {
      console.log(`💳 Found purchase: $${purchase.amount} at ${purchase.merchant}`);
    });
  }
);

console.log(`✅ Processed ${processedCount} emails from large archive`);
```

### Individual Component Usage

```typescript
import {
  OLMParser, MBOXParser,
  AccountDetector, PurchaseDetector,
  SubscriptionDetector, NewsletterDetector
} from '@technical-1/email-archive-parser';

// Parse different archive types
const olmParser = new OLMParser();
const mboxParser = new MBOXParser();

const olmResult = await olmParser.parse(olmFile);
const mboxResult = await mboxParser.parse(mboxFile);

// Advanced detection with custom logic
const accountDetector = new AccountDetector();
const purchaseDetector = new PurchaseDetector();

// Fine-grained control
for (const email of olmResult.emails) {
  const accountResult = accountDetector.detect(email);
  if (accountResult.confidence > 80) {
    console.log(`🎯 High confidence account: ${accountResult.data?.serviceName}`);
  }
}

// Batch processing for efficiency
const allPurchases = purchaseDetector.detectBatch(mboxResult.emails);
const highValuePurchases = allPurchases.filter(p => p.amount > 100);

console.log(`💎 Found ${highValuePurchases.length} high-value purchases`);
```

---

## 🔧 Integration Examples

### React Web Application

```typescript
import React, { useState } from 'react';
import { parseArchive } from '@technical-1/email-archive-parser';

function EmailAnalyzer() {
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState(0);

  const handleFileUpload = async (file) => {
    const result = await parseArchive(file, {
      detectAccounts: true,
      detectPurchases: true,
      onProgress: (p) => setProgress(p.progress)
    });
    setResults(result);
  };

  return (
    <div>
      <input type="file" onChange={(e) => handleFileUpload(e.target.files[0])} />
      {progress > 0 && <div>Progress: {progress}%</div>}
      {results && (
        <div>
          <h3>Analysis Results</h3>
          <p>Emails: {results.stats.emailCount}</p>
          <p>Accounts: {results.stats.accountCount}</p>
          <p>Purchases: {results.stats.purchaseCount}</p>
        </div>
      )}
    </div>
  );
}
```

### Node.js CLI Tool

```typescript
#!/usr/bin/env node
import { readFileSync } from 'fs';
import { parseArchive } from '@technical-1/email-archive-parser';

const filePath = process.argv[2];
if (!filePath) {
  console.log('Usage: email-analyzer <file>');
  process.exit(1);
}

console.log('🔍 Analyzing email archive...');

const buffer = readFileSync(filePath);
const result = await parseArchive(buffer, {
  detectAccounts: true,
  detectPurchases: true,
  detectSubscriptions: true,
  detectNewsletters: true,
  onProgress: (p) => {
    process.stdout.write(`\r${p.progress}% - ${p.message}`);
  }
});

console.log('\n\n📊 Results:');
console.log(`   Emails: ${result.stats.emailCount}`);
console.log(`   Accounts: ${result.stats.accountCount}`);
console.log(`   Purchases: ${result.stats.purchaseCount}`);
console.log(`   Subscriptions: ${result.stats.subscriptionCount}`);
console.log(`   Newsletters: ${result.stats.newsletterCount}`);
```

### Database Integration

```typescript
import { parseArchive } from '@technical-1/email-archive-parser';
import { createConnection } from 'mysql2/promise';

const connection = await createConnection({
  host: 'localhost',
  user: 'email_user',
  database: 'email_analysis'
});

const result = await parseArchive(emailFile, {
  detectPurchases: true,
  detectAccounts: true
});

// Store results in database
await connection.execute(
  'INSERT INTO analysis_results (email_count, account_count, purchase_count) VALUES (?, ?, ?)',
  [result.stats.emailCount, result.stats.accountCount, result.stats.purchaseCount]
);

// Store purchases
for (const purchase of result.purchases || []) {
  await connection.execute(
    'INSERT INTO purchases (merchant, amount, currency, date) VALUES (?, ?, ?, ?)',
    [purchase.merchant, purchase.amount, purchase.currency, purchase.purchaseDate]
  );
}
```

---

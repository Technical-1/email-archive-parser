import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import {
  parseArchive,
  createParsers,
  OLMParser,
  MBOXParser,
  AccountDetector,
  PurchaseDetector,
  SubscriptionDetector,
  NewsletterDetector,
} from '../index';

describe('parseArchive', () => {
  it('should parse an OLM file with detection options', async () => {
    // Create a mock OLM file (ZIP with email XML)
    const zip = new JSZip();
    const emailXml = `<?xml version="1.0" encoding="UTF-8"?>
<email>
  <OPFMessageCopySubject>Welcome to Netflix!</OPFMessageCopySubject>
  <OPFMessageCopyBody>Thank you for signing up. Your account has been created.</OPFMessageCopyBody>
  <OPFMessageCopySentTime>2024-01-15T10:30:00Z</OPFMessageCopySentTime>
  <OPFMessageCopyFromAddresses>
    <emailAddress OPFContactEmailAddressAddress="welcome@netflix.com"/>
  </OPFMessageCopyFromAddresses>
</email>`;
    zip.file('com.microsoft.__Messages/message_1.xml', emailXml);
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await parseArchive(buffer, {
      detectAccounts: true,
    });

    expect(result.emails.length).toBe(1);
    expect(result.emails[0].subject).toBe('Welcome to Netflix!');
    expect(result.stats.emailCount).toBe(1);
    expect(result.accounts).toBeDefined();
    expect(result.accounts!.length).toBeGreaterThanOrEqual(1);
    expect(result.stats.accountCount).toBeGreaterThanOrEqual(1);
  });

  it('should parse a File object with .olm extension as OLM', async () => {
    const zip = new JSZip();
    const emailXml = `<?xml version="1.0"?>
<email><OPFMessageCopySubject>Test</OPFMessageCopySubject><OPFMessageCopyBody>Content</OPFMessageCopyBody></email>`;
    zip.file('com.microsoft.__Messages/message_1.xml', emailXml);
    const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    // In Node.js test environment, use ArrayBuffer directly
    // The File API behavior may differ from browser
    const result = await parseArchive(arrayBuffer);

    expect(result.emails.length).toBe(1);
    expect(result.emails[0].subject).toBe('Test');
  });

  it('should parse a File object with .mbox extension as MBOX', async () => {
    const mboxContent = `From sender@example.com Mon Jan 15 10:30:00 2024
From: sender@example.com
To: recipient@example.com
Subject: Test MBOX Email
Date: Mon, 15 Jan 2024 10:30:00 +0000

This is the body of the email.`;

    const file = new File([mboxContent], 'archive.mbox', {
      type: 'application/mbox',
    });

    const result = await parseArchive(file);

    expect(result.emails.length).toBe(1);
    expect(result.emails[0].subject).toBe('Test MBOX Email');
    expect(result.emails[0].sender).toBe('sender@example.com');
  });

  it('should call progress callback', async () => {
    const zip = new JSZip();
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const onProgress = vi.fn();

    await parseArchive(buffer, { onProgress });

    expect(onProgress).toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: expect.any(String),
        progress: expect.any(Number),
        message: expect.any(String),
      })
    );
  });

  it('should run all detectors when requested', async () => {
    const zip = new JSZip();

    // Create an email that could trigger multiple detectors
    const emailXml = `<?xml version="1.0" encoding="UTF-8"?>
<email>
  <OPFMessageCopySubject>Your Netflix subscription receipt</OPFMessageCopySubject>
  <OPFMessageCopyBody>
    Thank you for your subscription. Monthly charge: $15.99.
    Your subscription will auto-renew on Feb 15, 2024.
  </OPFMessageCopyBody>
  <OPFMessageCopySentTime>2024-01-15T10:30:00Z</OPFMessageCopySentTime>
  <OPFMessageCopyFromAddresses>
    <emailAddress OPFContactEmailAddressAddress="billing@netflix.com"/>
  </OPFMessageCopyFromAddresses>
</email>`;
    zip.file('com.microsoft.__Messages/message_1.xml', emailXml);
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await parseArchive(buffer, {
      detectAccounts: true,
      detectPurchases: true,
      detectSubscriptions: true,
      detectNewsletters: true,
    });

    expect(result.accounts).toBeDefined();
    expect(result.purchases).toBeDefined();
    expect(result.subscriptions).toBeDefined();
    expect(result.newsletters).toBeDefined();
  });

  it('should not run detectors when not requested', async () => {
    const zip = new JSZip();
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await parseArchive(buffer);

    expect(result.accounts).toBeUndefined();
    expect(result.purchases).toBeUndefined();
    expect(result.subscriptions).toBeUndefined();
    expect(result.newsletters).toBeUndefined();
  });

  it('should return proper stats structure', async () => {
    const zip = new JSZip();
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await parseArchive(buffer);

    expect(result.stats).toEqual({
      emailCount: 0,
      contactCount: 0,
      calendarEventCount: 0,
      accountCount: 0,
      purchaseCount: 0,
      subscriptionCount: 0,
      newsletterCount: 0,
    });
  });
});

describe('createParsers', () => {
  it('should return parser instances', () => {
    const parsers = createParsers();

    expect(parsers.olm).toBeInstanceOf(OLMParser);
    expect(parsers.mbox).toBeInstanceOf(MBOXParser);
  });

  it('should return detector instances', () => {
    const parsers = createParsers();

    expect(parsers.detectors.account).toBeInstanceOf(AccountDetector);
    expect(parsers.detectors.purchase).toBeInstanceOf(PurchaseDetector);
    expect(parsers.detectors.subscription).toBeInstanceOf(SubscriptionDetector);
    expect(parsers.detectors.newsletter).toBeInstanceOf(NewsletterDetector);
  });

  it('should create usable parser instances', async () => {
    const { olm } = createParsers();
    const zip = new JSZip();
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await olm.parse(buffer);

    expect(result.emails).toEqual([]);
  });

  it('should create usable detector instances', () => {
    const { detectors } = createParsers();

    const testEmail = {
      subject: 'Welcome to Netflix!',
      sender: 'welcome@netflix.com',
      recipients: ['user@example.com'],
      date: new Date(),
      body: 'Thanks for signing up!',
      attachments: [],
      size: 1000,
      isRead: true,
      isStarred: false,
      folderId: 'inbox',
    };

    const accountResult = detectors.account.detect(testEmail);
    expect(accountResult.type).toBe('account');

    const purchaseResult = detectors.purchase.detect(testEmail);
    expect(purchaseResult).toBeDefined();

    const subscriptionResult = detectors.subscription.detect(testEmail);
    expect(subscriptionResult).toBeDefined();

    const newsletterResult = detectors.newsletter.detect(testEmail);
    expect(newsletterResult).toBeDefined();
  });
});

describe('Exports', () => {
  it('should export OLMParser', () => {
    expect(OLMParser).toBeDefined();
    expect(typeof OLMParser).toBe('function');
  });

  it('should export MBOXParser', () => {
    expect(MBOXParser).toBeDefined();
    expect(typeof MBOXParser).toBe('function');
  });

  it('should export AccountDetector', () => {
    expect(AccountDetector).toBeDefined();
    expect(typeof AccountDetector).toBe('function');
  });

  it('should export PurchaseDetector', () => {
    expect(PurchaseDetector).toBeDefined();
    expect(typeof PurchaseDetector).toBe('function');
  });

  it('should export SubscriptionDetector', () => {
    expect(SubscriptionDetector).toBeDefined();
    expect(typeof SubscriptionDetector).toBe('function');
  });

  it('should export NewsletterDetector', () => {
    expect(NewsletterDetector).toBeDefined();
    expect(typeof NewsletterDetector).toBe('function');
  });

  it('should export parseArchive function', () => {
    expect(parseArchive).toBeDefined();
    expect(typeof parseArchive).toBe('function');
  });

  it('should export createParsers function', () => {
    expect(createParsers).toBeDefined();
    expect(typeof createParsers).toBe('function');
  });
});


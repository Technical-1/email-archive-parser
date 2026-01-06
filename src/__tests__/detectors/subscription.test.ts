import { describe, it, expect } from 'vitest';
import { SubscriptionDetector } from '../../detectors/subscription';
import type { Email } from '../../types';

// Helper to create test emails
function createEmail(overrides: Partial<Email> = {}): Email {
  return {
    subject: 'Test Subject',
    sender: 'test@example.com',
    recipients: ['recipient@example.com'],
    date: new Date('2024-01-15'),
    body: 'Test body content',
    attachments: [],
    size: 1000,
    isRead: true,
    isStarred: false,
    folderId: 'inbox',
    ...overrides,
  };
}

describe('SubscriptionDetector', () => {
  describe('detect', () => {
    it('should detect subscription confirmation emails', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        subject: 'Subscription confirmed',
        sender: 'billing@netflix.com',
        body: 'Thank you for subscribing to Netflix. Your monthly subscription is $15.99/month. Next billing date: Feb 15.',
      });

      const result = detector.detect(email);

      expect(result.isSubscription).toBe(true);
      expect(result.serviceName).toBe('Netflix');
      expect(result.category).toBe('streaming');
    });

    it('should detect subscription renewal emails', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        subject: 'Subscription renewal receipt',
        sender: 'billing@spotify.com',
        body: 'Your Spotify Premium subscription has been renewed. Billing period: Jan 1 - Jan 31. Next billing date: Feb 15, 2024.',
      });

      const result = detector.detect(email);

      expect(result.isSubscription).toBe(true);
      expect(result.serviceName).toBe('Spotify');
    });

    it('should detect monthly subscription billing', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        subject: 'Your monthly billing statement',
        sender: 'billing@service.com',
        body: 'Billing period: Jan 1 - Jan 31. Monthly subscription: $9.99',
      });

      const result = detector.detect(email);

      expect(result.isSubscription).toBe(true);
      expect(result.frequency).toBe('monthly');
      expect(result.amount).toBe(9.99);
    });

    it('should detect yearly/annual subscriptions', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        subject: 'Your annual subscription receipt',
        sender: 'billing@adobe.com',
        body: 'Adobe Creative Cloud yearly subscription: $599.99 per year',
      });

      const result = detector.detect(email);

      expect(result.isSubscription).toBe(true);
      expect(result.frequency).toBe('yearly');
    });

    it('should detect auto-renewal emails', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        subject: 'Your subscription will auto-renew',
        sender: 'noreply@service.com',
        body: 'Your subscription auto-renews on Feb 1, 2024.',
      });

      const result = detector.detect(email);

      expect(result.isSubscription).toBe(true);
    });

    it('should detect recurring payment emails', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        subject: 'Recurring payment processed',
        sender: 'payments@example.com',
        body: 'Your recurring charge of $12.99 has been processed.',
      });

      const result = detector.detect(email);

      expect(result.isSubscription).toBe(true);
      expect(result.amount).toBe(12.99);
    });

    it('should detect known subscription services', () => {
      const detector = new SubscriptionDetector();
      const knownServices = [
        { domain: 'hulu.com', name: 'Hulu', category: 'streaming' },
        { domain: 'dropbox.com', name: 'Dropbox', category: 'software' },
        { domain: 'nytimes.com', name: 'New York Times', category: 'news' },
        { domain: 'peloton.com', name: 'Peloton', category: 'fitness' },
      ];

      for (const service of knownServices) {
        const email = createEmail({
          subject: 'Your subscription receipt',
          sender: `billing@${service.domain}`,
          body: 'Monthly subscription: $14.99',
        });

        const result = detector.detect(email);

        expect(result.isSubscription).toBe(true);
        expect(result.serviceName).toBe(service.name);
        expect(result.category).toBe(service.category);
      }
    });

    it('should extract USD amounts', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        subject: 'Subscription renewed',
        sender: 'billing@service.com',
        body: 'Amount charged: $19.99',
      });

      const result = detector.detect(email);

      expect(result.amount).toBe(19.99);
      expect(result.currency).toBe('USD');
    });

    it('should extract EUR amounts', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        subject: 'Subscription renewal receipt',
        sender: 'billing@netflix.com',
        body: 'Billing period: Jan 1 - Jan 31. Amount charged: €14.99. Next billing date: Feb 1.',
      });

      const result = detector.detect(email);

      expect(result.amount).toBe(14.99);
      expect(result.currency).toBe('EUR');
    });

    it('should extract GBP amounts', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        subject: 'Subscription renewed',
        sender: 'billing@service.co.uk',
        body: 'Amount charged: £9.99',
      });

      const result = detector.detect(email);

      expect(result.amount).toBe(9.99);
      expect(result.currency).toBe('GBP');
    });

    it('should return isSubscription false for regular emails', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        subject: 'Weekly newsletter',
        sender: 'newsletter@blog.com',
        body: 'Check out our latest articles!',
      });

      const result = detector.detect(email);

      expect(result.isSubscription).toBe(false);
    });

    it('should extract service name from subject', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        subject: 'Your Netflix subscription is active',
        sender: 'billing@netflix.com',
        body: 'Thank you for subscribing. Monthly subscription: $29.99. Next billing date: Feb 1.',
      });

      const result = detector.detect(email);

      expect(result.isSubscription).toBe(true);
      expect(result.serviceName).toBe('Netflix');
    });

    it('should use sender name when service name cannot be extracted', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        subject: 'Your subscription receipt',
        sender: 'billing@unknownservice.com',
        senderName: 'Unknown Service',
        body: 'Monthly charge: $5.99. Next billing date: Feb 1.',
      });

      const result = detector.detect(email);

      expect(result.isSubscription).toBe(true);
      expect(result.serviceName).toBeDefined();
    });
  });

  describe('detectBatch', () => {
    it('should detect subscriptions from multiple emails', () => {
      const detector = new SubscriptionDetector();
      const emails = [
        createEmail({
          id: 1,
          subject: 'Subscription renewal receipt',
          sender: 'billing@netflix.com',
          body: 'Your Netflix subscription has been renewed. Monthly subscription: $15.99. Next billing date: Feb 15.',
          date: new Date('2024-01-15'),
        }),
        createEmail({
          id: 2,
          subject: 'Subscription billing receipt',
          sender: 'payments@spotify.com',
          body: 'Your Spotify Premium subscription. Billing period: Jan 1 - Jan 31. Monthly: $9.99. Next billing date: Feb 1.',
          date: new Date('2024-01-10'),
        }),
        createEmail({
          id: 3,
          subject: 'Hello',
          sender: 'friend@example.com',
        }),
      ];

      const subscriptions = detector.detectBatch(emails);

      expect(subscriptions.length).toBe(2);
      expect(subscriptions.map((s) => s.serviceName)).toContain('Netflix');
      expect(subscriptions.map((s) => s.serviceName)).toContain('Spotify');
    });

    it('should group multiple emails for same subscription', () => {
      const detector = new SubscriptionDetector();
      const emails = [
        createEmail({
          id: 1,
          subject: 'Netflix subscription renewed',
          sender: 'billing@netflix.com',
          body: 'Monthly: $15.99',
          date: new Date('2024-01-15'),
        }),
        createEmail({
          id: 2,
          subject: 'Netflix billing receipt',
          sender: 'billing@netflix.com',
          body: 'Monthly charge: $15.99',
          date: new Date('2024-02-15'),
        }),
        createEmail({
          id: 3,
          subject: 'Netflix payment processed',
          sender: 'payments@netflix.com',
          body: 'Monthly subscription: $15.99',
          date: new Date('2024-03-15'),
        }),
      ];

      const subscriptions = detector.detectBatch(emails);

      const netflix = subscriptions.find(
        (s) => s.serviceName.toLowerCase() === 'netflix'
      );
      expect(netflix).toBeDefined();
      expect(netflix?.emailIds.length).toBeGreaterThan(1);
    });

    it('should use most recent email for renewal date', () => {
      const detector = new SubscriptionDetector();
      const emails = [
        createEmail({
          id: 1,
          subject: 'Subscription renewed',
          sender: 'billing@netflix.com',
          body: 'Monthly: $15.99',
          date: new Date('2024-01-15'),
        }),
        createEmail({
          id: 2,
          subject: 'Subscription renewed',
          sender: 'billing@netflix.com',
          body: 'Monthly: $17.99',
          date: new Date('2024-03-15'),
        }),
      ];

      const subscriptions = detector.detectBatch(emails);

      expect(subscriptions[0].lastRenewalDate).toEqual(new Date('2024-03-15'));
      expect(subscriptions[0].monthlyAmount).toBe(17.99);
    });

    it('should return empty array for no subscriptions', () => {
      const detector = new SubscriptionDetector();
      const emails = [
        createEmail({ subject: 'Hello' }),
        createEmail({ subject: 'Meeting invite' }),
      ];

      const subscriptions = detector.detectBatch(emails);

      expect(subscriptions).toEqual([]);
    });

    it('should mark subscriptions as active', () => {
      const detector = new SubscriptionDetector();
      const emails = [
        createEmail({
          id: 1,
          subject: 'Subscription renewed',
          sender: 'billing@service.com',
          body: 'Monthly: $9.99',
          date: new Date(),
        }),
      ];

      const subscriptions = detector.detectBatch(emails);

      expect(subscriptions[0].isActive).toBe(true);
    });
  });

  describe('getKnownServices', () => {
    it('should return list of known subscription services', () => {
      const detector = new SubscriptionDetector();
      const services = detector.getKnownServices();

      expect(Array.isArray(services)).toBe(true);
      expect(services.length).toBeGreaterThan(20);

      const netflix = services.find((s) => s.name === 'Netflix');
      expect(netflix).toBeDefined();
      expect(netflix?.domain).toBe('netflix.com');
      expect(netflix?.category).toBe('streaming');
    });

    it('should include various categories', () => {
      const detector = new SubscriptionDetector();
      const services = detector.getKnownServices();

      const categories = new Set(services.map((s) => s.category));
      expect(categories.has('streaming')).toBe(true);
      expect(categories.has('software')).toBe(true);
      expect(categories.has('news')).toBe(true);
      expect(categories.has('fitness')).toBe(true);
    });
  });
});


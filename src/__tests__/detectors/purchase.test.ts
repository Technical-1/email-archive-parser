import { describe, it, expect } from 'vitest';
import { PurchaseDetector } from '../../detectors/purchase';
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

describe('PurchaseDetector', () => {
  describe('detect', () => {
    it('should detect order confirmation emails', () => {
      const detector = new PurchaseDetector();
      const email = createEmail({
        subject: 'Your order confirmation #12345',
        sender: 'orders@amazon.com',
        body: 'Thank you for your order. Order total: $49.99',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('purchase');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.data?.merchant).toBe('Amazon');
      expect(result.data?.amount).toBe(49.99);
      expect(result.data?.currency).toBe('USD');
    });

    it('should detect receipt emails', () => {
      const detector = new PurchaseDetector();
      const email = createEmail({
        subject: 'Receipt from Apple',
        sender: 'no_reply@email.apple.com',
        body: 'Your receipt. Total: $9.99',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('purchase');
      expect(result.data?.amount).toBe(9.99);
    });

    it('should detect payment confirmations', () => {
      const detector = new PurchaseDetector();
      const email = createEmail({
        subject: 'Payment received',
        sender: 'service@paypal.com',
        body: 'You paid $25.00 to Merchant.',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('purchase');
      expect(result.data?.merchant).toBe('PayPal');
    });

    it('should extract EUR amounts', () => {
      const detector = new PurchaseDetector();
      const email = createEmail({
        subject: 'Order confirmation',
        sender: 'orders@store.de',
        body: 'Order total: €29,99',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('purchase');
      expect(result.data?.amount).toBe(29.99);
      expect(result.data?.currency).toBe('EUR');
    });

    it('should extract GBP amounts', () => {
      const detector = new PurchaseDetector();
      const email = createEmail({
        subject: 'Your order confirmation',
        sender: 'orders@amazon.co.uk',
        body: 'Thank you for your order. Order total: £19.99. Your order has been confirmed.',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('purchase');
      expect(result.data?.amount).toBe(19.99);
      expect(result.data?.currency).toBe('GBP');
    });

    it('should extract order numbers', () => {
      const detector = new PurchaseDetector();
      const email = createEmail({
        subject: 'Order confirmation',
        sender: 'orders@amazon.com',
        body: 'Order Number: ABC-123456-XYZ\nOrder total: $99.99',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('purchase');
      expect(result.data?.orderNumber).toBe('ABC-123456-XYZ');
    });

    it('should reject promotional emails with anti-patterns', () => {
      const detector = new PurchaseDetector();
      const email = createEmail({
        subject: 'Save $50 on your next order!',
        sender: 'promo@store.com',
        body: 'Up to 50% off! Free shipping! Limited time offer! Shop now! Subscribe for deals! Unsubscribe here.',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('none');
    });

    it('should return none for regular emails', () => {
      const detector = new PurchaseDetector();
      const email = createEmail({
        subject: 'Meeting invitation',
        sender: 'colleague@company.com',
        body: 'Can we meet at 3pm?',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('none');
    });

    it('should detect shipping confirmation emails', () => {
      const detector = new PurchaseDetector();
      const email = createEmail({
        subject: 'Shipping confirmation',
        sender: 'shipping@amazon.com',
        body: 'Your order has shipped. Total charged: $34.99',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('purchase');
    });

    it('should detect invoice emails', () => {
      const detector = new PurchaseDetector();
      const email = createEmail({
        subject: 'Invoice #INV-2024-001',
        sender: 'billing@service.com',
        body: 'Invoice for your purchase. Amount charged: $149.99',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('purchase');
      expect(result.data?.amount).toBe(149.99);
    });

    it('should handle amounts with thousands separator', () => {
      const detector = new PurchaseDetector();
      const email = createEmail({
        subject: 'Order confirmation',
        sender: 'orders@store.com',
        body: 'Order total: $1,234.56',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('purchase');
      expect(result.data?.amount).toBe(1234.56);
    });

    it('should detect known merchants by domain', () => {
      const detector = new PurchaseDetector();
      const knownMerchants = [
        { domain: 'ebay.com', name: 'eBay' },
        { domain: 'target.com', name: 'Target' },
        { domain: 'bestbuy.com', name: 'Best Buy' },
        { domain: 'uber.com', name: 'Uber' },
      ];

      for (const merchant of knownMerchants) {
        const email = createEmail({
          subject: 'Your order confirmation',
          sender: `orders@${merchant.domain}`,
          body: 'Thank you for your purchase. Total: $29.99',
        });

        const result = detector.detect(email);

        expect(result.type).toBe('purchase');
        expect(result.data?.merchant).toBe(merchant.name);
      }
    });

    it('should reject CSS-like order numbers', () => {
      const detector = new PurchaseDetector();
      const email = createEmail({
        subject: 'Order confirmation',
        sender: 'orders@store.com',
        body: 'Order Number: border-collapse\nTotal: $50.00',
      });

      const result = detector.detect(email);

      // Should still detect purchase but order number should be undefined
      if (result.type === 'purchase') {
        expect(result.data?.orderNumber).toBeUndefined();
      }
    });
  });

  describe('detectBatch', () => {
    it('should detect purchases from multiple emails', () => {
      const detector = new PurchaseDetector();
      const emails = [
        createEmail({
          id: 1,
          subject: 'Order confirmation',
          sender: 'orders@amazon.com',
          body: 'Order total: $49.99',
          date: new Date('2024-01-10'),
        }),
        createEmail({
          id: 2,
          subject: 'Receipt from Apple',
          sender: 'receipt@apple.com',
          body: 'Total: $9.99',
          date: new Date('2024-01-15'),
        }),
        createEmail({
          id: 3,
          subject: 'Hello',
          sender: 'friend@example.com',
        }),
      ];

      const purchases = detector.detectBatch(emails);

      expect(purchases.length).toBe(2);
      expect(purchases[0].merchant).toBe('Amazon');
      expect(purchases[0].amount).toBe(49.99);
      expect(purchases[1].amount).toBe(9.99);
    });

    it('should include purchase dates', () => {
      const detector = new PurchaseDetector();
      const emails = [
        createEmail({
          id: 1,
          subject: 'Your order confirmation #12345',
          sender: 'orders@amazon.com',
          body: 'Thank you for your order. Order total: $25.00. Your order has been confirmed.',
          date: new Date('2024-02-20'),
        }),
      ];

      const purchases = detector.detectBatch(emails);

      expect(purchases.length).toBeGreaterThan(0);
      expect(purchases[0].purchaseDate).toEqual(new Date('2024-02-20'));
    });

    it('should return empty array for no purchases', () => {
      const detector = new PurchaseDetector();
      const emails = [
        createEmail({ subject: 'Hello' }),
        createEmail({ subject: 'Meeting' }),
      ];

      const purchases = detector.detectBatch(emails);

      expect(purchases).toEqual([]);
    });
  });

  describe('getCategory', () => {
    it('should return correct category for known merchants', () => {
      const detector = new PurchaseDetector();

      expect(detector.getCategory('Amazon')).toBe('ecommerce');
      expect(detector.getCategory('Best Buy')).toBe('technology');
      expect(detector.getCategory('Netflix')).toBe('entertainment');
      expect(detector.getCategory('DoorDash')).toBe('food');
      expect(detector.getCategory('Uber')).toBe('transportation');
      expect(detector.getCategory('Airbnb')).toBe('travel');
      expect(detector.getCategory('PayPal')).toBe('payment');
    });

    it('should return other for unknown merchants', () => {
      const detector = new PurchaseDetector();
      expect(detector.getCategory('Random Store')).toBe('other');
    });

    it('should be case insensitive', () => {
      const detector = new PurchaseDetector();
      expect(detector.getCategory('AMAZON')).toBe('ecommerce');
      expect(detector.getCategory('amazon')).toBe('ecommerce');
    });
  });

  describe('getKnownMerchants', () => {
    it('should return list of known merchants', () => {
      const detector = new PurchaseDetector();
      const merchants = detector.getKnownMerchants();

      expect(Array.isArray(merchants)).toBe(true);
      expect(merchants.length).toBeGreaterThan(10);

      const amazon = merchants.find((m) => m.name === 'Amazon');
      expect(amazon).toBeDefined();
      expect(amazon?.domain).toBe('amazon.com');
    });
  });
});


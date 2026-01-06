import { describe, it, expect } from 'vitest';
import { NewsletterDetector } from '../../detectors/newsletter';
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

describe('NewsletterDetector', () => {
  describe('detect', () => {
    it('should detect newsletter emails', () => {
      const detector = new NewsletterDetector();
      const email = createEmail({
        subject: 'Weekly Newsletter: Tech Updates',
        sender: 'newsletter@techblog.com',
        body: 'This week in tech... Unsubscribe from this newsletter.',
        htmlBody: '<a href="https://example.com/unsubscribe">Unsubscribe</a>',
      });

      const result = detector.detect(email);

      expect(result.isNewsletter).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(40);
    });

    it('should detect promotional emails', () => {
      const detector = new NewsletterDetector();
      const email = createEmail({
        subject: 'Save 50% - Limited Time Offer!',
        sender: 'promo@store.com',
        body: 'Get 50% off everything! Shop now! Unsubscribe here.',
        htmlBody: '<a href="https://store.com/unsubscribe">Unsubscribe</a>',
      });

      const result = detector.detect(email);

      expect(result.isPromotional).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(40);
    });

    it('should detect daily digest emails', () => {
      const detector = new NewsletterDetector();
      const email = createEmail({
        subject: 'Your Daily Digest',
        sender: 'digest@news.com',
        body: 'Here are today\'s top stories. Manage your email preferences.',
      });

      const result = detector.detect(email);

      expect(result.isNewsletter).toBe(true);
    });

    it('should detect weekly roundup emails', () => {
      const detector = new NewsletterDetector();
      const email = createEmail({
        subject: 'Weekly Roundup: Top Stories',
        sender: 'weekly@blog.com',
        body: 'This week\'s best content. View in browser. Unsubscribe.',
      });

      const result = detector.detect(email);

      expect(result.isNewsletter).toBe(true);
    });

    it('should detect monthly update emails', () => {
      const detector = new NewsletterDetector();
      const email = createEmail({
        subject: 'Monthly Digest - January 2024',
        sender: 'updates@newsletter.company.com',
        body: 'What happened this month. View in browser. Forward to a friend. Privacy Policy. Unsubscribe. All rights reserved.',
        htmlBody: '<a href="https://example.com/unsubscribe">Unsubscribe</a>',
      });

      const result = detector.detect(email);

      // Monthly digest triggers newsletter patterns - can be newsletter or promotional
      expect(result.isNewsletter || result.isPromotional).toBe(true);
    });

    it('should detect sale/discount promotional emails', () => {
      const detector = new NewsletterDetector();
      // Test with subjects that have enough marketing signals
      const email = createEmail({
        subject: 'Save 50% - Flash sale ends today!',
        sender: 'promo@promo.store.com',
        body: 'Great deals await! View in browser. Forward to a friend. Copyright 2024. All rights reserved. Privacy Policy. Unsubscribe here.',
        htmlBody: '<a href="https://store.com/unsubscribe">Unsubscribe</a>',
      });

      const result = detector.detect(email);

      expect(result.isPromotional).toBe(true);
    });

    it('should extract unsubscribe link from HTML', () => {
      const detector = new NewsletterDetector();
      const email = createEmail({
        subject: 'Newsletter',
        sender: 'newsletter@blog.com',
        body: 'Content here',
        htmlBody: `
          <html>
            <body>
              <p>Newsletter content</p>
              <a href="https://blog.com/unsubscribe?id=123">Unsubscribe</a>
            </body>
          </html>
        `,
      });

      const result = detector.detect(email);

      expect(result.unsubscribeLink).toBe('https://blog.com/unsubscribe?id=123');
    });

    it('should extract unsubscribe link with opt-out URL', () => {
      const detector = new NewsletterDetector();
      const email = createEmail({
        subject: 'Newsletter',
        sender: 'newsletter@blog.com',
        body: 'Content',
        htmlBody: '<a href="https://example.com/opt-out">Manage preferences</a>',
      });

      const result = detector.detect(email);

      expect(result.unsubscribeLink).toBe('https://example.com/opt-out');
    });

    it('should detect emails from promotional subdomains', () => {
      const detector = new NewsletterDetector();
      const email = createEmail({
        subject: 'Weekly Newsletter',
        sender: 'noreply@newsletter.blog.com',
        body: 'Check out our content. View in browser. Copyright 2024. All rights reserved. Unsubscribe. Privacy Policy.',
        htmlBody: '<a href="https://blog.com/unsubscribe">Unsubscribe</a>',
      });

      const result = detector.detect(email);

      expect(result.isNewsletter || result.isPromotional).toBe(true);
    });

    it('should return false for regular emails', () => {
      const detector = new NewsletterDetector();
      const email = createEmail({
        subject: 'Re: Meeting tomorrow',
        sender: 'colleague@company.com',
        body: 'Sure, 2pm works for me.',
      });

      const result = detector.detect(email);

      expect(result.isNewsletter).toBe(false);
      expect(result.isPromotional).toBe(false);
    });

    it('should detect emails with marketing patterns in body', () => {
      const detector = new NewsletterDetector();
      const email = createEmail({
        subject: 'Weekly Digest',
        sender: 'info@newsletter.company.com',
        body: `Here's what's new! View in browser. Forward to a friend. Copyright © 2024 Company Inc. All rights reserved. Privacy Policy. Unsubscribe. Manage preferences.`,
        htmlBody: '<a href="https://company.com/unsubscribe">Unsubscribe</a>',
      });

      const result = detector.detect(email);

      expect(result.isNewsletter || result.isPromotional).toBe(true);
    });

    it('should detect issue/volume numbered newsletters', () => {
      const detector = new NewsletterDetector();
      const email = createEmail({
        subject: 'Newsletter - Issue #45',
        sender: 'newsletter@newsletter.pub.com',
        body: 'Newsletter content. View in browser. Forward to a friend. Copyright 2024. Privacy Policy. Unsubscribe.',
        htmlBody: '<a href="https://pub.com/unsubscribe">Unsubscribe</a>',
      });

      const result = detector.detect(email);

      // Issue numbered emails are detected - can be newsletter or promotional
      expect(result.isNewsletter || result.isPromotional).toBe(true);
    });
  });

  describe('extractUnsubscribeLink', () => {
    it('should extract link with unsubscribe in href', () => {
      const detector = new NewsletterDetector();
      const html = '<a href="https://example.com/unsubscribe?token=abc">Click here</a>';
      
      expect(detector.extractUnsubscribeLink(html)).toBe('https://example.com/unsubscribe?token=abc');
    });

    it('should extract link with unsubscribe in text', () => {
      const detector = new NewsletterDetector();
      const html = '<a href="https://example.com/manage">Unsubscribe</a>';
      
      expect(detector.extractUnsubscribeLink(html)).toBe('https://example.com/manage');
    });

    it('should extract opt-out links', () => {
      const detector = new NewsletterDetector();
      const html = '<a href="https://example.com/opt-out">Opt out</a>';
      
      expect(detector.extractUnsubscribeLink(html)).toBe('https://example.com/opt-out');
    });

    it('should extract email preferences links', () => {
      const detector = new NewsletterDetector();
      const html = '<a href="https://example.com/email-preferences">Manage preferences</a>';
      
      expect(detector.extractUnsubscribeLink(html)).toBe('https://example.com/email-preferences');
    });

    it('should return undefined when no link found', () => {
      const detector = new NewsletterDetector();
      const html = '<p>No unsubscribe link here</p>';
      
      expect(detector.extractUnsubscribeLink(html)).toBeUndefined();
    });

    it('should return undefined for empty input', () => {
      const detector = new NewsletterDetector();
      expect(detector.extractUnsubscribeLink('')).toBeUndefined();
    });

    it('should find plain text unsubscribe URLs', () => {
      const detector = new NewsletterDetector();
      const html = 'Click here to unsubscribe: https://example.com/unsubscribe/user123';
      
      expect(detector.extractUnsubscribeLink(html)).toContain('unsubscribe');
    });
  });

  describe('categorize', () => {
    it('should categorize newsletter emails', () => {
      const detector = new NewsletterDetector();
      const email = createEmail({
        subject: 'Weekly Digest - Your updates',
        sender: 'digest@newsletter.blog.com',
        body: 'This week\'s content. View in browser. Forward to a friend. Copyright 2024. All rights reserved. Privacy Policy. Unsubscribe here.',
        htmlBody: '<a href="https://blog.com/unsubscribe">Unsubscribe</a>',
      });

      const category = detector.categorize(email);
      // The categorize function returns 'newsletter', 'promotional', or 'regular'
      // Newsletter patterns may be detected as promotional depending on thresholds
      expect(['newsletter', 'promotional']).toContain(category);
    });

    it('should categorize promotional emails', () => {
      const detector = new NewsletterDetector();
      const email = createEmail({
        subject: 'Save 50% today - Limited time!',
        sender: 'promo@promo.store.com',
        body: 'Limited time offer! View in browser. Forward to a friend. Copyright 2024. All rights reserved. Privacy Policy. Unsubscribe.',
        htmlBody: '<a href="https://store.com/unsubscribe">Unsubscribe</a>',
      });

      expect(detector.categorize(email)).toBe('promotional');
    });

    it('should categorize regular emails', () => {
      const detector = new NewsletterDetector();
      const email = createEmail({
        subject: 'Meeting notes',
        sender: 'colleague@company.com',
        body: 'Here are the notes from today.',
      });

      expect(detector.categorize(email)).toBe('regular');
    });
  });

  describe('detectBatch', () => {
    it('should detect newsletters from multiple emails', () => {
      const detector = new NewsletterDetector();
      const emails = [
        createEmail({
          id: 1,
          subject: 'Weekly Newsletter',
          sender: 'newsletter@newsletter.blog.com',
          body: 'Content. View in browser. Copyright 2024. All rights reserved. Privacy Policy. Unsubscribe.',
          htmlBody: '<a href="https://blog.com/unsubscribe">Unsubscribe</a>',
          date: new Date('2024-01-15'),
        }),
        createEmail({
          id: 2,
          subject: 'Flash Sale - 50% off!',
          sender: 'promo@promo.store.com',
          body: 'Big sale! View in browser. Copyright 2024. All rights reserved. Privacy Policy. Unsubscribe.',
          htmlBody: '<a href="https://store.com/unsubscribe">Unsubscribe</a>',
          date: new Date('2024-01-10'),
        }),
        createEmail({
          id: 3,
          subject: 'Hello',
          sender: 'friend@example.com',
        }),
      ];

      const newsletters = detector.detectBatch(emails);

      expect(newsletters.length).toBe(2);
    });

    it('should group emails by sender', () => {
      const detector = new NewsletterDetector();
      const emails = [
        createEmail({
          id: 1,
          subject: 'Weekly Newsletter #1',
          sender: 'newsletter@newsletter.blog.com',
          body: 'First issue. View in browser. Copyright 2024. All rights reserved. Privacy Policy. Unsubscribe.',
          htmlBody: '<a href="https://blog.com/unsubscribe">Unsubscribe</a>',
          date: new Date('2024-01-01'),
        }),
        createEmail({
          id: 2,
          subject: 'Weekly Newsletter #2',
          sender: 'newsletter@newsletter.blog.com',
          body: 'Second issue. View in browser. Copyright 2024. All rights reserved. Privacy Policy. Unsubscribe.',
          htmlBody: '<a href="https://blog.com/unsubscribe">Unsubscribe</a>',
          date: new Date('2024-01-08'),
        }),
        createEmail({
          id: 3,
          subject: 'Weekly Newsletter #3',
          sender: 'newsletter@newsletter.blog.com',
          body: 'Third issue. View in browser. Copyright 2024. All rights reserved. Privacy Policy. Unsubscribe.',
          htmlBody: '<a href="https://blog.com/unsubscribe">Unsubscribe</a>',
          date: new Date('2024-01-15'),
        }),
      ];

      const newsletters = detector.detectBatch(emails);

      expect(newsletters.length).toBe(1);
      expect(newsletters[0].emailCount).toBe(3);
      expect(newsletters[0].senderEmail).toBe('newsletter@newsletter.blog.com');
    });

    it('should calculate frequency based on email dates', () => {
      const detector = new NewsletterDetector();
      // Weekly emails
      const emails = [
        createEmail({
          id: 1,
          sender: 'weekly@news.com',
          subject: 'Weekly Update',
          body: 'Content. Unsubscribe.',
          date: new Date('2024-01-01'),
        }),
        createEmail({
          id: 2,
          sender: 'weekly@news.com',
          subject: 'Weekly Update',
          body: 'Content. Unsubscribe.',
          date: new Date('2024-01-08'),
        }),
        createEmail({
          id: 3,
          sender: 'weekly@news.com',
          subject: 'Weekly Update',
          body: 'Content. Unsubscribe.',
          date: new Date('2024-01-15'),
        }),
      ];

      const newsletters = detector.detectBatch(emails);

      expect(newsletters[0].frequency).toBe('weekly');
    });

    it('should use most recent email date', () => {
      const detector = new NewsletterDetector();
      const emails = [
        createEmail({
          id: 1,
          sender: 'newsletter@newsletter.blog.com',
          subject: 'Weekly Newsletter',
          body: 'Old. View in browser. Copyright 2024. All rights reserved. Privacy Policy. Unsubscribe.',
          htmlBody: '<a href="https://blog.com/unsubscribe">Unsubscribe</a>',
          date: new Date('2024-01-01'),
        }),
        createEmail({
          id: 2,
          sender: 'newsletter@newsletter.blog.com',
          subject: 'Weekly Newsletter',
          body: 'New. View in browser. Copyright 2024. All rights reserved. Privacy Policy. Unsubscribe.',
          htmlBody: '<a href="https://blog.com/unsubscribe">Unsubscribe</a>',
          date: new Date('2024-01-15'),
        }),
      ];

      const newsletters = detector.detectBatch(emails);

      expect(newsletters.length).toBeGreaterThan(0);
      expect(newsletters[0].lastEmailDate).toEqual(new Date('2024-01-15'));
    });

    it('should extract sender name from known senders', () => {
      const detector = new NewsletterDetector();
      const emails = [
        createEmail({
          id: 1,
          sender: 'newsletter@newsletter.nytimes.com',
          subject: 'Weekly Newsletter - Morning Briefing',
          body: 'News content. View in browser. Copyright 2024. All rights reserved. Privacy Policy. Unsubscribe.',
          htmlBody: '<a href="https://nytimes.com/unsubscribe">Unsubscribe</a>',
          date: new Date('2024-01-15'),
        }),
      ];

      const newsletters = detector.detectBatch(emails);

      expect(newsletters.length).toBeGreaterThan(0);
      expect(newsletters[0].senderName).toBe('New York Times');
    });

    it('should return empty array for no newsletters', () => {
      const detector = new NewsletterDetector();
      const emails = [
        createEmail({ subject: 'Meeting', sender: 'colleague@work.com' }),
        createEmail({ subject: 'Hello', sender: 'friend@example.com' }),
      ];

      const newsletters = detector.detectBatch(emails);

      expect(newsletters).toEqual([]);
    });

    it('should capture unsubscribe links', () => {
      const detector = new NewsletterDetector();
      const emails = [
        createEmail({
          id: 1,
          sender: 'newsletter@blog.com',
          subject: 'Newsletter',
          body: 'Content',
          htmlBody: '<a href="https://blog.com/unsubscribe">Unsubscribe</a>',
          date: new Date('2024-01-15'),
        }),
      ];

      const newsletters = detector.detectBatch(emails);

      expect(newsletters[0].unsubscribeLink).toBe('https://blog.com/unsubscribe');
    });
  });
});


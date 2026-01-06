import { describe, it, expect } from 'vitest';
import { AccountDetector } from '../../detectors/account';
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

describe('AccountDetector', () => {
  describe('detect', () => {
    it('should detect welcome emails', () => {
      const detector = new AccountDetector();
      const email = createEmail({
        subject: 'Welcome to Netflix!',
        sender: 'info@netflix.com',
        body: 'Thank you for signing up!',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('account');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.data?.serviceName).toBe('Netflix');
      expect(result.data?.serviceType).toBe('streaming');
    });

    it('should detect email verification requests', () => {
      const detector = new AccountDetector();
      const email = createEmail({
        subject: 'Verify your email address',
        sender: 'noreply@github.com',
        body: 'Click here to verify your email address and complete your registration.',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('account');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.data?.serviceName).toBe('GitHub');
      expect(result.data?.serviceType).toBe('development');
    });

    it('should detect account confirmation emails', () => {
      const detector = new AccountDetector();
      const email = createEmail({
        subject: 'Confirm your account',
        sender: 'no-reply@spotify.com',
        body: 'Your account has been created. Click to confirm.',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('account');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
    });

    it('should detect "Thanks for signing up" emails', () => {
      const detector = new AccountDetector();
      const email = createEmail({
        subject: 'Thanks for signing up!',
        sender: 'welcome@amazon.com',
        body: 'Welcome to Amazon!',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('account');
    });

    it('should return none for regular emails', () => {
      const detector = new AccountDetector();
      const email = createEmail({
        subject: 'Meeting tomorrow',
        sender: 'colleague@company.com',
        body: 'Can we meet at 2pm?',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('none');
      expect(result.confidence).toBe(0);
    });

    it('should detect known services by domain', () => {
      const detector = new AccountDetector();
      const knownServices = [
        { domain: 'paypal.com', name: 'PayPal', type: 'banking' },
        { domain: 'linkedin.com', name: 'LinkedIn', type: 'social' },
        { domain: 'slack.com', name: 'Slack', type: 'communication' },
        { domain: 'dropbox.com', name: 'Dropbox', type: 'other' },
      ];

      for (const service of knownServices) {
        const email = createEmail({
          subject: 'Welcome to our service!',
          sender: `noreply@${service.domain}`,
          body: 'Your account has been created successfully.',
        });

        const result = detector.detect(email);

        expect(result.type).toBe('account');
        expect(result.data?.serviceName).toBe(service.name);
        expect(result.data?.serviceType).toBe(service.type);
      }
    });

    it('should handle subdomain emails for known services', () => {
      const detector = new AccountDetector();
      const email = createEmail({
        subject: 'Verify your email',
        sender: 'noreply@mail.netflix.com',
        body: 'Click to verify your email address.',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('account');
      expect(result.data?.serviceName).toBe('Netflix');
    });

    it('should detect verification codes in body', () => {
      const detector = new AccountDetector();
      const email = createEmail({
        subject: 'Verify your email address',
        sender: 'noreply@github.com',
        body: 'Your verification code is 123456. Click here to verify your email.',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('account');
    });

    it('should detect "Activate your account" emails', () => {
      const detector = new AccountDetector();
      const email = createEmail({
        subject: 'Activate your account',
        sender: 'support@netflix.com',
        body: 'Click the link below to activate your account and complete your registration.',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('account');
    });

    it('should detect "Complete your registration" emails', () => {
      const detector = new AccountDetector();
      const email = createEmail({
        subject: 'Complete your registration',
        sender: 'noreply@example.com',
        body: 'Complete your registration to get started.',
      });

      const result = detector.detect(email);

      expect(result.type).toBe('account');
    });
  });

  describe('detectBatch', () => {
    it('should detect accounts from multiple emails', () => {
      const detector = new AccountDetector();
      const emails = [
        createEmail({
          id: 1,
          subject: 'Welcome to Netflix!',
          sender: 'info@netflix.com',
          date: new Date('2024-01-10'),
        }),
        createEmail({
          id: 2,
          subject: 'Welcome to Spotify!',
          sender: 'noreply@spotify.com',
          date: new Date('2024-01-15'),
        }),
        createEmail({
          id: 3,
          subject: 'Regular email',
          sender: 'friend@example.com',
        }),
      ];

      const accounts = detector.detectBatch(emails);

      expect(accounts.length).toBe(2);
      expect(accounts.map((a) => a.serviceName)).toContain('Netflix');
      expect(accounts.map((a) => a.serviceName)).toContain('Spotify');
    });

    it('should deduplicate accounts by service name', () => {
      const detector = new AccountDetector();
      const emails = [
        createEmail({
          id: 1,
          subject: 'Welcome to Netflix!',
          sender: 'info@netflix.com',
          date: new Date('2024-01-10'),
        }),
        createEmail({
          id: 2,
          subject: 'Verify your Netflix email',
          sender: 'noreply@netflix.com',
          date: new Date('2024-01-11'),
        }),
        createEmail({
          id: 3,
          subject: 'Netflix: Password reset',
          sender: 'security@netflix.com',
          date: new Date('2024-01-12'),
          body: 'Click to verify your email address and complete your registration.',
        }),
      ];

      const accounts = detector.detectBatch(emails);

      // Should only have one Netflix account with emailCount > 1
      const netflixAccounts = accounts.filter(
        (a) => a.serviceName.toLowerCase() === 'netflix'
      );
      expect(netflixAccounts.length).toBe(1);
      expect(netflixAccounts[0].emailCount).toBeGreaterThan(1);
    });

    it('should use earliest email date as signup date', () => {
      const detector = new AccountDetector();
      const emails = [
        createEmail({
          id: 1,
          subject: 'Verify your Netflix email',
          sender: 'noreply@netflix.com',
          date: new Date('2024-01-15'),
          body: 'Click to verify your email.',
        }),
        createEmail({
          id: 2,
          subject: 'Welcome to Netflix!',
          sender: 'info@netflix.com',
          date: new Date('2024-01-10'),
        }),
      ];

      const accounts = detector.detectBatch(emails);

      expect(accounts[0].signupDate).toEqual(new Date('2024-01-10'));
      expect(accounts[0].signupEmailId).toBe(2);
    });

    it('should return empty array for no accounts', () => {
      const detector = new AccountDetector();
      const emails = [
        createEmail({ subject: 'Hello', sender: 'friend@example.com' }),
        createEmail({ subject: 'Meeting', sender: 'colleague@work.com' }),
      ];

      const accounts = detector.detectBatch(emails);

      expect(accounts).toEqual([]);
    });
  });

  describe('getKnownServices', () => {
    it('should return list of known services', () => {
      const detector = new AccountDetector();
      const services = detector.getKnownServices();

      expect(Array.isArray(services)).toBe(true);
      expect(services.length).toBeGreaterThan(50);

      // Check structure
      const netflix = services.find((s) => s.name === 'Netflix');
      expect(netflix).toBeDefined();
      expect(netflix?.domain).toBe('netflix.com');
      expect(netflix?.type).toBe('streaming');
    });

    it('should include various service types', () => {
      const detector = new AccountDetector();
      const services = detector.getKnownServices();

      const types = new Set(services.map((s) => s.type));
      expect(types.has('streaming')).toBe(true);
      expect(types.has('ecommerce')).toBe(true);
      expect(types.has('social')).toBe(true);
      expect(types.has('banking')).toBe(true);
      expect(types.has('development')).toBe(true);
      expect(types.has('communication')).toBe(true);
    });
  });
});


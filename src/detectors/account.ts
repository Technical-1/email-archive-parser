/**
 * OLM Parser - Account Signup Detector
 * @packageDocumentation
 */

import type { Email, Account, AccountDetectionResult, ServiceType } from '../types';
import { stripHtml, extractDomain } from '../utils';

/**
 * Detector for account signup/registration emails
 * Identifies welcome emails, verification requests, and account confirmations
 *
 * @example
 * ```typescript
 * import { AccountDetector } from '@jacobkanfer/email-archive-parser';
 *
 * const detector = new AccountDetector();
 * const result = detector.detect(email);
 *
 * if (result.type === 'account') {
 *   console.log(`Account signup detected: ${result.data?.serviceName}`);
 * }
 * ```
 */
export class AccountDetector {
  private readonly strongSubjectPatterns = [
    /^welcome to/i,
    /^verify your.*(?:email|account)/i,
    /^confirm your.*(?:email|account|registration)/i,
    /^activate your.*account/i,
    /^your.*account.*(?:has been |is )created/i,
    /^(?:complete|finish) your registration/i,
    /^thanks for (?:signing up|registering|joining)/i,
    /^you(?:'re| are) (?:in|registered)/i,
    /email verification/i,
    /account verification/i,
  ];

  private readonly strongBodyPatterns = [
    /click.*(?:here|below|button).*(?:to )?verify your email/i,
    /confirm your email address/i,
    /complete your registration/i,
    /your account has been (?:successfully )?created/i,
    /welcome to .{2,50}[!.]/i,
    /thanks for (?:signing up|registering|creating an account)/i,
    /verification code[:\s]+\d{4,8}/i,
    /your verification code is/i,
  ];

  private readonly knownServices: Record<string, { name: string; type: ServiceType }> = {
    // Streaming
    'netflix.com': { name: 'Netflix', type: 'streaming' },
    'spotify.com': { name: 'Spotify', type: 'streaming' },
    'hulu.com': { name: 'Hulu', type: 'streaming' },
    'disneyplus.com': { name: 'Disney+', type: 'streaming' },
    'hbomax.com': { name: 'HBO Max', type: 'streaming' },
    'max.com': { name: 'Max', type: 'streaming' },
    'peacocktv.com': { name: 'Peacock', type: 'streaming' },
    'paramountplus.com': { name: 'Paramount+', type: 'streaming' },
    'primevideo.com': { name: 'Prime Video', type: 'streaming' },
    'crunchyroll.com': { name: 'Crunchyroll', type: 'streaming' },
    'youtube.com': { name: 'YouTube', type: 'streaming' },
    'twitch.tv': { name: 'Twitch', type: 'streaming' },
    'appletv.apple.com': { name: 'Apple TV+', type: 'streaming' },
    'funimation.com': { name: 'Funimation', type: 'streaming' },
    'showtime.com': { name: 'Showtime', type: 'streaming' },
    'starz.com': { name: 'Starz', type: 'streaming' },
    'discovery.com': { name: 'Discovery+', type: 'streaming' },
    'espn.com': { name: 'ESPN+', type: 'streaming' },
    'audible.com': { name: 'Audible', type: 'streaming' },
    'pandora.com': { name: 'Pandora', type: 'streaming' },
    'deezer.com': { name: 'Deezer', type: 'streaming' },
    'tidal.com': { name: 'Tidal', type: 'streaming' },
    // E-commerce
    'amazon.com': { name: 'Amazon', type: 'ecommerce' },
    'ebay.com': { name: 'eBay', type: 'ecommerce' },
    'etsy.com': { name: 'Etsy', type: 'ecommerce' },
    'shopify.com': { name: 'Shopify', type: 'ecommerce' },
    'walmart.com': { name: 'Walmart', type: 'ecommerce' },
    'target.com': { name: 'Target', type: 'ecommerce' },
    'bestbuy.com': { name: 'Best Buy', type: 'ecommerce' },
    'aliexpress.com': { name: 'AliExpress', type: 'ecommerce' },
    'wish.com': { name: 'Wish', type: 'ecommerce' },
    'newegg.com': { name: 'Newegg', type: 'ecommerce' },
    'wayfair.com': { name: 'Wayfair', type: 'ecommerce' },
    'zappos.com': { name: 'Zappos', type: 'ecommerce' },
    'macys.com': { name: "Macy's", type: 'ecommerce' },
    'nordstrom.com': { name: 'Nordstrom', type: 'ecommerce' },
    'costco.com': { name: 'Costco', type: 'ecommerce' },
    'homedepot.com': { name: 'Home Depot', type: 'ecommerce' },
    'lowes.com': { name: "Lowe's", type: 'ecommerce' },
    'sephora.com': { name: 'Sephora', type: 'ecommerce' },
    'ulta.com': { name: 'Ulta', type: 'ecommerce' },
    'chewy.com': { name: 'Chewy', type: 'ecommerce' },
    // Social
    'facebook.com': { name: 'Facebook', type: 'social' },
    'meta.com': { name: 'Meta', type: 'social' },
    'instagram.com': { name: 'Instagram', type: 'social' },
    'twitter.com': { name: 'Twitter', type: 'social' },
    'x.com': { name: 'X', type: 'social' },
    'linkedin.com': { name: 'LinkedIn', type: 'social' },
    'tiktok.com': { name: 'TikTok', type: 'social' },
    'reddit.com': { name: 'Reddit', type: 'social' },
    'pinterest.com': { name: 'Pinterest', type: 'social' },
    'snapchat.com': { name: 'Snapchat', type: 'social' },
    'threads.net': { name: 'Threads', type: 'social' },
    'tumblr.com': { name: 'Tumblr', type: 'social' },
    'mastodon.social': { name: 'Mastodon', type: 'social' },
    'bluesky.social': { name: 'Bluesky', type: 'social' },
    'nextdoor.com': { name: 'Nextdoor', type: 'social' },
    'quora.com': { name: 'Quora', type: 'social' },
    // Development
    'github.com': { name: 'GitHub', type: 'development' },
    'gitlab.com': { name: 'GitLab', type: 'development' },
    'bitbucket.org': { name: 'Bitbucket', type: 'development' },
    'atlassian.com': { name: 'Atlassian', type: 'development' },
    'jetbrains.com': { name: 'JetBrains', type: 'development' },
    'stackoverflow.com': { name: 'Stack Overflow', type: 'development' },
    'heroku.com': { name: 'Heroku', type: 'development' },
    'vercel.com': { name: 'Vercel', type: 'development' },
    'netlify.com': { name: 'Netlify', type: 'development' },
    'digitalocean.com': { name: 'DigitalOcean', type: 'development' },
    'aws.amazon.com': { name: 'AWS', type: 'development' },
    'cloud.google.com': { name: 'Google Cloud', type: 'development' },
    'azure.microsoft.com': { name: 'Azure', type: 'development' },
    'cloudflare.com': { name: 'Cloudflare', type: 'development' },
    'trello.com': { name: 'Trello', type: 'development' },
    'asana.com': { name: 'Asana', type: 'development' },
    'monday.com': { name: 'Monday.com', type: 'development' },
    'jira.com': { name: 'Jira', type: 'development' },
    'confluence.com': { name: 'Confluence', type: 'development' },
    'npm.com': { name: 'npm', type: 'development' },
    'docker.com': { name: 'Docker', type: 'development' },
    'firebase.google.com': { name: 'Firebase', type: 'development' },
    'render.com': { name: 'Render', type: 'development' },
    'railway.app': { name: 'Railway', type: 'development' },
    'supabase.com': { name: 'Supabase', type: 'development' },
    'planetscale.com': { name: 'PlanetScale', type: 'development' },
    // Communication
    'slack.com': { name: 'Slack', type: 'communication' },
    'zoom.us': { name: 'Zoom', type: 'communication' },
    'discord.com': { name: 'Discord', type: 'communication' },
    'teams.microsoft.com': { name: 'Microsoft Teams', type: 'communication' },
    'telegram.org': { name: 'Telegram', type: 'communication' },
    'whatsapp.com': { name: 'WhatsApp', type: 'communication' },
    'signal.org': { name: 'Signal', type: 'communication' },
    'webex.com': { name: 'Webex', type: 'communication' },
    'gotomeeting.com': { name: 'GoToMeeting', type: 'communication' },
    'line.me': { name: 'LINE', type: 'communication' },
    'viber.com': { name: 'Viber', type: 'communication' },
    // Banking
    'paypal.com': { name: 'PayPal', type: 'banking' },
    'venmo.com': { name: 'Venmo', type: 'banking' },
    'stripe.com': { name: 'Stripe', type: 'banking' },
    'chase.com': { name: 'Chase', type: 'banking' },
    'bankofamerica.com': { name: 'Bank of America', type: 'banking' },
    'wellsfargo.com': { name: 'Wells Fargo', type: 'banking' },
    'capitalone.com': { name: 'Capital One', type: 'banking' },
    'citi.com': { name: 'Citibank', type: 'banking' },
    'schwab.com': { name: 'Charles Schwab', type: 'banking' },
    'fidelity.com': { name: 'Fidelity', type: 'banking' },
    'robinhood.com': { name: 'Robinhood', type: 'banking' },
    'coinbase.com': { name: 'Coinbase', type: 'banking' },
    'americanexpress.com': { name: 'American Express', type: 'banking' },
    'discover.com': { name: 'Discover', type: 'banking' },
    'usbank.com': { name: 'US Bank', type: 'banking' },
    'pnc.com': { name: 'PNC', type: 'banking' },
    'tdbank.com': { name: 'TD Bank', type: 'banking' },
    'ally.com': { name: 'Ally Bank', type: 'banking' },
    'marcus.com': { name: 'Marcus', type: 'banking' },
    'sofi.com': { name: 'SoFi', type: 'banking' },
    'chime.com': { name: 'Chime', type: 'banking' },
    'cashapp.com': { name: 'Cash App', type: 'banking' },
    'wealthfront.com': { name: 'Wealthfront', type: 'banking' },
    'betterment.com': { name: 'Betterment', type: 'banking' },
    'acorns.com': { name: 'Acorns', type: 'banking' },
    'kraken.com': { name: 'Kraken', type: 'banking' },
    'binance.com': { name: 'Binance', type: 'banking' },
    // Other
    'dropbox.com': { name: 'Dropbox', type: 'other' },
    'box.com': { name: 'Box', type: 'other' },
    'notion.so': { name: 'Notion', type: 'other' },
    'figma.com': { name: 'Figma', type: 'other' },
    'canva.com': { name: 'Canva', type: 'other' },
    'adobe.com': { name: 'Adobe', type: 'other' },
    'microsoft.com': { name: 'Microsoft', type: 'other' },
    'google.com': { name: 'Google', type: 'other' },
    'apple.com': { name: 'Apple', type: 'other' },
    'icloud.com': { name: 'iCloud', type: 'other' },
    'uber.com': { name: 'Uber', type: 'other' },
    'lyft.com': { name: 'Lyft', type: 'other' },
    'doordash.com': { name: 'DoorDash', type: 'other' },
    'grubhub.com': { name: 'Grubhub', type: 'other' },
    'instacart.com': { name: 'Instacart', type: 'other' },
    'airbnb.com': { name: 'Airbnb', type: 'other' },
    'evernote.com': { name: 'Evernote', type: 'other' },
    'todoist.com': { name: 'Todoist', type: 'other' },
    'grammarly.com': { name: 'Grammarly', type: 'other' },
    '1password.com': { name: '1Password', type: 'other' },
    'lastpass.com': { name: 'LastPass', type: 'other' },
    'bitwarden.com': { name: 'Bitwarden', type: 'other' },
    'dashlane.com': { name: 'Dashlane', type: 'other' },
    'nordvpn.com': { name: 'NordVPN', type: 'other' },
    'expressvpn.com': { name: 'ExpressVPN', type: 'other' },
    'surfshark.com': { name: 'Surfshark', type: 'other' },
    'duolingo.com': { name: 'Duolingo', type: 'other' },
    'coursera.org': { name: 'Coursera', type: 'other' },
    'udemy.com': { name: 'Udemy', type: 'other' },
    'skillshare.com': { name: 'Skillshare', type: 'other' },
    'masterclass.com': { name: 'MasterClass', type: 'other' },
    'calm.com': { name: 'Calm', type: 'other' },
    'headspace.com': { name: 'Headspace', type: 'other' },
    'strava.com': { name: 'Strava', type: 'other' },
    'peloton.com': { name: 'Peloton', type: 'other' },
    'myfitnesspal.com': { name: 'MyFitnessPal', type: 'other' },
    'fitbit.com': { name: 'Fitbit', type: 'other' },
  };

  /**
   * Detect if an email is an account signup/registration email
   * @param email - Email to analyze
   * @returns Detection result with confidence and service info
   */
  detect(email: Email): AccountDetectionResult {
    const subject = email.subject || '';
    const body = stripHtml(email.body || '');
    const sender = email.sender || '';

    let confidence = 0;
    let detectedService = '';
    let serviceType: ServiceType = 'other';

    // Check if sender is from a known service
    const domain = extractDomain(sender);
    const serviceInfo = this.findKnownService(domain);

    if (serviceInfo) {
      detectedService = serviceInfo.name;
      serviceType = serviceInfo.type;
      confidence += 40;
    }

    // Check strong subject patterns
    for (const pattern of this.strongSubjectPatterns) {
      if (pattern.test(subject)) {
        confidence += 40;
        break;
      }
    }

    // Check strong body patterns
    for (const pattern of this.strongBodyPatterns) {
      if (pattern.test(body)) {
        confidence += 30;
        break;
      }
    }

    // Extract service name if not known
    if (confidence >= 40 && !detectedService) {
      const extracted = this.extractServiceName(subject);
      if (extracted) {
        detectedService = extracted;
        confidence += 10;
      } else {
        detectedService = this.formatDomainAsServiceName(domain);
      }
    }

    if (confidence >= 70 && detectedService) {
      return {
        type: 'account',
        confidence,
        data: {
          serviceName: detectedService,
          serviceType,
        },
      };
    }

    return { type: 'none', confidence: 0 };
  }

  /**
   * Detect accounts from a batch of emails
   * @param emails - Emails to analyze
   * @returns Array of detected accounts (deduplicated)
   */
  detectBatch(emails: Email[]): Account[] {
    const accountMap = new Map<string, Account>();

    for (const email of emails) {
      const result = this.detect(email);
      if (result.type === 'account' && result.data?.serviceName) {
        const key = result.data.serviceName.toLowerCase();

        if (!accountMap.has(key)) {
          accountMap.set(key, {
            serviceName: result.data.serviceName,
            signupEmailId: email.id,
            signupDate: email.date,
            serviceType: result.data.serviceType || 'other',
            domain: extractDomain(email.sender),
            emailCount: 1,
          });
        } else {
          const existing = accountMap.get(key)!;
          existing.emailCount++;
          if (email.date < existing.signupDate) {
            existing.signupDate = email.date;
            existing.signupEmailId = email.id;
          }
        }
      }
    }

    return Array.from(accountMap.values());
  }

  private findKnownService(domain: string): { name: string; type: ServiceType } | null {
    if (this.knownServices[domain]) {
      return this.knownServices[domain];
    }

    for (const [serviceDomain, info] of Object.entries(this.knownServices)) {
      if (domain === serviceDomain || domain.endsWith('.' + serviceDomain)) {
        return info;
      }
    }

    for (const [serviceDomain, info] of Object.entries(this.knownServices)) {
      const baseDomain = serviceDomain.split('.')[0];
      if (domain.includes(baseDomain + '.') || domain.includes('.' + baseDomain)) {
        return info;
      }
    }

    return null;
  }

  private extractServiceName(subject: string): string {
    const patterns = [
      /^welcome to ([A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+)?)[!.,]/i,
      /thanks for (?:signing up|joining|registering) (?:for |with )?([A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+)?)[!.,]/i,
      /your ([A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+)?) account (?:has been |is )?(?:created|ready)/i,
    ];

    for (const pattern of patterns) {
      const match = subject.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        if (name.length >= 2 && name.length <= 30 && /^[A-Z]/i.test(name)) {
          return name;
        }
      }
    }

    return '';
  }

  private formatDomainAsServiceName(domain: string): string {
    if (!domain) return '';

    const parts = domain.split('.');
    if (parts.length < 2) return '';

    let mainPart = parts.length > 2 ? parts[parts.length - 2] : parts[0];

    const skipWords = ['mail', 'email', 'noreply', 'no-reply', 'notifications', 'info', 'support'];
    if (skipWords.includes(mainPart.toLowerCase())) {
      mainPart = parts.length > 2 ? parts[parts.length - 2] : parts[0];
    }

    return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
  }

  /**
   * Get all known services
   * @returns List of known service domains with names and types
   */
  getKnownServices(): { domain: string; name: string; type: ServiceType }[] {
    return Object.entries(this.knownServices).map(([domain, info]) => ({
      domain,
      ...info,
    }));
  }
}


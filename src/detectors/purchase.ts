/**
 * OLM Parser - Purchase Detector
 * @packageDocumentation
 */

import type { Email, Purchase, PurchaseDetectionResult, PurchaseCategory } from '../types';
import { stripHtml, extractDomain, parseMoney } from '../utils';

/**
 * Detector for purchase/order confirmation emails
 * Supports multiple currencies and extracts order details
 *
 * @example
 * ```typescript
 * import { PurchaseDetector } from '@technical-1/email-archive-parser';
 *
 * const detector = new PurchaseDetector();
 * const result = detector.detect(email);
 *
 * if (result.type === 'purchase') {
 *   console.log(`Purchase: $${result.data?.amount} from ${result.data?.merchant}`);
 * }
 * ```
 */
export class PurchaseDetector {
  private readonly strongSubjectPatterns = [
    /^(?:your )?order (?:confirmation|receipt|#)/i,
    /^(?:your )?(?:purchase|payment) (?:confirmation|receipt)/i,
    /^receipt (?:for|from)/i,
    /^invoice (?:for|from|#)/i,
    /^thank you for your (?:order|purchase)/i,
    /^order #?\w+ (?:confirmed|shipped|delivered)/i,
    /^your .{2,30} order/i,
    /^shipping confirmation/i,
    /^payment received/i,
    /^transaction receipt/i,
  ];

  private readonly strongBodyPatterns = [
    /order\s+(?:total|summary)[:\s]+[$€£¥₹₩]\s*[\d,]+[.,]?\d*/i,
    /(?:amount|total)\s+(?:charged|paid)[:\s]+[$€£¥₹₩]\s*[\d,]+[.,]?\d*/i,
    /you (?:have )?(?:paid|purchased|ordered)/i,
    /thank you for your (?:order|purchase) (?:of|from)/i,
    /your order has been (?:confirmed|placed|received)/i,
    /payment of [$€£¥₹₩]\s*[\d,]+[.,]?\d*/i,
    /transaction amount[:\s]+[$€£¥₹₩]\s*[\d,]+[.,]?\d*/i,
    /order #\s*[A-Z0-9-]{5,}/i,
    /order number[:\s]+[A-Z0-9-]{5,}/i,
    /betrag[:\s]+€\s*[\d,]+[.,]\d{2}/i, // German
    /montant[:\s]+€\s*[\d\s]+[.,]\d{2}/i, // French
    /importe[:\s]+€\s*[\d,]+[.,]\d{2}/i, // Spanish
  ];

  private readonly antiPatterns = [
    /save \$\d+/i,
    /up to \d+% off/i,
    /free shipping/i,
    /sale ends/i,
    /limited time/i,
    /discount code/i,
    /promo code/i,
    /shop now/i,
    /buy now/i,
    /subscribe/i,
    /unsubscribe/i,
    /view in browser/i,
  ];

  private readonly knownMerchants: Record<string, string> = {
    'amazon.com': 'Amazon',
    'ebay.com': 'eBay',
    'etsy.com': 'Etsy',
    'paypal.com': 'PayPal',
    'stripe.com': 'Stripe',
    'square.com': 'Square',
    'shopify.com': 'Shopify',
    'apple.com': 'Apple',
    'google.com': 'Google',
    'microsoft.com': 'Microsoft',
    'netflix.com': 'Netflix',
    'spotify.com': 'Spotify',
    'hulu.com': 'Hulu',
    'starbucks.com': 'Starbucks',
    'mcdonalds.com': "McDonald's",
    'uber.com': 'Uber',
    'ubereats.com': 'Uber Eats',
    'doordash.com': 'DoorDash',
    'grubhub.com': 'Grubhub',
    'instacart.com': 'Instacart',
    'walmart.com': 'Walmart',
    'target.com': 'Target',
    'bestbuy.com': 'Best Buy',
    'costco.com': 'Costco',
    'homedepot.com': 'Home Depot',
    'lowes.com': "Lowe's",
    'nordstrom.com': 'Nordstrom',
    'macys.com': "Macy's",
    'kohls.com': "Kohl's",
    'gap.com': 'Gap',
    'oldnavy.com': 'Old Navy',
    'nike.com': 'Nike',
    'adidas.com': 'Adidas',
    'newegg.com': 'Newegg',
    'bhphotovideo.com': 'B&H Photo',
    'dell.com': 'Dell',
    'hp.com': 'HP',
    'lenovo.com': 'Lenovo',
    'aliexpress.com': 'AliExpress',
    'wish.com': 'Wish',
    'chewy.com': 'Chewy',
    'wayfair.com': 'Wayfair',
    'ikea.com': 'IKEA',
    'sephora.com': 'Sephora',
    'ulta.com': 'Ulta',
    'airbnb.com': 'Airbnb',
    'booking.com': 'Booking.com',
    'expedia.com': 'Expedia',
    'southwest.com': 'Southwest Airlines',
    'delta.com': 'Delta Airlines',
    'united.com': 'United Airlines',
    'american.com': 'American Airlines',
    'lyft.com': 'Lyft',
    'seamless.com': 'Seamless',
    'postmates.com': 'Postmates',
    'caviar.com': 'Caviar',
    'ticketmaster.com': 'Ticketmaster',
    'stubhub.com': 'StubHub',
    'seatgeek.com': 'SeatGeek',
    'eventbrite.com': 'Eventbrite',
    'steamgames.com': 'Steam',
    'steampowered.com': 'Steam',
    'epicgames.com': 'Epic Games',
    'playstation.com': 'PlayStation',
    'xbox.com': 'Xbox',
    'nintendo.com': 'Nintendo',
  };

  private readonly merchantCategories: Record<string, PurchaseCategory> = {
    amazon: 'ecommerce',
    ebay: 'ecommerce',
    etsy: 'ecommerce',
    walmart: 'ecommerce',
    target: 'ecommerce',
    costco: 'ecommerce',
    wayfair: 'ecommerce',
    aliexpress: 'ecommerce',
    wish: 'ecommerce',
    shopify: 'ecommerce',
    'best buy': 'technology',
    newegg: 'technology',
    'b&h photo': 'technology',
    apple: 'technology',
    dell: 'technology',
    hp: 'technology',
    lenovo: 'technology',
    microsoft: 'technology',
    paypal: 'payment',
    stripe: 'payment',
    square: 'payment',
    venmo: 'payment',
    netflix: 'entertainment',
    spotify: 'entertainment',
    hulu: 'entertainment',
    'disney+': 'entertainment',
    'hbo max': 'entertainment',
    steam: 'entertainment',
    'epic games': 'entertainment',
    playstation: 'entertainment',
    xbox: 'entertainment',
    nintendo: 'entertainment',
    ticketmaster: 'entertainment',
    stubhub: 'entertainment',
    seatgeek: 'entertainment',
    eventbrite: 'entertainment',
    starbucks: 'food',
    mcdonalds: 'food',
    "mcdonald's": 'food',
    doordash: 'food',
    grubhub: 'food',
    'uber eats': 'food',
    instacart: 'food',
    seamless: 'food',
    postmates: 'food',
    caviar: 'food',
    uber: 'transportation',
    lyft: 'transportation',
    southwest: 'travel',
    delta: 'travel',
    united: 'travel',
    american: 'travel',
    airbnb: 'travel',
    'booking.com': 'travel',
    expedia: 'travel',
    'home depot': 'home',
    "lowe's": 'home',
    ikea: 'home',
    nordstrom: 'fashion',
    "macy's": 'fashion',
    "kohl's": 'fashion',
    gap: 'fashion',
    'old navy': 'fashion',
    nike: 'fashion',
    adidas: 'fashion',
    sephora: 'beauty',
    ulta: 'beauty',
    chewy: 'pets',
  };

  /**
   * Detect if an email is a purchase/order confirmation
   * @param email - Email to analyze
   * @returns Detection result with purchase details
   */
  detect(email: Email): PurchaseDetectionResult {
    const subject = email.subject || '';
    const body = stripHtml(email.body || '');
    const sender = email.sender || '';

    // Check for anti-patterns (promotional emails)
    const combinedText = `${subject} ${body}`;
    let antiPatternMatches = 0;
    for (const pattern of this.antiPatterns) {
      if (pattern.test(combinedText)) {
        antiPatternMatches++;
      }
    }
    if (antiPatternMatches >= 3) {
      return { type: 'none', confidence: 0 };
    }

    let confidence = 0;
    let amount = 0;
    let currency = 'USD';
    let merchant = '';
    let orderNumber = '';

    // Check known merchants
    const domain = extractDomain(sender);
    const knownMerchant = this.findKnownMerchant(domain);
    if (knownMerchant) {
      merchant = knownMerchant;
      confidence += 30;
    }

    // Check subject patterns
    for (const pattern of this.strongSubjectPatterns) {
      if (pattern.test(subject)) {
        confidence += 35;
        break;
      }
    }

    // Check body patterns
    for (const pattern of this.strongBodyPatterns) {
      if (pattern.test(body)) {
        confidence += 25;
        break;
      }
    }

    // Extract amount if confident
    if (confidence >= 30) {
      const extracted = this.extractAmount(body);
      amount = extracted.amount;
      currency = extracted.currency;

      if (amount > 0 && amount < 10000) {
        confidence += 20;
      } else if (amount >= 10000) {
        confidence += 10;
      }

      orderNumber = this.extractOrderNumber(body);
      if (orderNumber && this.isValidOrderNumber(orderNumber)) {
        confidence += 15;
      }

      if (!merchant) {
        merchant = this.formatDomainAsMerchant(domain);
      }
    }

    if (confidence >= 70 && amount > 0 && merchant) {
      return {
        type: 'purchase',
        confidence,
        data: {
          merchant,
          amount,
          currency,
          orderNumber: this.isValidOrderNumber(orderNumber) ? orderNumber : undefined,
        },
      };
    }

    return { type: 'none', confidence: 0 };
  }

  /**
   * Detect purchases from a batch of emails
   * @param emails - Emails to analyze
   * @returns Array of detected purchases
   */
  detectBatch(emails: Email[]): Purchase[] {
    const purchases: Purchase[] = [];

    for (const email of emails) {
      const result = this.detect(email);
      if (result.type === 'purchase' && result.data?.amount) {
        purchases.push({
          emailId: email.id,
          merchant: result.data.merchant || 'Unknown',
          amount: result.data.amount,
          currency: result.data.currency || 'USD',
          purchaseDate: email.date,
          orderNumber: result.data.orderNumber,
          items: [],
          category: this.getCategory(result.data.merchant || ''),
        });
      }
    }

    return purchases;
  }

  private extractAmount(text: string): { amount: number; currency: string } {
    const contextPatterns = [
      // USD
      { currency: 'USD', pattern: /(?:order\s+)?total[:\s]+\$\s*([\d,]+\.\d{2})/i },
      { currency: 'USD', pattern: /(?:amount|total)\s+(?:charged|paid|due)[:\s]+\$\s*([\d,]+\.\d{2})/i },
      { currency: 'USD', pattern: /payment\s+(?:of|amount)[:\s]+\$\s*([\d,]+\.\d{2})/i },
      { currency: 'USD', pattern: /grand\s+total[:\s]+\$\s*([\d,]+\.\d{2})/i },
      // EUR
      { currency: 'EUR', pattern: /(?:order\s+)?total[:\s]+€\s*([\d\s.,]+[.,]\d{2})/i },
      { currency: 'EUR', pattern: /(?:amount|total)\s+(?:charged|paid|due)[:\s]+€\s*([\d\s.,]+[.,]\d{2})/i },
      { currency: 'EUR', pattern: /betrag[:\s]+€\s*([\d,]+[.,]\d{2})/i },
      { currency: 'EUR', pattern: /montant[:\s]+€\s*([\d\s]+[.,]\d{2})/i },
      { currency: 'EUR', pattern: /importe[:\s]+€\s*([\d,]+[.,]\d{2})/i },
      // GBP
      { currency: 'GBP', pattern: /(?:order\s+)?total[:\s]+£\s*([\d,]+\.\d{2})/i },
      { currency: 'GBP', pattern: /(?:amount|total)\s+(?:charged|paid|due)[:\s]+£\s*([\d,]+\.\d{2})/i },
      // JPY
      { currency: 'JPY', pattern: /(?:order\s+)?total[:\s]+¥\s*([\d,]+)/i },
      { currency: 'JPY', pattern: /(?:amount|total)[:\s]+¥\s*([\d,]+)/i },
      // CAD
      { currency: 'CAD', pattern: /(?:order\s+)?total[:\s]+C\$\s*([\d,]+\.\d{2})/i },
      // AUD
      { currency: 'AUD', pattern: /(?:order\s+)?total[:\s]+A\$\s*([\d,]+\.\d{2})/i },
      // INR
      { currency: 'INR', pattern: /(?:order\s+)?total[:\s]+₹\s*([\d,]+\.\d{2})/i },
      // CHF
      { currency: 'CHF', pattern: /(?:order\s+)?total[:\s]+CHF\s*([\d',]+\.\d{2})/i },
    ];

    for (const { currency, pattern } of contextPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const amount = parseMoney(match[1], currency);
        if (amount > 0) {
          return { amount, currency };
        }
      }
    }

    // Fallback: detect currency from any amount found
    const currencyMatches = [
      { currency: 'EUR', regex: /€\s*([\d\s.,]+[.,]\d{2})/g },
      { currency: 'GBP', regex: /£\s*([\d,]+\.\d{2})/g },
      { currency: 'JPY', regex: /¥\s*([\d,]+)/g },
      { currency: 'INR', regex: /₹\s*([\d,]+[.,]\d{2})/g },
      { currency: 'USD', regex: /\$\s*([\d,]+\.\d{2})/g },
    ];

    for (const { currency, regex } of currencyMatches) {
      const allAmounts = [...text.matchAll(regex)];
      if (allAmounts.length >= 1 && allAmounts.length <= 5) {
        const amounts = allAmounts
          .map((m) => parseMoney(m[1], currency))
          .filter((a) => a > 0 && a < 500000);

        if (amounts.length > 0) {
          return { amount: Math.max(...amounts), currency };
        }
      }
    }

    return { amount: 0, currency: 'USD' };
  }

  private extractOrderNumber(text: string): string {
    const patterns = [
      /order\s*(?:#|number|no\.?)[:\s]*([A-Z0-9][A-Z0-9-]{4,20})/i,
      /confirmation\s*(?:#|number|no\.?)[:\s]*([A-Z0-9][A-Z0-9-]{4,20})/i,
      /(?:order|reference)\s+(?:id|#)[:\s]*([A-Z0-9][A-Z0-9-]{4,20})/i,
      /tracking\s*(?:#|number)[:\s]*([A-Z0-9][A-Z0-9-]{8,30})/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const orderNum = match[1].trim();
        if (this.isValidOrderNumber(orderNum)) {
          return orderNum;
        }
      }
    }

    return '';
  }

  private isValidOrderNumber(orderNum: string): boolean {
    if (!orderNum || orderNum.length < 5 || orderNum.length > 30) {
      return false;
    }
    if (!/^[A-Z0-9]/i.test(orderNum)) {
      return false;
    }
    if (!/^[A-Z0-9-]+$/i.test(orderNum)) {
      return false;
    }
    const cssPatterns = ['-collapse', '-color', '-width', '-height', '-size', '-weight', '-style'];
    for (const pattern of cssPatterns) {
      if (orderNum.toLowerCase().includes(pattern)) {
        return false;
      }
    }
    return true;
  }

  private findKnownMerchant(domain: string): string | null {
    if (this.knownMerchants[domain]) {
      return this.knownMerchants[domain];
    }

    for (const [merchantDomain, name] of Object.entries(this.knownMerchants)) {
      if (domain === merchantDomain || domain.endsWith('.' + merchantDomain)) {
        return name;
      }
    }

    return null;
  }

  private formatDomainAsMerchant(domain: string): string {
    if (!domain) return '';

    const parts = domain.split('.');
    if (parts.length < 2) return '';

    let mainPart = parts.length > 2 ? parts[parts.length - 2] : parts[0];

    const skipWords = ['mail', 'email', 'noreply', 'no-reply', 'notifications', 'info', 'support', 'orders', 'receipts', 'billing'];
    if (skipWords.includes(mainPart.toLowerCase()) && parts.length > 2) {
      mainPart = parts[parts.length - 2];
    }

    return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
  }

  /**
   * Get the category for a merchant
   * @param merchant - Merchant name
   * @returns Purchase category
   */
  getCategory(merchant: string): PurchaseCategory {
    const lowerMerchant = merchant.toLowerCase();

    for (const [key, category] of Object.entries(this.merchantCategories)) {
      if (lowerMerchant.includes(key.toLowerCase())) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Get all known merchants
   * @returns List of known merchant domains with names
   */
  getKnownMerchants(): { domain: string; name: string }[] {
    return Object.entries(this.knownMerchants).map(([domain, name]) => ({
      domain,
      name,
    }));
  }
}


/**
 * OLM Parser - Type Definitions
 * @packageDocumentation
 */

// ============================================================================
// Core Email Types
// ============================================================================

/**
 * Represents an email attachment
 */
export interface Attachment {
  /** Unique identifier for the attachment */
  id: string;
  /** Original filename */
  filename: string;
  /** MIME type (e.g., 'image/png', 'application/pdf') */
  mimeType: string;
  /** Size in bytes */
  size: number;
  /** Base64 encoded data (optional, for inline attachments) */
  data?: string;
}

/**
 * Represents a parsed email
 */
export interface Email {
  /** Auto-generated ID (available after parsing) */
  id?: number;
  /** Email subject line */
  subject: string;
  /** Sender email address */
  sender: string;
  /** Sender display name */
  senderName?: string;
  /** List of recipient email addresses */
  recipients: string[];
  /** CC recipients */
  cc?: string[];
  /** BCC recipients */
  bcc?: string[];
  /** Email sent/received date */
  date: Date;
  /** Plain text body */
  body: string;
  /** HTML body (if available) */
  htmlBody?: string;
  /** List of attachments */
  attachments: Attachment[];
  /** Email size in bytes */
  size: number;
  /** Whether the email has been read */
  isRead: boolean;
  /** Whether the email is starred/flagged */
  isStarred: boolean;
  /** Folder identifier */
  folderId: string;
  /** Thread/conversation ID */
  threadId?: string;
  /** Original ID from the source archive */
  originalId?: string;
}

/**
 * Represents a contact
 */
export interface Contact {
  /** Auto-generated ID */
  id?: number;
  /** Contact display name */
  name: string;
  /** Primary email address */
  email: string;
  /** Phone number */
  phone?: string;
  /** Notes or additional info */
  notes?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Number of emails from this contact */
  emailCount: number;
  /** Date of last email from this contact */
  lastEmailDate: Date;
}

/**
 * Represents a calendar event
 */
export interface CalendarEvent {
  /** Auto-generated ID */
  id?: number;
  /** Event title */
  title: string;
  /** Start date and time */
  startDate: Date;
  /** End date and time */
  endDate: Date;
  /** Event location */
  location?: string;
  /** List of attendee emails */
  attendees: string[];
  /** Event description */
  description?: string;
  /** Whether this is an all-day event */
  isAllDay: boolean;
  /** Whether a reminder is set */
  reminder?: boolean;
}

// ============================================================================
// Detection Types
// ============================================================================

/**
 * Service type categories for detected accounts
 */
export type ServiceType = 
  | 'streaming' 
  | 'ecommerce' 
  | 'social' 
  | 'banking' 
  | 'communication' 
  | 'development' 
  | 'other';

/**
 * Represents a detected account/service signup
 */
export interface Account {
  /** Auto-generated ID */
  id?: number;
  /** Service name (e.g., 'Netflix', 'GitHub') */
  serviceName: string;
  /** ID of the signup email */
  signupEmailId?: number;
  /** Date of account creation */
  signupDate: Date;
  /** Type of service */
  serviceType: ServiceType;
  /** Domain of the service */
  domain: string;
  /** Last activity date */
  lastActivityDate?: Date;
  /** Number of emails from this service */
  emailCount: number;
}

/**
 * Purchase/order categories
 */
export type PurchaseCategory = 
  | 'ecommerce'
  | 'technology'
  | 'payment'
  | 'entertainment'
  | 'food'
  | 'transportation'
  | 'travel'
  | 'home'
  | 'fashion'
  | 'beauty'
  | 'pets'
  | 'other';

/**
 * Represents a detected purchase
 */
export interface Purchase {
  /** Auto-generated ID */
  id?: number;
  /** ID of the purchase email */
  emailId?: number;
  /** Merchant name */
  merchant: string;
  /** Purchase amount */
  amount: number;
  /** Currency code (USD, EUR, GBP, etc.) */
  currency: string;
  /** Purchase date */
  purchaseDate: Date;
  /** Order/confirmation number */
  orderNumber?: string;
  /** List of purchased items (if extractable) */
  items: string[];
  /** Purchase category */
  category: PurchaseCategory;
}

/**
 * Subscription billing frequency
 */
export type SubscriptionFrequency = 'weekly' | 'monthly' | 'yearly';

/**
 * Subscription categories
 */
export type SubscriptionCategory = 'streaming' | 'software' | 'news' | 'fitness' | 'other';

/**
 * Represents a detected subscription service
 */
export interface Subscription {
  /** Auto-generated ID */
  id?: number;
  /** Service name */
  serviceName: string;
  /** Monthly cost (normalized to monthly for comparison) */
  monthlyAmount: number;
  /** Currency code */
  currency: string;
  /** Billing frequency */
  frequency: SubscriptionFrequency;
  /** Last renewal/billing date */
  lastRenewalDate: Date;
  /** Next renewal date (if known) */
  nextRenewalDate?: Date;
  /** IDs of related emails */
  emailIds: number[];
  /** Whether subscription is currently active */
  isActive: boolean;
  /** Subscription category */
  category: SubscriptionCategory;
}

/**
 * Represents a detected newsletter sender
 */
export interface Newsletter {
  /** Auto-generated ID */
  id?: number;
  /** Sender email address */
  senderEmail: string;
  /** Sender display name */
  senderName: string;
  /** Number of emails received */
  emailCount: number;
  /** Date of last email */
  lastEmailDate: Date;
  /** Estimated sending frequency */
  frequency?: 'daily' | 'weekly' | 'monthly' | 'irregular';
  /** Unsubscribe link (if found) */
  unsubscribeLink?: string;
  /** Whether this is promotional vs informational */
  isPromotional: boolean;
}

// ============================================================================
// Detection Result Types
// ============================================================================

/**
 * Result of account detection
 */
export interface AccountDetectionResult {
  /** Type of detection */
  type: 'account' | 'none';
  /** Confidence score (0-100) */
  confidence: number;
  /** Detected data */
  data?: {
    serviceName?: string;
    serviceType?: ServiceType;
  };
}

/**
 * Result of purchase detection
 */
export interface PurchaseDetectionResult {
  /** Type of detection */
  type: 'purchase' | 'none';
  /** Confidence score (0-100) */
  confidence: number;
  /** Detected data */
  data?: {
    merchant?: string;
    amount?: number;
    currency?: string;
    orderNumber?: string;
  };
}

/**
 * Result of subscription detection
 */
export interface SubscriptionDetectionResult {
  /** Whether this is a subscription email */
  isSubscription: boolean;
  /** Service name */
  serviceName?: string;
  /** Subscription category */
  category?: SubscriptionCategory;
  /** Detected amount */
  amount?: number;
  /** Currency */
  currency?: string;
  /** Billing frequency */
  frequency?: SubscriptionFrequency;
}

/**
 * Result of newsletter detection
 */
export interface NewsletterDetectionResult {
  /** Whether this is a newsletter */
  isNewsletter: boolean;
  /** Whether this is promotional */
  isPromotional: boolean;
  /** Detection confidence (0-100) */
  confidence: number;
  /** Extracted unsubscribe link */
  unsubscribeLink?: string;
}

// ============================================================================
// Parser Types
// ============================================================================

/**
 * Stages of OLM/MBOX parsing process
 */
export type ParsingStage = 
  | 'extracting' 
  | 'parsing_emails' 
  | 'parsing_contacts' 
  | 'parsing_calendar' 
  | 'detecting' 
  | 'complete';

/**
 * Progress callback information
 */
export interface ParseProgress {
  /** Current processing stage */
  stage: ParsingStage;
  /** Progress percentage (0-100) */
  progress: number;
  /** Human-readable status message */
  message: string;
}

/**
 * Callback function for progress updates
 */
export type ProgressCallback = (progress: ParseProgress) => void;

/**
 * Options for parsing operations
 */
export interface ParseOptions {
  /** Progress callback function */
  onProgress?: ProgressCallback;
  /** Whether to run account detection */
  detectAccounts?: boolean;
  /** Whether to run purchase detection */
  detectPurchases?: boolean;
  /** Whether to run subscription detection */
  detectSubscriptions?: boolean;
  /** Whether to run newsletter detection */
  detectNewsletters?: boolean;
  /** Whether to include attachment data */
  includeAttachments?: boolean;
}

/**
 * Result of parsing an email archive
 */
export interface ParseResult {
  /** Parsed emails */
  emails: Email[];
  /** Parsed contacts */
  contacts: Contact[];
  /** Parsed calendar events */
  calendarEvents: CalendarEvent[];
  /** Detected accounts (if detectAccounts enabled) */
  accounts?: Account[];
  /** Detected purchases (if detectPurchases enabled) */
  purchases?: Purchase[];
  /** Detected subscriptions (if detectSubscriptions enabled) */
  subscriptions?: Subscription[];
  /** Detected newsletters (if detectNewsletters enabled) */
  newsletters?: Newsletter[];
  /** Summary statistics */
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


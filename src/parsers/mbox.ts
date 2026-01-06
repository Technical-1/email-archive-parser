/**
 * OLM Parser - MBOX Format Parser
 * @packageDocumentation
 */

import type { Email, ParseOptions, ParseResult, ParseProgress, Contact } from '../types';
import {
  cleanEmailAddress,
  normalizeSubject,
  decodeQuotedPrintable,
  decodeHeaderValue,
} from '../utils';

/**
 * Callback for streaming email processing (for large files)
 */
export type EmailBatchCallback = (emails: Omit<Email, 'id'>[], batchNumber: number) => Promise<void>;

/**
 * Extended options for MBOX parsing
 */
export interface MBOXParseOptions extends ParseOptions {
  /** 
   * If true, also extract contacts from email senders
   * @default true
   */
  extractContacts?: boolean;
}

/**
 * Parser for MBOX email archive format
 * Compatible with Gmail Takeout, Mozilla Thunderbird, and other email clients
 * 
 * Features:
 * - Streaming/chunked processing for large files (including multi-GB files)
 * - Automatic file path support in Node.js with streaming
 * - MIME multipart parsing
 * - Gmail label support
 * - Multi-encoding support (quoted-printable, base64)
 * - Contact extraction from email senders
 *
 * @example
 * ```typescript
 * import { MBOXParser } from '@jacobkanfer/email-archive-parser';
 *
 * const parser = new MBOXParser();
 * 
 * // Browser usage with File object
 * const result = await parser.parse(file, {
 *   onProgress: (progress) => console.log(progress.message),
 * });
 * 
 * // Node.js usage with file path (handles any file size)
 * const result = await parser.parseFile('/path/to/archive.mbox', {
 *   onProgress: (progress) => console.log(progress.message),
 * });
 *
 * console.log(`Parsed ${result.emails.length} emails`);
 * ```
 */
export class MBOXParser {
  private readonly CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
  private readonly BATCH_SIZE = 100; // Process 100 emails at a time
  private readonly NODE_CHUNK_SIZE = 100 * 1024 * 1024; // 100MB chunks for Node.js streaming

  /**
   * Parse an MBOX file
   * @param file - File object (browser) or Buffer (Node.js)
   * @param options - Parsing options
   * @returns Parsed data
   */
  async parse(
    file: File | Buffer | ArrayBuffer,
    options: ParseOptions = {}
  ): Promise<ParseResult> {
    const { onProgress } = options;

    const result: ParseResult = {
      emails: [],
      contacts: [],
      calendarEvents: [],
      stats: {
        emailCount: 0,
        contactCount: 0,
        calendarEventCount: 0,
        accountCount: 0,
        purchaseCount: 0,
        subscriptionCount: 0,
        newsletterCount: 0,
      },
    };

    // For File objects, use streaming for large files
    if (file instanceof File && file.size > 20 * 1024 * 1024) {
      const count = await this.parseStreaming(file, onProgress, async (batch) => {
        result.emails.push(...(batch as Email[]));
      });
      result.stats.emailCount = count;
      return result;
    }

    // Check for large buffers that exceed Node.js string limit (~512MB)
    const MAX_STRING_SIZE = 500 * 1024 * 1024; // 500MB to be safe
    if (Buffer.isBuffer(file) && file.length > MAX_STRING_SIZE) {
      // Process large buffer in chunks
      this.reportProgress(onProgress, 'extracting', 0, 'Processing large MBOX file in chunks...');
      const count = await this.parseLargeBuffer(file, onProgress, async (batch) => {
        result.emails.push(...(batch as Email[]));
      });
      result.stats.emailCount = count;
      return result;
    }

    // For smaller files or Buffers, use simple parsing
    this.reportProgress(onProgress, 'extracting', 0, 'Reading MBOX file...');

    let text: string;
    if (file instanceof File) {
      text = await file.text();
    } else if (typeof Blob !== 'undefined' && file instanceof Blob) {
      // Handle Blob (browser)
      text = await file.text();
    } else if (Buffer.isBuffer(file)) {
      text = file.toString('utf-8');
    } else if (file instanceof ArrayBuffer) {
      text = new TextDecoder().decode(file);
    } else if (ArrayBuffer.isView(file)) {
      text = new TextDecoder().decode(file);
    } else {
      // Fallback: try to convert to string
      text = String(file);
    }

    // Normalize line endings
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedText.split('\n');

    let currentEmail: string[] = [];
    let totalEmails = 0;
    let processedEmails = 0;

    // Count emails first
    for (const line of lines) {
      if (this.isFromLine(line)) {
        totalEmails++;
      }
    }

    this.reportProgress(
      onProgress,
      'parsing_emails',
      10,
      `Found ${totalEmails} emails, parsing...`
    );

    // Parse emails
    for (const line of lines) {
      if (this.isFromLine(line) && currentEmail.length > 0) {
        const email = this.parseEmailFromLines(currentEmail);
        if (email) {
          result.emails.push(email as Email);
          result.stats.emailCount++;
          processedEmails++;

          if (processedEmails % 100 === 0) {
            const progress = 10 + (processedEmails / totalEmails) * 90;
            this.reportProgress(
              onProgress,
              'parsing_emails',
              progress,
              `Parsed ${processedEmails} of ${totalEmails} emails`
            );
          }
        }
        currentEmail = [];
      }

      currentEmail.push(line);
    }

    // Parse last email
    if (currentEmail.length > 0 && currentEmail.some((line) => line.trim().length > 0)) {
      const email = this.parseEmailFromLines(currentEmail);
      if (email) {
        result.emails.push(email as Email);
        result.stats.emailCount++;
      }
    }

    // Extract contacts from email senders
    const mboxOptions = options as MBOXParseOptions;
    if (mboxOptions.extractContacts !== false) {
      this.extractContactsFromEmails(result);
    }

    this.reportProgress(
      onProgress,
      'complete',
      100,
      `Parsed ${result.stats.emailCount} emails successfully`
    );

    return result;
  }

  /**
   * Parse an MBOX file from a file path (Node.js only)
   * Uses true streaming for any file size - no memory limits
   * 
   * @param filePath - Path to the MBOX file
   * @param options - Parsing options
   * @returns Parsed data
   * 
   * @example
   * ```typescript
   * // Parse a multi-gigabyte MBOX file efficiently
   * const result = await parser.parseFile('/path/to/large.mbox', {
   *   onProgress: (p) => console.log(`${p.progress}%: ${p.message}`),
   * });
   * ```
   */
  async parseFile(
    filePath: string,
    options: MBOXParseOptions = {}
  ): Promise<ParseResult> {
    const { onProgress } = options;

    // Dynamic import of Node.js modules
    const fs = await import('fs');
    const path = await import('path');

    const result: ParseResult = {
      emails: [],
      contacts: [],
      calendarEvents: [],
      stats: {
        emailCount: 0,
        contactCount: 0,
        calendarEventCount: 0,
        accountCount: 0,
        purchaseCount: 0,
        subscriptionCount: 0,
        newsletterCount: 0,
      },
    };

    // Get file size
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const fileSizeMB = (fileSize / 1024 / 1024).toFixed(1);

    this.reportProgress(
      onProgress,
      'extracting',
      0,
      `Opening ${fileSizeMB}MB file: ${path.basename(filePath)}`
    );

    // Create read stream with 100MB chunks
    const stream = fs.createReadStream(filePath, {
      highWaterMark: this.NODE_CHUNK_SIZE,
      encoding: 'utf-8',
    });

    let leftover = '';
    let bytesRead = 0;
    let totalEmailsParsed = 0;

    for await (const chunk of stream) {
      const chunkStr = chunk as string;
      bytesRead += Buffer.byteLength(chunkStr, 'utf-8');

      const textToProcess = leftover + chunkStr;
      const lastFromIndex = this.findLastFromLine(textToProcess);

      let processableText: string;
      if (lastFromIndex > 0 && bytesRead < fileSize) {
        processableText = textToProcess.substring(0, lastFromIndex);
        leftover = textToProcess.substring(lastFromIndex);
      } else {
        processableText = textToProcess;
        leftover = '';
      }

      // Parse emails from this chunk
      const chunkEmails = this.parseEmailsFromText(processableText);
      
      for (const email of chunkEmails) {
        result.emails.push(email as Email);
        totalEmailsParsed++;
      }

      const progress = Math.round((bytesRead / fileSize) * 95);
      this.reportProgress(
        onProgress,
        'parsing_emails',
        progress,
        `Parsed ${totalEmailsParsed} emails (${Math.round((bytesRead / fileSize) * 100)}% read)...`
      );
    }

    // Process remaining text
    if (leftover.trim()) {
      const finalEmails = this.parseEmailsFromText(leftover);
      for (const email of finalEmails) {
        result.emails.push(email as Email);
        totalEmailsParsed++;
      }
    }

    result.stats.emailCount = totalEmailsParsed;

    // Extract contacts from email senders
    if (options.extractContacts !== false) {
      this.extractContactsFromEmails(result);
    }

    this.reportProgress(
      onProgress,
      'complete',
      100,
      `Parsed ${totalEmailsParsed} emails successfully`
    );

    return result;
  }

  /**
   * Extract contacts from email senders
   */
  private extractContactsFromEmails(result: ParseResult): void {
    const senderMap = new Map<string, { name: string; emailCount: number; lastEmailDate: Date }>();

    for (const email of result.emails) {
      if (email.sender && email.sender !== 'unknown@example.com') {
        const existing = senderMap.get(email.sender);
        if (existing) {
          existing.emailCount++;
          if (email.date > existing.lastEmailDate) {
            existing.lastEmailDate = email.date;
          }
        } else {
          senderMap.set(email.sender, {
            name: email.senderName || email.sender.split('@')[0] || 'Unknown',
            emailCount: 1,
            lastEmailDate: email.date,
          });
        }
      }
    }

    // Add contacts
    for (const [email, data] of senderMap) {
      result.contacts.push({
        name: data.name,
        email: cleanEmailAddress(email),
        phone: undefined,
        emailCount: data.emailCount,
        lastEmailDate: data.lastEmailDate,
      } as Contact);
      result.stats.contactCount++;
    }
  }

  /**
   * Parse an MBOX file with streaming batch processing
   * More memory efficient for large files
   * @param file - File to parse
   * @param onProgress - Progress callback
   * @param onBatch - Callback for each batch of parsed emails
   * @returns Total number of emails parsed
   */
  async parseStreaming(
    file: File,
    onProgress?: (progress: ParseProgress) => void,
    onBatch?: EmailBatchCallback
  ): Promise<number> {
    const fileSize = file.size;
    let offset = 0;
    let leftover = '';
    let totalEmailsParsed = 0;
    let currentBatch: Omit<Email, 'id'>[] = [];
    let batchNumber = 0;

    this.reportProgress(
      onProgress,
      'extracting',
      0,
      `Processing ${(fileSize / 1024 / 1024).toFixed(1)}MB file...`
    );

    while (offset < fileSize) {
      const chunkEnd = Math.min(offset + this.CHUNK_SIZE, fileSize);
      const chunk = file.slice(offset, chunkEnd);

      let chunkText: string;
      try {
        chunkText = await chunk.text();
      } catch (e) {
        console.error('Error reading chunk:', e);
        break;
      }

      const textToProcess = leftover + chunkText;
      const lastFromIndex = this.findLastFromLine(textToProcess);

      let processableText: string;
      if (lastFromIndex > 0 && chunkEnd < fileSize) {
        processableText = textToProcess.substring(0, lastFromIndex);
        leftover = textToProcess.substring(lastFromIndex);
      } else {
        processableText = textToProcess;
        leftover = '';
      }

      // Parse emails from this chunk
      const chunkEmails = this.parseEmailsFromText(processableText);

      for (const email of chunkEmails) {
        currentBatch.push(email);

        if (currentBatch.length >= this.BATCH_SIZE) {
          if (onBatch) {
            await onBatch(currentBatch, batchNumber);
          }
          totalEmailsParsed += currentBatch.length;
          batchNumber++;
          currentBatch = [];

          // Yield to UI
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      offset = chunkEnd;
      const progress = Math.round((offset / fileSize) * 95);
      this.reportProgress(
        onProgress,
        'parsing_emails',
        progress,
        `Parsed ${totalEmailsParsed + currentBatch.length} emails (${Math.round((offset / fileSize) * 100)}% read)...`
      );

      // Yield to prevent UI blocking
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Process remaining text
    if (leftover.trim()) {
      const finalEmails = this.parseEmailsFromText(leftover);
      for (const email of finalEmails) {
        currentBatch.push(email);
      }
    }

    // Process final batch
    if (currentBatch.length > 0 && onBatch) {
      await onBatch(currentBatch, batchNumber);
      totalEmailsParsed += currentBatch.length;
    }

    this.reportProgress(
      onProgress,
      'complete',
      100,
      `Parsed ${totalEmailsParsed} emails successfully`
    );

    return totalEmailsParsed;
  }

  /**
   * Parse a large Buffer in chunks to avoid Node.js string size limits
   * @param buffer - Buffer to parse
   * @param onProgress - Progress callback
   * @param onBatch - Callback for each batch of parsed emails
   * @returns Total number of emails parsed
   */
  private async parseLargeBuffer(
    buffer: Buffer,
    onProgress?: (progress: ParseProgress) => void,
    onBatch?: EmailBatchCallback
  ): Promise<number> {
    const bufferSize = buffer.length;
    // Use 100MB chunks to stay well under the 512MB string limit
    const CHUNK_SIZE = 100 * 1024 * 1024;
    let offset = 0;
    let leftover = '';
    let totalEmailsParsed = 0;
    let currentBatch: Omit<Email, 'id'>[] = [];
    let batchNumber = 0;

    this.reportProgress(
      onProgress,
      'extracting',
      0,
      `Processing large ${(bufferSize / 1024 / 1024).toFixed(1)}MB file in chunks...`
    );

    while (offset < bufferSize) {
      const chunkEnd = Math.min(offset + CHUNK_SIZE, bufferSize);
      const chunk = buffer.subarray(offset, chunkEnd);

      let chunkText: string;
      try {
        chunkText = chunk.toString('utf-8');
      } catch (e) {
        console.error('Error reading buffer chunk:', e);
        break;
      }

      const textToProcess = leftover + chunkText;
      const lastFromIndex = this.findLastFromLine(textToProcess);

      let processableText: string;
      if (lastFromIndex > 0 && chunkEnd < bufferSize) {
        processableText = textToProcess.substring(0, lastFromIndex);
        leftover = textToProcess.substring(lastFromIndex);
      } else {
        processableText = textToProcess;
        leftover = '';
      }

      // Parse emails from this chunk
      const chunkEmails = this.parseEmailsFromText(processableText);

      for (const email of chunkEmails) {
        currentBatch.push(email);

        if (currentBatch.length >= this.BATCH_SIZE) {
          if (onBatch) {
            await onBatch(currentBatch, batchNumber);
          }
          totalEmailsParsed += currentBatch.length;
          batchNumber++;
          currentBatch = [];
        }
      }

      offset = chunkEnd;
      const progress = Math.round((offset / bufferSize) * 95);
      this.reportProgress(
        onProgress,
        'parsing_emails',
        progress,
        `Parsed ${totalEmailsParsed + currentBatch.length} emails (${Math.round((offset / bufferSize) * 100)}% read)...`
      );
    }

    // Process remaining text
    if (leftover.trim()) {
      const finalEmails = this.parseEmailsFromText(leftover);
      for (const email of finalEmails) {
        currentBatch.push(email);
      }
    }

    // Process final batch
    if (currentBatch.length > 0 && onBatch) {
      await onBatch(currentBatch, batchNumber);
      totalEmailsParsed += currentBatch.length;
    }

    this.reportProgress(
      onProgress,
      'complete',
      100,
      `Parsed ${totalEmailsParsed} emails successfully`
    );

    return totalEmailsParsed;
  }

  private reportProgress(
    callback: ((progress: ParseProgress) => void) | undefined,
    stage: ParseProgress['stage'],
    progress: number,
    message: string
  ): void {
    callback?.({ stage, progress, message });
  }

  /**
   * Check if a line is a valid MBOX "From " line
   */
  private isFromLine(line: string): boolean {
    if (!line.startsWith('From ')) return false;
    // Validate with day pattern (e.g., "From user@example.com Mon Jan 01 00:00:00 2024")
    const dayPattern = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/;
    return dayPattern.test(line);
  }

  /**
   * Find the index of the last "From " line in text
   */
  private findLastFromLine(text: string): number {
    let lastIndex = -1;
    let searchStart = text.length - 1;

    while (searchStart > 0) {
      let idx = text.lastIndexOf('\nFrom ', searchStart);

      if (idx === -1) break;

      const lineStart = idx + 1;
      let lineEnd = text.indexOf('\n', lineStart);
      if (lineEnd === -1) lineEnd = text.length;
      const line = text.substring(lineStart, lineEnd);

      if (this.isFromLine(line)) {
        lastIndex = lineStart;
        break;
      }
      searchStart = idx - 1;
    }

    // Check if text starts with "From "
    if (lastIndex === -1 && text.startsWith('From ')) {
      let lineEnd = text.indexOf('\n');
      if (lineEnd === -1) lineEnd = text.length;
      const line = text.substring(0, lineEnd);
      if (this.isFromLine(line)) {
        lastIndex = 0;
      }
    }

    return lastIndex;
  }

  /**
   * Parse multiple emails from a text block
   */
  private parseEmailsFromText(text: string): Omit<Email, 'id'>[] {
    const emails: Omit<Email, 'id'>[] = [];
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedText.split('\n');
    let currentEmail: string[] = [];

    for (const line of lines) {
      if (this.isFromLine(line) && currentEmail.length > 0) {
        const email = this.parseEmailFromLines(currentEmail);
        if (email) {
          emails.push(email);
        }
        currentEmail = [];
      }
      currentEmail.push(line);
    }

    // Parse last email in chunk
    if (currentEmail.length > 0 && currentEmail.some((line) => line.trim().length > 0)) {
      const email = this.parseEmailFromLines(currentEmail);
      if (email) {
        emails.push(email);
      }
    }

    return emails;
  }

  /**
   * Parse a single email from raw lines
   */
  private parseEmailFromLines(lines: string[]): Omit<Email, 'id'> | null {
    try {
      if (lines.length < 2) return null;

      const headers: Record<string, string> = {};
      let bodyStartIndex = 0;
      let inHeaders = true;

      // Parse headers (skip the "From " line)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim() === '') {
          bodyStartIndex = i + 1;
          inHeaders = false;
          break;
        }

        if (inHeaders) {
          if (line.match(/^\s+/) && Object.keys(headers).length > 0) {
            const lastKey = Object.keys(headers).pop()!;
            headers[lastKey] += ' ' + line.trim();
          } else {
            const match = line.match(/^([^:]+):\s*(.*)$/);
            if (match) {
              const key = match[1].toLowerCase();
              headers[key] = match[2];
            }
          }
        }
      }

      if (inHeaders) {
        bodyStartIndex = lines.length;
      }

      // Extract body content
      const bodyLines = lines.slice(bodyStartIndex);
      const rawBody = bodyLines.join('\n');

      // Parse body based on content type
      const contentType = headers['content-type'] || 'text/plain';
      let body = '';
      let htmlBody: string | undefined;

      if (contentType.includes('multipart/')) {
        // Extract boundary from content-type (handle quoted and unquoted)
        const boundaryMatch = contentType.match(/boundary="([^"]+)"/i) || 
                              contentType.match(/boundary='([^']+)'/i) ||
                              contentType.match(/boundary=([^\s;]+)/i);
        if (boundaryMatch) {
          const boundary = boundaryMatch[1];
          const parts = this.parseMimeParts(rawBody, boundary);
          body = parts.text || '';
          htmlBody = parts.html;
          
          // Fallback: if no text/html parts found, try raw body
          if (!body && !htmlBody && rawBody.length > 0) {
            // Check if there's visible content after stripping MIME boundaries
            const stripped = rawBody
              .replace(/--[^\n]+\n/g, '')
              .replace(/Content-Type:[^\n]+\n/gi, '')
              .replace(/Content-Transfer-Encoding:[^\n]+\n/gi, '')
              .replace(/Content-Disposition:[^\n]+\n/gi, '')
              .trim();
            if (stripped.length > 20) {
              body = stripped;
            }
          }
        } else {
          body = rawBody;
        }
      } else {
        // Single part email
        body = rawBody;
        const encoding = headers['content-transfer-encoding']?.toLowerCase();
        if (encoding === 'quoted-printable') {
          body = decodeQuotedPrintable(body);
        } else if (encoding === 'base64') {
          body = this.decodeBase64(body.replace(/\s/g, ''));
        }

        if (contentType.includes('text/html')) {
          htmlBody = body;
        }
      }

      const dateStr = headers['date'] || '';
      const date = this.parseDate(dateStr);

      const from = headers['from'] || '';
      const { email: sender, name: senderName } = this.parseEmailAddress(from);

      const to = headers['to'] || '';
      const recipients = this.parseRecipients(to);

      const subject = decodeHeaderValue(headers['subject'] || '(No Subject)');

      // Extract thread ID (with Gmail support)
      let threadId =
        headers['x-gm-thrid'] ||
        headers['thread-topic'] ||
        headers['references']?.split(/\s+/)[0] ||
        headers['in-reply-to'];

      if (!threadId) {
        const normalizedSubj = normalizeSubject(subject);
        if (normalizedSubj) {
          threadId = `subject:${normalizedSubj.toLowerCase().replace(/\s+/g, '-')}`;
        }
      }

      // Parse Gmail labels for folder assignment
      const gmailLabels = headers['x-gmail-labels'] || '';
      const folderId = this.mapGmailLabelsToFolder(gmailLabels);
      const isRead = !gmailLabels.toLowerCase().includes('unread');
      const isStarred = gmailLabels.toLowerCase().includes('starred');
      const labels = this.parseGmailLabels(gmailLabels);

      // Validate this is a real email, not a MIME attachment part
      if (!sender && !subject) {
        return null;
      }

      // Skip if sender looks invalid (no @ sign and not a known pattern)
      if (!sender || (!sender.includes('@') && sender !== 'unknown')) {
        return null;
      }

      // Skip if body looks like binary/base64 image data (JPEG, PNG, etc.)
      const trimmedBody = body.trim();
      if (this.looksLikeBinaryData(trimmedBody)) {
        return null;
      }

      // Skip if subject is default and body is mostly non-printable
      if (subject === '(No Subject)' && this.hasMostlyNonPrintable(trimmedBody)) {
        return null;
      }

      return {
        subject,
        sender: cleanEmailAddress(sender),
        senderName: senderName || undefined,
        recipients,
        date: date || new Date(),
        body: trimmedBody || (htmlBody ? this.stripHtml(htmlBody) : ''),
        htmlBody,
        attachments: [],
        size: Math.min(lines.join('\n').length, 100000), // Cap size calculation
        isRead,
        isStarred,
        folderId,
        threadId,
        labels: labels.length > 0 ? labels : undefined,
        messageId: headers['message-id'] || undefined,
        hasAttachments: false, // Will be updated when parsing attachments
      };
    } catch (error) {
      console.warn('Failed to parse email:', error);
      return null;
    }
  }

  /**
   * Parse Gmail labels and return the primary folder ID
   */
  private mapGmailLabelsToFolder(labels: string): string {
    const labelList = this.parseGmailLabels(labels);

    // Priority order for folder assignment
    if (labelList.includes('inbox')) return 'inbox';
    if (labelList.includes('sent') || labelList.includes('sent mail')) return 'sent';
    if (labelList.includes('draft') || labelList.includes('drafts')) return 'drafts';
    if (labelList.includes('spam')) return 'spam';
    if (labelList.includes('trash')) return 'trash';

    // Check for custom labels (not category/system labels)
    const customLabels = labelList.filter(
      (l) =>
        !l.startsWith('category ') &&
        !['opened', 'unread', 'starred', 'important', 'all mail'].includes(l)
    );

    if (customLabels.length > 0) {
      return this.labelToFolderId(customLabels[0]);
    }

    return 'archive';
  }

  /**
   * Parse the X-Gmail-Labels header into an array of label names
   */
  parseGmailLabels(labelsHeader: string): string[] {
    if (!labelsHeader) return [];

    const labels: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of labelsHeader) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        if (current.trim()) {
          labels.push(current.trim().toLowerCase());
        }
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      labels.push(current.trim().toLowerCase());
    }

    return labels;
  }

  /**
   * Convert a label name to a valid folder ID
   */
  private labelToFolderId(label: string): string {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }

  /**
   * Get all unique folder IDs from a labels header
   */
  getAllFolderIdsFromLabels(labelsHeader: string): string[] {
    const labels = this.parseGmailLabels(labelsHeader);
    const folderIds = new Set<string>();

    if (labels.includes('inbox')) folderIds.add('inbox');
    if (labels.includes('sent') || labels.includes('sent mail')) folderIds.add('sent');
    if (labels.includes('draft') || labels.includes('drafts')) folderIds.add('drafts');
    if (labels.includes('spam')) folderIds.add('spam');
    if (labels.includes('trash')) folderIds.add('trash');

    for (const label of labels) {
      if (
        !label.startsWith('category ') &&
        ![
          'opened',
          'unread',
          'starred',
          'important',
          'all mail',
          'inbox',
          'sent',
          'sent mail',
          'draft',
          'drafts',
          'spam',
          'trash',
        ].includes(label)
      ) {
        folderIds.add(this.labelToFolderId(label));
      }
    }

    return Array.from(folderIds);
  }

  /**
   * Parse MIME multipart content and extract text/html parts
   */
  private parseMimeParts(body: string, boundary: string): { text?: string; html?: string } {
    const result: { text?: string; html?: string } = {};

    // Normalize line endings before processing
    const normalizedBody = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const boundaryMarker = '--' + boundary;
    const parts = normalizedBody.split(boundaryMarker);

    for (const part of parts) {
      if (!part.trim() || part.trim() === '--') continue;

      // Look for double newline (header/body separator)
      let headerEndIndex = part.indexOf('\n\n');
      if (headerEndIndex === -1) {
        // Try with single newline followed by content (malformed but common)
        headerEndIndex = part.indexOf('\n');
        if (headerEndIndex === -1) continue;
      }

      const partHeaders = part.substring(0, headerEndIndex);
      let partContent = part.substring(headerEndIndex).replace(/^\n+/, ''); // Remove leading newlines

      const contentTypeMatch = partHeaders.match(/content-type:\s*([^;\n]+)/i);
      const encodingMatch = partHeaders.match(/content-transfer-encoding:\s*(\S+)/i);

      if (!contentTypeMatch) continue;

      const partContentType = contentTypeMatch[1].toLowerCase().trim();
      const partEncoding = encodingMatch?.[1]?.toLowerCase() || '7bit';

      // Handle nested multipart
      if (partContentType.includes('multipart/')) {
        const nestedBoundaryMatch = partHeaders.match(/boundary=["']?([^"';\s\n]+)["']?/i);
        if (nestedBoundaryMatch) {
          const nestedResult = this.parseMimeParts(partContent, nestedBoundaryMatch[1]);
          if (nestedResult.text && !result.text) result.text = nestedResult.text;
          if (nestedResult.html && !result.html) result.html = nestedResult.html;
        }
        continue;
      }

      // Decode content
      partContent = partContent.trim();
      if (partEncoding === 'base64') {
        partContent = this.decodeBase64(partContent.replace(/\s/g, ''));
      } else if (partEncoding === 'quoted-printable') {
        partContent = decodeQuotedPrintable(partContent);
      }

      // Store based on content type
      if (partContentType.includes('text/plain') && !result.text) {
        result.text = partContent;
      } else if (partContentType.includes('text/html') && !result.html) {
        result.html = partContent;
      }
    }

    return result;
  }

  /**
   * Decode base64 with UTF-8 support
   */
  private decodeBase64(str: string): string {
    try {
      if (typeof atob !== 'undefined') {
        // Browser: use TextDecoder for proper UTF-8
        const binaryStr = atob(str);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
      } else {
        // Node.js
        return Buffer.from(str, 'base64').toString('utf-8');
      }
    } catch {
      // Fallback
      try {
        if (typeof atob !== 'undefined') {
          return atob(str);
        }
        return Buffer.from(str, 'base64').toString('utf-8');
      } catch {
        return str;
      }
    }
  }

  /**
   * Strip HTML tags to create plain text
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if content looks like binary/base64 image data
   */
  private looksLikeBinaryData(content: string): boolean {
    if (!content || content.length < 20) return false;
    
    const first100 = content.substring(0, 100);
    
    // JPEG markers
    if (first100.includes('JFIF') || first100.includes('Exif')) return true;
    
    // Base64 encoded JPEG (/9j/)
    if (first100.startsWith('/9j/')) return true;
    
    // PNG marker
    if (first100.includes('PNG') && first100.includes('\x89')) return true;
    
    // Base64 encoded PNG (iVBOR)
    if (first100.startsWith('iVBOR')) return true;
    
    // GIF marker
    if (first100.startsWith('GIF8')) return true;
    
    // Check for high concentration of base64-like patterns with no spaces
    const noSpaceContent = first100.replace(/\s/g, '');
    if (noSpaceContent.length > 50 && /^[A-Za-z0-9+/=]+$/.test(noSpaceContent)) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if content has mostly non-printable characters
   */
  private hasMostlyNonPrintable(content: string): boolean {
    if (!content || content.length < 10) return false;
    
    const sample = content.substring(0, 200);
    let nonPrintable = 0;
    
    for (let i = 0; i < sample.length; i++) {
      const code = sample.charCodeAt(i);
      // Count characters outside normal printable ASCII range (and common Unicode)
      if ((code < 32 || code > 126) && code !== 10 && code !== 13 && code !== 9 && code < 160) {
        nonPrintable++;
      }
    }
    
    // If more than 30% is non-printable, it's likely binary
    return nonPrintable / sample.length > 0.3;
  }

  private parseEmailAddress(str: string): { email: string; name?: string } {
    const trimmed = decodeHeaderValue(str.trim());

    const angleMatch = trimmed.match(/^(?:"?(.+?)"?\s*)?<([^>]+)>$/);
    if (angleMatch) {
      return {
        name: angleMatch[1]?.trim() || undefined,
        email: angleMatch[2]?.trim(),
      };
    }

    const emailMatch = trimmed.match(/^([^\s@]+@[^\s@]+\.[^\s@]+)$/);
    if (emailMatch) {
      return { email: emailMatch[1] };
    }

    return { email: trimmed };
  }

  private parseRecipients(str: string): string[] {
    if (!str) return [];

    return str
      .split(/[,;]/)
      .map((r) => {
        const { email } = this.parseEmailAddress(r.trim());
        return cleanEmailAddress(email);
      })
      .filter(Boolean);
  }

  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  /**
   * Check if a file is an MBOX archive
   * @param file - File to check
   * @returns True if the file appears to be an MBOX archive
   */
  static isMBOXFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return (
      name.endsWith('.mbox') ||
      name.endsWith('.mbx') ||
      file.type === 'application/mbox'
    );
  }
}

/**
 * OLM Parser - Outlook for Mac Archive Parser
 * @packageDocumentation
 */

import JSZip from 'jszip';
import type { 
  Email, 
  Contact, 
  CalendarEvent, 
  ParseOptions, 
  ParseResult,
  ParseProgress 
} from '../types';
import { cleanEmailAddress, normalizeSubject } from '../utils';

/**
 * Parser for Outlook for Mac (.olm) archive files
 * 
 * @example
 * ```typescript
 * import { OLMParser } from '@jacobkanfer/email-archive-parser';
 * 
 * const parser = new OLMParser();
 * const result = await parser.parse(file, {
 *   onProgress: (progress) => console.log(progress.message),
 *   detectAccounts: true,
 * });
 * 
 * console.log(`Parsed ${result.emails.length} emails`);
 * ```
 */
export class OLMParser {
  /**
   * Parse an OLM file
   * @param file - File object (browser) or Buffer (Node.js)
   * @param options - Parsing options
   * @returns Parsed data including emails, contacts, and calendar events
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

    try {
      // Stage 1: Extract ZIP
      this.reportProgress(onProgress, 'extracting', 0, 'Extracting OLM archive...');

      const zip = await JSZip.loadAsync(file);

      this.reportProgress(onProgress, 'extracting', 100, 'Archive extracted successfully');

      // Get all files in the archive
      const files = Object.keys(zip.files);

      // Find email files
      const emailFiles = files.filter(
        (f) =>
          f.includes('com.microsoft.__Messages/') &&
          f.match(/message_\d+\.xml$/) &&
          !zip.files[f].dir
      );

      // Find contact files
      const contactFiles = files.filter(
        (f) =>
          (f.includes('Address Book/Contacts.xml') ||
            (f.includes('/Contacts/') && f.endsWith('.xml'))) &&
          !zip.files[f].dir
      );

      // Find calendar files - can be in /Calendar/ folder OR directly named Calendar.xml
      const calendarFiles = files.filter(
        (f) =>
          f.endsWith('Calendar.xml') &&
          !zip.files[f].dir
      );

      // Stage 2: Parse emails and track contacts from senders
      const senderContactMap = new Map<string, { name: string; emailCount: number; lastEmailDate: Date }>();
      
      if (emailFiles.length > 0) {
        this.reportProgress(
          onProgress,
          'parsing_emails',
          0,
          `Parsing ${emailFiles.length} emails...`
        );

        for (let i = 0; i < emailFiles.length; i++) {
          try {
            const content = await zip.files[emailFiles[i]].async('string');
            const email = this.parseEmailXML(content);
            if (email) {
              result.emails.push(email as Email);
              result.stats.emailCount++;
              
              // Track contact from email sender
              if (email.sender && email.sender !== 'unknown@example.com') {
                const existing = senderContactMap.get(email.sender);
                if (existing) {
                  existing.emailCount++;
                  if (email.date > existing.lastEmailDate) {
                    existing.lastEmailDate = email.date;
                  }
                } else {
                  senderContactMap.set(email.sender, {
                    name: email.senderName || email.sender.split('@')[0] || 'Unknown',
                    emailCount: 1,
                    lastEmailDate: email.date,
                  });
                }
              }
            }
          } catch (err) {
            // Skip malformed emails
          }

          if (i % 100 === 0 || i === emailFiles.length - 1) {
            this.reportProgress(
              onProgress,
              'parsing_emails',
              Math.round(((i + 1) / emailFiles.length) * 100),
              `Parsed ${i + 1} of ${emailFiles.length} emails`
            );
          }
        }
      }

      // Stage 3: Parse contacts from Address Book files
      const existingContactEmails = new Set<string>();
      
      if (contactFiles.length > 0) {
        this.reportProgress(onProgress, 'parsing_contacts', 0, 'Parsing contacts...');

        for (let i = 0; i < contactFiles.length; i++) {
          try {
            const content = await zip.files[contactFiles[i]].async('string');
            const contacts = this.parseContactsXML(content);
            for (const contact of contacts) {
              result.contacts.push(contact as Contact);
              result.stats.contactCount++;
              if (contact.email) {
                existingContactEmails.add(contact.email.toLowerCase());
              }
            }
          } catch (err) {
            // Skip malformed contacts
          }

          this.reportProgress(
            onProgress,
            'parsing_contacts',
            Math.round(((i + 1) / contactFiles.length) * 50), // 0-50% for file contacts
            `Parsed ${result.stats.contactCount} contacts from files`
          );
        }
      }
      
      // Add contacts from email senders (that aren't already in Address Book)
      let senderContactsAdded = 0;
      const totalSenderContacts = senderContactMap.size;
      
      for (const [email, data] of senderContactMap) {
        if (!existingContactEmails.has(email.toLowerCase())) {
          result.contacts.push({
            name: data.name,
            email: cleanEmailAddress(email),
            phone: undefined,
            emailCount: data.emailCount,
            lastEmailDate: data.lastEmailDate,
          } as Contact);
          result.stats.contactCount++;
          senderContactsAdded++;
        }
        
        // Update progress for sender contacts (50-100%)
        if (senderContactsAdded % 100 === 0) {
          this.reportProgress(
            onProgress,
            'parsing_contacts',
            50 + Math.round((senderContactsAdded / totalSenderContacts) * 50),
            `Added ${senderContactsAdded} contacts from emails`
          );
        }
      }
      
      this.reportProgress(
        onProgress,
        'parsing_contacts',
        100,
        `Parsed ${result.stats.contactCount} total contacts`
      );

      // Stage 4: Parse calendar events
      if (calendarFiles.length > 0) {
        this.reportProgress(onProgress, 'parsing_calendar', 0, 'Parsing calendar...');

        for (let i = 0; i < calendarFiles.length; i++) {
          try {
            const content = await zip.files[calendarFiles[i]].async('string');
            const events = this.parseCalendarXML(content);
            result.calendarEvents.push(...(events as CalendarEvent[]));
            result.stats.calendarEventCount += events.length;
          } catch (err) {
            // Skip malformed events
          }

          this.reportProgress(
            onProgress,
            'parsing_calendar',
            Math.round(((i + 1) / calendarFiles.length) * 100),
            `Parsed ${result.stats.calendarEventCount} calendar events`
          );
        }
      }

      this.reportProgress(onProgress, 'complete', 100, 'Processing complete!');

      return result;
    } catch (error) {
      throw new Error(
        `Failed to parse OLM file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Parse an OLM file from a file path (Node.js only)
   * 
   * @param filePath - Path to the OLM file
   * @param options - Parsing options
   * @returns Parsed data
   * 
   * @example
   * ```typescript
   * const result = await parser.parseFile('/path/to/archive.olm', {
   *   onProgress: (p) => console.log(`${p.progress}%: ${p.message}`),
   * });
   * ```
   */
  async parseFile(
    filePath: string,
    options: ParseOptions = {}
  ): Promise<ParseResult> {
    // Dynamic import of Node.js fs module
    const fs = await import('fs');
    
    const buffer = fs.readFileSync(filePath);
    return this.parse(buffer, options);
  }

  private reportProgress(
    callback: ((progress: ParseProgress) => void) | undefined,
    stage: ParseProgress['stage'],
    progress: number,
    message: string
  ): void {
    callback?.({ stage, progress, message });
  }

  private parseEmailXML(xmlContent: string): Omit<Email, 'id'> | null {
    try {
      // Use DOMParser if available (browser), otherwise parse manually
      if (typeof DOMParser !== 'undefined') {
        return this.parseEmailWithDOMParser(xmlContent);
      }
      return this.parseEmailManually(xmlContent);
    } catch {
      return null;
    }
  }

  private parseEmailWithDOMParser(xmlContent: string): Omit<Email, 'id'> | null {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return null;
    }

    const emailElement = doc.querySelector('email') || doc.documentElement;

    const getTextContent = (selectors: string[]): string => {
      for (const selector of selectors) {
        const element = emailElement.querySelector(selector);
        if (element?.textContent) {
          return element.textContent.trim();
        }
      }
      return '';
    };

    const subject = getTextContent(['OPFMessageCopySubject', 'subject', 'Subject']);
    const body = getTextContent(['OPFMessageCopyBody', 'body', 'Body', 'content']);
    const htmlBody = getTextContent(['OPFMessageCopyHTMLBody', 'htmlBody', 'HtmlBody']);
    const preview = getTextContent(['OPFMessageCopyPreview']);

    // Parse sender
    const fromAddresses = emailElement.querySelector('OPFMessageCopyFromAddresses');
    let sender = '';
    let senderName = '';
    if (fromAddresses) {
      const emailAddr = fromAddresses.querySelector('emailAddress');
      if (emailAddr) {
        sender = emailAddr.getAttribute('OPFContactEmailAddressAddress') || '';
        senderName = emailAddr.getAttribute('OPFContactEmailAddressName') || '';
      }
    }
    if (!sender) {
      sender = getTextContent(['from', 'From', 'sender', 'Sender']);
    }

    // Parse date
    const dateStr = getTextContent([
      'OPFMessageCopySentTime',
      'OPFMessageCopyReceivedTime',
      'sentTime',
      'date',
    ]);
    const date = dateStr ? new Date(dateStr) : new Date();

    // Parse recipients
    const recipients: string[] = [];
    const toAddresses = emailElement.querySelector('OPFMessageCopyToAddresses');
    if (toAddresses) {
      const emailAddrs = toAddresses.querySelectorAll('emailAddress');
      emailAddrs.forEach((addr) => {
        const email = addr.getAttribute('OPFContactEmailAddressAddress');
        if (email) {
          recipients.push(email);
        }
      });
    }

    // Parse isRead status
    const isReadStr = getTextContent(['OPFMessageGetIsRead']);
    const isRead = isReadStr === '1' || isReadStr.toLowerCase() === 'true';

    // Parse thread ID
    let threadId = getTextContent([
      'OPFMessageCopyThreadTopic',
      'OPFMessageCopyConversationID',
      'threadId',
    ]);

    if (!threadId) {
      const normalizedSubject = normalizeSubject(subject || '');
      if (normalizedSubject) {
        threadId = `subject:${normalizedSubject.toLowerCase().replace(/\s+/g, '-')}`;
      }
    }

    if (!subject && !body && !preview) {
      return null;
    }

    return {
      subject: subject || '(No Subject)',
      sender: cleanEmailAddress(sender),
      senderName: senderName || undefined,
      recipients,
      date: isNaN(date.getTime()) ? new Date() : date,
      body: body || preview || '',
      htmlBody: htmlBody || undefined,
      attachments: [],
      size: xmlContent.length,
      isRead,
      isStarred: false,
      folderId: 'inbox',
      threadId: threadId || undefined,
    };
  }

  private parseEmailManually(xmlContent: string): Omit<Email, 'id'> | null {
    // Simple regex-based parsing for Node.js environments without DOM
    const getTag = (content: string, tag: string): string => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
      const match = content.match(regex);
      return match ? match[1].trim() : '';
    };

    const subject =
      getTag(xmlContent, 'OPFMessageCopySubject') ||
      getTag(xmlContent, 'subject') ||
      '';
    const body =
      getTag(xmlContent, 'OPFMessageCopyBody') ||
      getTag(xmlContent, 'body') ||
      '';
    const dateStr =
      getTag(xmlContent, 'OPFMessageCopySentTime') ||
      getTag(xmlContent, 'date') ||
      '';

    // Extract sender from attributes
    const senderMatch = xmlContent.match(
      /OPFContactEmailAddressAddress="([^"]+)"/i
    );
    const sender = senderMatch ? senderMatch[1] : '';

    const date = dateStr ? new Date(dateStr) : new Date();

    if (!subject && !body) {
      return null;
    }

    return {
      subject: subject || '(No Subject)',
      sender: cleanEmailAddress(sender),
      recipients: [],
      date: isNaN(date.getTime()) ? new Date() : date,
      body,
      attachments: [],
      size: xmlContent.length,
      isRead: false,
      isStarred: false,
      folderId: 'inbox',
    };
  }

  private parseContactsXML(xmlContent: string): Omit<Contact, 'id'>[] {
    const contacts: Omit<Contact, 'id'>[] = [];

    if (typeof DOMParser !== 'undefined') {
      try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlContent, 'text/xml');

      const contactElements = doc.querySelectorAll('contact');

      contactElements.forEach((contactElement) => {
        const getTextContent = (selectors: string[]): string => {
          for (const selector of selectors) {
            const element = contactElement.querySelector(selector);
            if (element?.textContent) {
              return element.textContent.trim();
            }
          }
          return '';
        };

        const displayName = getTextContent([
          'OPFContactCopyDisplayName',
          'displayName',
          'name',
        ]);
        const firstName = getTextContent(['OPFContactCopyFirstName', 'firstName']);
        const lastName = getTextContent(['OPFContactCopyLastName', 'lastName']);
        const phone = getTextContent(['OPFContactCopyPhoneNumbers', 'phone']);

        let email = '';
        const emailList = contactElement.querySelector(
          'OPFContactCopyEmailAddressList, OPFContactCopyDefaultEmailAddress'
        );
        if (emailList) {
          const emailAddr = emailList.querySelector('contactEmailAddress');
          if (emailAddr) {
            email = emailAddr.getAttribute('OPFContactEmailAddressAddress') || '';
          }
        }

        const name =
          displayName ||
          `${firstName} ${lastName}`.trim() ||
          email.split('@')[0] ||
          'Unknown';

        if (email || name !== 'Unknown') {
          contacts.push({
            name,
            email: cleanEmailAddress(email),
            phone: phone || undefined,
            emailCount: 0,
            lastEmailDate: new Date(),
          });
        }
      });

        if (contacts.length > 0) return contacts;
      } catch {
        // Fall through to manual parsing
      }
    }

    // Manual parsing for Node.js or as fallback
    return this.parseContactsManually(xmlContent);
  }

  private parseContactsManually(xmlContent: string): Omit<Contact, 'id'>[] {
    const contacts: Omit<Contact, 'id'>[] = [];

    // Match each <contact> element
    const contactRegex = /<contact[^>]*>([\s\S]*?)<\/contact>/gi;
    let match;

    while ((match = contactRegex.exec(xmlContent)) !== null) {
      const contactXml = match[1];

      const getTag = (content: string, tag: string): string => {
        const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
        const m = content.match(regex);
        return m ? m[1].trim() : '';
      };

      const displayName = getTag(contactXml, 'OPFContactCopyDisplayName') || 
                          getTag(contactXml, 'displayName');
      const firstName = getTag(contactXml, 'OPFContactCopyFirstName');
      const lastName = getTag(contactXml, 'OPFContactCopyLastName');
      const phone = getTag(contactXml, 'OPFContactCopyPhoneNumbers');

      // Extract email from attribute
      const emailMatch = contactXml.match(/OPFContactEmailAddressAddress="([^"]+)"/i);
      const email = emailMatch ? emailMatch[1] : '';

      const name = displayName || `${firstName} ${lastName}`.trim() || email.split('@')[0] || 'Unknown';

      if (email || name !== 'Unknown') {
        contacts.push({
          name,
          email: cleanEmailAddress(email),
          phone: phone || undefined,
          emailCount: 0,
          lastEmailDate: new Date(),
        });
      }
    }

    return contacts;
  }

  private parseCalendarXML(xmlContent: string): Omit<CalendarEvent, 'id'>[] {
    const events: Omit<CalendarEvent, 'id'>[] = [];

    if (typeof DOMParser !== 'undefined') {
      try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlContent, 'text/xml');

      const appointmentElements = doc.querySelectorAll('appointment');

      appointmentElements.forEach((appointmentElement) => {
        const getTextContent = (selectors: string[]): string => {
          for (const selector of selectors) {
            const element = appointmentElement.querySelector(selector);
            if (element?.textContent) {
              return element.textContent.trim();
            }
          }
          return '';
        };

        const title = getTextContent([
          'OPFCalendarEventCopySummary',
          'OPFCalendarEventCopySubject',
          'summary',
          'title',
        ]);
        const startDateStr = getTextContent([
          'OPFCalendarEventCopyStartTime',
          'startTime',
        ]);
        const endDateStr = getTextContent([
          'OPFCalendarEventCopyEndTime',
          'endTime',
        ]);
        const location = getTextContent([
          'OPFCalendarEventCopyLocation',
          'location',
        ]);
        const description = getTextContent([
          'OPFCalendarEventCopyBody',
            'OPFCalendarEventCopyDescription',
          'description',
        ]);
        const organizer = getTextContent([
          'OPFCalendarEventCopyOrganizer',
          'organizer',
        ]);
        const isAllDayStr = getTextContent([
          'OPFCalendarEventGetIsAllDayEvent',
          'isAllDay',
        ]);

        if (!title) return;

        const startDate = startDateStr ? new Date(startDateStr) : new Date();
        const endDate = endDateStr
          ? new Date(endDateStr)
          : new Date(startDate.getTime() + 3600000);

        events.push({
          title,
          startDate: isNaN(startDate.getTime()) ? new Date() : startDate,
          endDate: isNaN(endDate.getTime()) ? new Date() : endDate,
          location: location || undefined,
          attendees: organizer ? [organizer] : [],
          description: description || undefined,
          isAllDay: isAllDayStr === '1' || isAllDayStr?.toLowerCase() === 'true',
          reminder: false,
        });
        });

        if (events.length > 0) return events;
      } catch {
        // Fall through to manual parsing
      }
    }

    // Manual parsing for Node.js or as fallback
    return this.parseCalendarManually(xmlContent);
  }

  private parseCalendarManually(xmlContent: string): Omit<CalendarEvent, 'id'>[] {
    const events: Omit<CalendarEvent, 'id'>[] = [];

    // Match each <appointment> element
    const appointmentRegex = /<appointment[^>]*>([\s\S]*?)<\/appointment>/gi;
    let match;

    while ((match = appointmentRegex.exec(xmlContent)) !== null) {
      const appointmentXml = match[1];

      const getTag = (content: string, tag: string): string => {
        const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
        const m = content.match(regex);
        return m ? m[1].trim() : '';
      };

      const title = getTag(appointmentXml, 'OPFCalendarEventCopySummary') ||
                    getTag(appointmentXml, 'OPFCalendarEventCopySubject') ||
                    getTag(appointmentXml, 'summary');
      
      if (!title) continue;

      const startDateStr = getTag(appointmentXml, 'OPFCalendarEventCopyStartTime') ||
                           getTag(appointmentXml, 'startTime');
      const endDateStr = getTag(appointmentXml, 'OPFCalendarEventCopyEndTime') ||
                         getTag(appointmentXml, 'endTime');
      const location = getTag(appointmentXml, 'OPFCalendarEventCopyLocation');
      const description = getTag(appointmentXml, 'OPFCalendarEventCopyBody') ||
                          getTag(appointmentXml, 'OPFCalendarEventCopyDescription');
      const organizer = getTag(appointmentXml, 'OPFCalendarEventCopyOrganizer');
      const isAllDayStr = getTag(appointmentXml, 'OPFCalendarEventGetIsAllDayEvent');

      const startDate = startDateStr ? new Date(startDateStr) : new Date();
      const endDate = endDateStr ? new Date(endDateStr) : new Date(startDate.getTime() + 3600000);

      events.push({
        title,
        startDate: isNaN(startDate.getTime()) ? new Date() : startDate,
        endDate: isNaN(endDate.getTime()) ? new Date() : endDate,
        location: location || undefined,
        attendees: organizer ? [organizer] : [],
        description: description || undefined,
        isAllDay: isAllDayStr === '1' || isAllDayStr?.toLowerCase() === 'true',
        reminder: false,
      });
    }

    return events;
  }

  /**
   * Check if a file is an OLM archive
   * @param file - File to check
   * @returns True if the file appears to be an OLM archive
   */
  static isOLMFile(file: File): boolean {
    return file.name.toLowerCase().endsWith('.olm');
  }
}


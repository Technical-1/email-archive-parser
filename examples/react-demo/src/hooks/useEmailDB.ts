/**
 * React hook for email database operations
 */

import { useState, useEffect, useCallback } from 'react';
import { parseArchive, MBOXParser, OLMParser, Email, Contact, CalendarEvent } from '@technical-1/email-archive-parser';
import {
  openDB,
  clearAllData,
  addItems,
  getCount,
  getPage,
  getItem,
  searchItems,
  saveStat,
  getStat,
  DBEmail,
  DBContact,
  DBCalendarEvent,
} from '../lib/db';

export interface Stats {
  emailCount: number;
  contactCount: number;
  calendarCount: number;
  labelCount: number;
}

export interface ParseProgress {
  stage: string;
  progress: number;
  message: string;
}

export function useEmailDB() {
  const [stats, setStats] = useState<Stats>({
    emailCount: 0,
    contactCount: 0,
    calendarCount: 0,
    labelCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load initial stats
  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = useCallback(async () => {
    try {
      await openDB();
      const emailCount = await getCount('emails');
      const contactCount = await getCount('contacts');
      const calendarCount = await getCount('calendar');
      const labelCount = await getStat('labelCount');

      setStats({ emailCount, contactCount, calendarCount, labelCount });
      setIsLoading(false);
    } catch (err) {
      setError('Failed to load database');
      setIsLoading(false);
    }
  }, []);

  const parseFile = useCallback(async (file: File) => {
    setIsParsing(true);
    setError(null);
    setProgress({ stage: 'starting', progress: 0, message: 'Starting...' });

    try {
      // Clear existing data
      await clearAllData();

      const fileName = file.name.toLowerCase();
      const isOLM = fileName.endsWith('.olm');
      const isMBOX = fileName.endsWith('.mbox');

      if (!isOLM && !isMBOX) {
        throw new Error('Unsupported file type. Please use .olm or .mbox files.');
      }

      const labels = new Set<string>();
      const contactMap = new Map<string, { name: string; email: string; emailCount: number; lastEmailDate: Date }>();
      let totalEmails = 0;

      if (isMBOX) {
        // Use streaming for MBOX files
        const parser = new MBOXParser();

        await parser.parseStreaming(
          file,
          (p) => {
            setProgress({
              stage: p.stage,
              progress: p.progress,
              message: `${p.message} (${totalEmails} saved)`,
            });
          },
          async (batch) => {
            // Save batch to IndexedDB immediately
            const emailsToSave: DBEmail[] = batch.map((email) => ({
              subject: email.subject || '(No Subject)',
              sender: email.sender || 'unknown',
              senderName: email.senderName,
              date: email.date,
              body: email.body || '',
              htmlBody: email.htmlBody,
              labels: email.labels,
              isRead: email.isRead,
            }));

            await addItems('emails', emailsToSave);
            totalEmails += batch.length;

            // Track labels and contacts
            for (const email of batch) {
              email.labels?.forEach((l) => labels.add(l));

              if (email.sender && email.sender !== 'unknown@example.com') {
                const existing = contactMap.get(email.sender);
                if (existing) {
                  existing.emailCount++;
                  if (email.date > existing.lastEmailDate) {
                    existing.lastEmailDate = email.date;
                  }
                } else {
                  contactMap.set(email.sender, {
                    name: email.senderName || email.sender.split('@')[0] || 'Unknown',
                    email: email.sender,
                    emailCount: 1,
                    lastEmailDate: email.date,
                  });
                }
              }
            }
          }
        );

        // Save contacts
        setProgress({ stage: 'saving', progress: 95, message: 'Saving contacts...' });
        const contacts = Array.from(contactMap.values());
        if (contacts.length > 0) {
          await addItems('contacts', contacts);
        }
      } else {
        // OLM parsing
        const parser = new OLMParser();

        setProgress({ stage: 'parsing', progress: 0, message: 'Parsing OLM archive...' });

        const result = await parser.parse(file, {
          onProgress: (p) => {
            setProgress({
              stage: p.stage,
              progress: p.progress,
              message: p.message,
            });
          },
        });

        // Save emails in batches
        if (result.emails?.length) {
          setProgress({ stage: 'saving', progress: 0, message: 'Saving emails...' });
          const BATCH_SIZE = 200;

          for (let i = 0; i < result.emails.length; i += BATCH_SIZE) {
            const batch = result.emails.slice(i, i + BATCH_SIZE);
            const emailsToSave: DBEmail[] = batch.map((email) => ({
              subject: email.subject || '(No Subject)',
              sender: email.sender || 'unknown',
              senderName: email.senderName,
              date: email.date,
              body: email.body || '',
              htmlBody: email.htmlBody,
              labels: email.labels,
              isRead: email.isRead,
            }));

            await addItems('emails', emailsToSave);
            totalEmails += batch.length;

            batch.forEach((e) => e.labels?.forEach((l) => labels.add(l)));

            setProgress({
              stage: 'saving',
              progress: Math.round((i / result.emails.length) * 100),
              message: `Saving emails... ${totalEmails}/${result.emails.length}`,
            });
          }
        }

        // Save contacts
        if (result.contacts?.length) {
          const contactsToSave: DBContact[] = result.contacts.map((c) => ({
            name: c.name || 'Unknown',
            email: c.email || '',
            emailCount: c.emailCount || 0,
            lastEmailDate: c.lastEmailDate || new Date(),
          }));
          await addItems('contacts', contactsToSave);
        }

        // Save calendar events
        if (result.calendarEvents?.length) {
          const eventsToSave: DBCalendarEvent[] = result.calendarEvents.map((e) => ({
            title: e.title || 'Untitled Event',
            startDate: e.startDate,
            endDate: e.endDate,
            location: e.location,
            isAllDay: e.isAllDay,
          }));
          await addItems('calendar', eventsToSave);
        }
      }

      // Save label count
      await saveStat('labelCount', labels.size);

      setProgress({ stage: 'complete', progress: 100, message: 'Done!' });
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsParsing(false);
      setProgress(null);
    }
  }, [loadStats]);

  const clearData = useCallback(async () => {
    try {
      await clearAllData();
      await loadStats();
    } catch (err) {
      setError('Failed to clear data');
    }
  }, [loadStats]);

  const getEmails = useCallback(async (page: number, perPage = 25, search?: string) => {
    if (search) {
      return searchItems<DBEmail>('emails', search, 100);
    }
    return getPage<DBEmail>('emails', page, perPage, 'date', 'desc');
  }, []);

  const getEmail = useCallback(async (id: number) => {
    return getItem<DBEmail>('emails', id);
  }, []);

  const getContacts = useCallback(async (page: number, perPage = 25, search?: string) => {
    if (search) {
      return searchItems<DBContact>('contacts', search, 100);
    }
    return getPage<DBContact>('contacts', page, perPage, 'emailCount', 'desc');
  }, []);

  const getCalendarEvents = useCallback(async (page: number, perPage = 25, search?: string) => {
    if (search) {
      return searchItems<DBCalendarEvent>('calendar', search, 100);
    }
    return getPage<DBCalendarEvent>('calendar', page, perPage, 'startDate', 'desc');
  }, []);

  return {
    stats,
    isLoading,
    isParsing,
    progress,
    error,
    parseFile,
    clearData,
    getEmails,
    getEmail,
    getContacts,
    getCalendarEvents,
    refreshStats: loadStats,
  };
}


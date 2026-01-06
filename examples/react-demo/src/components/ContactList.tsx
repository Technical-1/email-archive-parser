/**
 * ContactList - Paginated list of contacts
 * Page size dynamically adjusts to window height
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DBContact } from '../lib/db';

interface ContactListProps {
  getContacts: (page: number, perPage: number, search?: string) => Promise<DBContact[]>;
  totalCount: number;
  page: number;
  onPageChange: (page: number) => void;
}

const ROW_HEIGHT = 72;
const RESERVED_HEIGHT = 140;

export function ContactList({ getContacts, totalCount, page, onPageChange }: ContactListProps) {
  const [contacts, setContacts] = useState<DBContact[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [containerHeight, setContainerHeight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const itemsPerPage = useMemo(() => {
    if (containerHeight <= 0) return 10;
    const availableHeight = containerHeight - RESERVED_HEIGHT;
    const calculated = Math.floor(availableHeight / ROW_HEIGHT);
    return Math.max(5, Math.min(50, calculated));
  }, [containerHeight]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalCount / itemsPerPage));
  }, [totalCount, itemsPerPage]);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.offsetHeight);
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      onPageChange(totalPages);
    }
  }, [page, totalPages, onPageChange]);

  const loadContacts = useCallback(async () => {
    if (itemsPerPage <= 0) return;
    setIsLoading(true);
    try {
      const result = await getContacts(page, itemsPerPage, search || undefined);
      setContacts(result);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [getContacts, page, itemsPerPage, search]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.split(/[@\s]+/);
    return parts.slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('');
  };

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-0">
      {/* Header - Sticky */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h2 className="text-lg font-semibold">👥 Contacts</h2>
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); onPageChange(1); }}
          placeholder="Search contacts..."
          className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* List - Scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center p-8 text-gray-500">
            Loading...
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-gray-500">
            <span className="text-4xl mb-2">👥</span>
            <span>No contacts found</span>
          </div>
        ) : (
          contacts.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center gap-4 p-4 border-b border-gray-100"
            >
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm flex-shrink-0">
                {getInitials(contact.name || contact.email)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900">
                  {contact.name || 'Unknown'}
                </div>
                <div className="text-sm text-gray-500 truncate">
                  {contact.email}
                </div>
              </div>
              <div className="text-right text-sm text-gray-500">
                <div>{contact.emailCount} emails</div>
                <div>{formatDate(contact.lastEmailDate)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination - Sticky Bottom */}
      {totalPages > 1 && !search && (
        <div className="flex items-center justify-center gap-2 p-4 border-t border-gray-200 bg-white flex-shrink-0">
          <button
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            className="px-3 py-1 rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            ««
          </button>
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            ←
          </button>
          <span className="text-sm text-gray-600 mx-2">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            →
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={page === totalPages}
            className="px-3 py-1 rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            »»
          </button>
        </div>
      )}
    </div>
  );
}


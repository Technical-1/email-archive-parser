/**
 * EmailList - Paginated list of emails with search
 * Page size dynamically adjusts to window height
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DBEmail } from '../lib/db';

interface EmailListProps {
  getEmails: (page: number, perPage: number, search?: string) => Promise<DBEmail[]>;
  totalCount: number;
  onEmailSelect: (id: number) => void;
  page: number;
  onPageChange: (page: number) => void;
}

// Approximate height of each email row in pixels
const ROW_HEIGHT = 100;
// Height reserved for header and pagination
const RESERVED_HEIGHT = 140;

export function EmailList({ getEmails, totalCount, onEmailSelect, page, onPageChange }: EmailListProps) {
  const [emails, setEmails] = useState<DBEmail[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [containerHeight, setContainerHeight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate items per page based on container height
  const itemsPerPage = useMemo(() => {
    if (containerHeight <= 0) return 10; // Default
    const availableHeight = containerHeight - RESERVED_HEIGHT;
    const calculated = Math.floor(availableHeight / ROW_HEIGHT);
    return Math.max(5, Math.min(50, calculated)); // Clamp between 5 and 50
  }, [containerHeight]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalCount / itemsPerPage));
  }, [totalCount, itemsPerPage]);

  // Measure container height on mount and resize
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

  // Reset page if it exceeds total pages after resize
  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      onPageChange(totalPages);
    }
  }, [page, totalPages, onPageChange]);

  const loadEmails = useCallback(async () => {
    if (itemsPerPage <= 0) return;
    setIsLoading(true);
    try {
      const result = await getEmails(page, itemsPerPage, search || undefined);
      setEmails(result);
    } catch (err) {
      console.error('Failed to load emails:', err);
    } finally {
      setIsLoading(false);
    }
  }, [getEmails, page, itemsPerPage, search]);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    onPageChange(1);
  }, [onPageChange]);

  const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.split(/[@\s]+/);
    return parts.slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('');
  };

  const formatDate = (date: Date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();

    if (diff < 86400000 && d.getDate() === now.getDate()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 604800000) {
      return d.toLocaleDateString([], { weekday: 'short' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-0">
      {/* Header - Sticky */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h2 className="text-lg font-semibold">📬 Emails</h2>
        <input
          type="text"
          value={search}
          onChange={handleSearch}
          placeholder="Search emails..."
          className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* List - Scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center p-8 text-gray-500">
            Loading...
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-gray-500">
            <span className="text-4xl mb-2">📭</span>
            <span>No emails found</span>
          </div>
        ) : (
          emails.map((email) => (
            <div
              key={email.id}
              onClick={() => email.id && onEmailSelect(email.id)}
              className="flex gap-4 p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm flex-shrink-0">
                {getInitials(email.senderName || email.sender)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-gray-900 truncate">
                    {email.senderName || email.sender || 'Unknown'}
                  </span>
                  <span className="text-sm text-gray-500 flex-shrink-0 ml-2">
                    {formatDate(email.date)}
                  </span>
                </div>
                <div className="text-sm text-gray-800 mb-1 truncate">
                  {email.subject || '(No Subject)'}
                </div>
                <div className="text-sm text-gray-500 truncate">
                  {email.body?.substring(0, 100) || ''}
                </div>
                {email.labels && email.labels.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {email.labels.slice(0, 3).map((label, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded uppercase"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}
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


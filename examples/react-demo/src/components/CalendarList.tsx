/**
 * CalendarList - Paginated list of calendar events
 * Page size dynamically adjusts to window height
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DBCalendarEvent } from '../lib/db';

interface CalendarListProps {
  getEvents: (page: number, perPage: number, search?: string) => Promise<DBCalendarEvent[]>;
  totalCount: number;
  page: number;
  onPageChange: (page: number) => void;
}

const ROW_HEIGHT = 80;
const RESERVED_HEIGHT = 140;

export function CalendarList({ getEvents, totalCount, page, onPageChange }: CalendarListProps) {
  const [events, setEvents] = useState<DBCalendarEvent[]>([]);
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

  const loadEvents = useCallback(async () => {
    if (itemsPerPage <= 0) return;
    setIsLoading(true);
    try {
      const result = await getEvents(page, itemsPerPage, search || undefined);
      setEvents(result);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setIsLoading(false);
    }
  }, [getEvents, page, itemsPerPage, search]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const formatTime = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-0">
      {/* Header - Sticky */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h2 className="text-lg font-semibold">📅 Calendar Events</h2>
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); onPageChange(1); }}
          placeholder="Search events..."
          className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* List - Scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center p-8 text-gray-500">
            Loading...
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-gray-500">
            <span className="text-4xl mb-2">📅</span>
            <span>No calendar events found</span>
          </div>
        ) : (
          events.map((event) => {
            const startDate = new Date(event.startDate);
            const endDate = new Date(event.endDate);
            
            return (
              <div
                key={event.id}
                className="flex gap-4 p-4 border-b border-gray-100"
              >
                <div className="w-14 text-center flex-shrink-0">
                  <div className="text-2xl font-bold text-blue-600">
                    {startDate.getDate()}
                  </div>
                  <div className="text-xs text-gray-500 uppercase">
                    {startDate.toLocaleString('default', { month: 'short' })}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">
                    {event.title || 'Untitled Event'}
                  </div>
                  <div className="text-sm text-gray-500">
                    {event.isAllDay 
                      ? 'All Day' 
                      : `${formatTime(startDate)} - ${formatTime(endDate)}`
                    }
                  </div>
                  {event.location && (
                    <div className="text-sm text-gray-500 mt-1">
                      📍 {event.location}
                    </div>
                  )}
                </div>
              </div>
            );
          })
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


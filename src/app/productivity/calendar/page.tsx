'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { todayISO } from "@/lib/time";
import {
  Calendar as CalendarIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

export default function CalendarPage() {
  const { activeSpaceId, setIsAiDrawerOpen } = useWorkspace();
  const [events, setEvents] = useState<any[]>([]);
  const [currentDate, setCurrentDate] = useState<string>('2026-10-29');
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'agenda'>('week');
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('10:00');

  const loadEvents = () => {
    fetch('/api/calendar')
      .then(r => r.json())
      .then(data => setEvents(data.events || []));
  };

  useEffect(() => {
    setCurrentDate(todayISO());
    loadEvents();
  }, [activeSpaceId]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) return;

    const start = `${currentDate}T${newStartTime}:00`;
    const end = `${currentDate}T${newEndTime}:00`;

    await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newEventTitle.trim(),
        startTime: start,
        endTime: end,
        eventType: 'time_block',
        spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
      }),
    });

    setNewEventTitle('');
    setIsAddEventOpen(false);
    loadEvents();
  };

  const hours = Array.from({ length: 14 }, (_, i) => i + 7); // 7 AM to 8 PM

  return (
    <div className="w-full px-8 py-6 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-400" />
            <span>Calendar & Time Blocking</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Schedule priorities, protect focus sessions, and maintain realistic working availability.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View switcher */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 flex items-center text-xs">
            <button
              onClick={() => setCalendarView('day')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                calendarView === 'day' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setCalendarView('week')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                calendarView === 'week' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setCalendarView('agenda')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                calendarView === 'agenda' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Agenda
            </button>
          </div>

          <button
            onClick={() => setIsAiDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Planning</span>
          </button>

          <button
            onClick={() => setIsAddEventOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Block Time</span>
          </button>
        </div>
      </div>

      {/* Add Time Block Form Modal */}
      {isAddEventOpen && (
        <form onSubmit={handleCreateEvent} className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-200">New Time Block</span>
            <button
              type="button"
              onClick={() => setIsAddEventOpen(false)}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              required
              autoFocus
              value={newEventTitle}
              onChange={e => setNewEventTitle(e.target.value)}
              placeholder="Block Title / Focus session..."
              className="md:col-span-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">Start:</span>
              <input
                type="time"
                value={newStartTime}
                onChange={e => setNewStartTime(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              />
              <span className="text-xs text-zinc-400">End:</span>
              <input
                type="time"
                value={newEndTime}
                onChange={e => setNewEndTime(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
            >
              Save Block
            </button>
          </div>
        </form>
      )}

      {/* Time Grid View */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={currentDate}
              onChange={e => setCurrentDate(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1 text-xs text-zinc-200"
            />
          </div>
          <span className="text-xs font-medium text-zinc-400">Working Hours: 08:00 AM – 06:00 PM</span>
        </div>

        <div className="divide-y divide-zinc-800/60 max-h-[600px] overflow-y-auto">
          {hours.map(hour => {
            const hourLabel = `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
            // Match events for this hour
            const matching = events.filter(ev => {
              const startH = new Date(ev.start_time).getHours();
              return startH === hour;
            });

            return (
              <div key={hour} className="flex min-h-[60px] group hover:bg-zinc-800/20 transition-colors">
                {/* Time gutter */}
                <div className="w-24 p-3 text-[11px] font-mono text-zinc-500 border-r border-zinc-800/60 shrink-0">
                  {hourLabel}
                </div>
                {/* Hour slot content */}
                <div className="flex-1 p-2 flex flex-wrap gap-2 items-center">
                  {matching.map(ev => (
                    <div
                      key={ev.id}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-xs font-medium text-indigo-200 flex items-center gap-2"
                    >
                      <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{ev.title}</span>
                      <span className="text-[10px] text-indigo-300/80 font-mono">
                        {new Date(ev.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                        {new Date(ev.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

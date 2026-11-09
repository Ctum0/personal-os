'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { todayISO } from "@/lib/time";
import {
  Calendar as CalendarIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  Trash2,
  X,
  Edit2,
  CheckCircle2,
  CalendarDays,
  ListTodo,
  Layers,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Users,
} from 'lucide-react';

interface CalendarEvent {
  id: string;
  tenant_id: string;
  space_id?: string | null;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  is_all_day: number;
  event_type: string;
  task_id?: string | null;
  project_id?: string | null;
  color?: string | null;
}

interface PositionedEvent extends CalendarEvent {
  startMs: number;
  endMs: number;
  topPx: number;
  heightPx: number;
  leftPct: number;
  widthPct: number;
  crossesMidnight: boolean;
  startsBeforeGrid: boolean;
  isContinuationFromPrevDay?: boolean;
  isOutsideWorkingHours: boolean;
  clusterId: string;
  totalColsInCluster: number;
  colIndex: number;
}

interface DenseCluster {
  id: string;
  dateIso: string;
  topPx: number;
  heightPx: number;
  startFormatted: string;
  endFormatted: string;
  totalCols: number;
  events: PositionedEvent[];
}

export default function CalendarPage() {
  const { activeSpaceId } = useWorkspace();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('2026-11-08');
  const [todayStr, setTodayStr] = useState<string>('2026-11-08');
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'agenda'>('week');
  
  // Operating rules state from authoritative settings
  const [operatingRules, setOperatingRules] = useState({
    workStart: '09:00',
    workEnd: '18:00',
    maxDailyWorkloadHours: 6.5,
  });

  // Modal states
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedDenseCluster, setSelectedDenseCluster] = useState<DenseCluster | null>(null);

  // New Event Form states
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('2026-11-08');
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('10:00');
  const [newEventType, setNewEventType] = useState('time_block');

  // Edit Event Form states
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('09:00');
  const [editEndTime, setEditEndTime] = useState('10:00');
  const [editEventType, setEditEventType] = useState('time_block');

  const loadEvents = () => {
    fetch('/api/calendar')
      .then(r => r.json())
      .then(data => setEvents(data.events || []))
      .catch(() => {});
  };

  const loadSettings = () => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (data.preferences) {
          const p = data.preferences;
          setOperatingRules({
            workStart: p.workStart || p.workHoursStart || '09:00',
            workEnd: p.workEnd || p.workHoursEnd || '18:00',
            maxDailyWorkloadHours: parseFloat(p.maxDailyWorkloadHours || '6.5'),
          });
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    const today = todayISO();
    setTodayStr(today);
    setSelectedDate(today);
    setNewEventDate(today);
    loadEvents();
    loadSettings();
  }, [activeSpaceId]);

  // Compute the 7 days of the currently selected week (Monday to Sunday)
  const weekDays = useMemo(() => {
    const base = new Date(selectedDate + 'T12:00:00');
    const dayOfWeek = base.getDay();
    const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(base);
    monday.setDate(base.getDate() + distanceToMonday);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.getDate();
      const monthName = d.toLocaleDateString('en-US', { month: 'short' });
      days.push({ iso, dayName, dayNum, monthName, dateObj: d });
    }
    return days;
  }, [selectedDate]);

  // Navigation handlers
  const handlePrev = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    if (calendarView === 'week') {
      d.setDate(d.getDate() - 7);
    } else {
      d.setDate(d.getDate() - 1);
    }
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNext = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    if (calendarView === 'week') {
      d.setDate(d.getDate() + 7);
    } else {
      d.setDate(d.getDate() + 1);
    }
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    const today = todayISO();
    setSelectedDate(today);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) return;

    const start = `${newEventDate}T${newStartTime}:00`;
    const end = `${newEventDate}T${newEndTime}:00`;

    await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newEventTitle.trim(),
        startTime: start,
        endTime: end,
        eventType: newEventType,
        spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
      }),
    });

    setNewEventTitle('');
    setIsAddEventOpen(false);
    loadEvents();
  };

  const handleOpenEdit = (ev: CalendarEvent) => {
    setEditingEvent(ev);
    setEditTitle(ev.title);
    const datePart = ev.start_time.split('T')[0];
    const startPart = ev.start_time.includes('T') ? ev.start_time.split('T')[1].slice(0, 5) : '09:00';
    const endPart = ev.end_time.includes('T') ? ev.end_time.split('T')[1].slice(0, 5) : '10:00';
    setEditDate(datePart);
    setEditStartTime(startPart);
    setEditEndTime(endPart);
    setEditEventType(ev.event_type || 'time_block');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent || !editTitle.trim()) return;

    const start = `${editDate}T${editStartTime}:00`;
    const end = `${editDate}T${editEndTime}:00`;

    await fetch('/api/calendar', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingEvent.id,
        title: editTitle.trim(),
        startTime: start,
        endTime: end,
        eventType: editEventType,
        taskId: editingEvent.task_id,
        projectId: editingEvent.project_id,
      }),
    });

    setEditingEvent(null);
    loadEvents();
  };

  const handleDeleteEvent = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await fetch(`/api/calendar?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (editingEvent?.id === id) {
      setEditingEvent(null);
    }
    loadEvents();
  };

  // 15 hours: 07:00 to 21:00 (ends at 22:00)
  const START_HOUR = 7;
  const END_HOUR = 22;
  const hours = useMemo(() => {
    return Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR);
  }, []);

  const ROW_HEIGHT = 64; // px per hour slot

  const workStartHour = parseInt(operatingRules.workStart.split(':')[0], 10);
  const workEndHour = parseInt(operatingRules.workEnd.split(':')[0], 10);

  // Helper for source classification, iconography, and colors
  const getEventSourceMeta = (ev: CalendarEvent) => {
    const isPlanBlock =
      ev.event_type === 'daily_plan_block' ||
      ev.id.startsWith('calev_plan_') ||
      ev.id.startsWith('ev_plan_');
    const isHabit = ev.event_type === 'habit' || ev.event_type === 'recurring_habit';
    const isMeeting = ev.event_type === 'meeting';

    if (isPlanBlock) {
      return {
        type: 'planner',
        label: 'AI Daily Plan',
        badgeClass: 'bg-emerald-950/75 border-emerald-500/40 text-emerald-200 hover:border-emerald-400',
        pillClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
        dotClass: 'bg-emerald-400',
        accentColor: '#10b981',
        icon: Sparkles,
      };
    }
    if (isHabit) {
      return {
        type: 'habit',
        label: 'Habit / Routine',
        badgeClass: 'bg-purple-950/75 border-purple-500/40 text-purple-200 hover:border-purple-400',
        pillClass: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
        dotClass: 'bg-purple-400',
        accentColor: '#a855f7',
        icon: CheckCircle2,
      };
    }
    if (isMeeting) {
      return {
        type: 'meeting',
        label: 'Meeting',
        badgeClass: 'bg-amber-950/75 border-amber-500/40 text-amber-200 hover:border-amber-400',
        pillClass: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
        dotClass: 'bg-amber-400',
        accentColor: '#f59e0b',
        icon: Users,
      };
    }
    return {
      type: 'time_block',
      label: 'Focus Block',
      badgeClass: 'bg-indigo-950/75 border-indigo-500/40 text-indigo-200 hover:border-indigo-400',
      pillClass: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
      dotClass: 'bg-indigo-400',
      accentColor: '#6366f1',
      icon: Clock,
    };
  };

  // Overlap calculation engine: positions events with sub-column offsets using greedy interval graph coloring
  const calculateDayEventPositions = (dayEvents: CalendarEvent[], targetDateStr?: string): PositionedEvent[] => {
    if (dayEvents.length === 0) return [];

    // Sort by start time then duration (longest duration first to anchor outer sub-columns)
    const sorted = [...dayEvents].sort((a, b) => {
      const aStart = new Date(a.start_time).getTime();
      const bStart = new Date(b.start_time).getTime();
      if (aStart !== bStart) return aStart - bStart;
      const aDuration = new Date(a.end_time).getTime() - aStart;
      const bDuration = new Date(b.end_time).getTime() - bStart;
      return bDuration - aDuration;
    });

    const parsed = sorted.map(ev => {
      const start = new Date(ev.start_time);
      const end = new Date(ev.end_time);
      let startMs = start.getTime();
      let endMs = end.getTime();
      if (endMs <= startMs) endMs = startMs + 30 * 60000;

      const startDateStr = ev.start_time.split('T')[0];
      const endDateStr = ev.end_time.split('T')[0];

      const crossesMidnight = end.getDate() !== start.getDate() || Boolean(targetDateStr && endDateStr > targetDateStr);
      const isContinuationFromPrevDay = Boolean(targetDateStr && startDateStr < targetDateStr);

      const effectiveStartHour = isContinuationFromPrevDay ? START_HOUR : start.getHours();
      const effectiveStartMin = isContinuationFromPrevDay ? 0 : start.getMinutes();

      const startsBeforeGrid = !isContinuationFromPrevDay && start.getHours() < START_HOUR;
      
      const isOutsideWorkingHours =
        effectiveStartHour < workStartHour ||
        (end.getHours() > workEndHour || (end.getHours() === workEndHour && end.getMinutes() > 0));

      const startH = Math.max(START_HOUR, effectiveStartHour);
      const startM = startsBeforeGrid ? 0 : effectiveStartMin;
      
      const topMinutes = (startH - START_HOUR) * 60 + startM;
      const topPx = (topMinutes / 60) * ROW_HEIGHT;

      // Duration clamped within display grid
      let durationMinutes: number;
      if (isContinuationFromPrevDay) {
        if (targetDateStr && endDateStr > targetDateStr) {
          durationMinutes = (END_HOUR - START_HOUR) * 60;
        } else {
          durationMinutes = (end.getHours() - START_HOUR) * 60 + end.getMinutes();
        }
      } else if (startsBeforeGrid) {
        if (targetDateStr && endDateStr > targetDateStr) {
          durationMinutes = (END_HOUR - START_HOUR) * 60;
        } else {
          durationMinutes = (end.getHours() - START_HOUR) * 60 + end.getMinutes();
        }
      } else {
        if (targetDateStr && endDateStr > targetDateStr) {
          durationMinutes = (END_HOUR - startH) * 60 - startM;
        } else {
          durationMinutes = Math.round((endMs - startMs) / 60000);
        }
      }

      const maxGridMinutes = (END_HOUR - START_HOUR) * 60 - topMinutes;
      const displayDurationMinutes = Math.min(maxGridMinutes, Math.max(25, durationMinutes));
      const heightPx = Math.max(28, (displayDurationMinutes / 60) * ROW_HEIGHT);

      return {
        ...ev,
        startMs,
        endMs,
        topPx,
        heightPx,
        crossesMidnight,
        startsBeforeGrid,
        isContinuationFromPrevDay,
        isOutsideWorkingHours,
        leftPct: 0,
        widthPct: 100,
        clusterId: '',
        totalColsInCluster: 1,
        colIndex: 0,
      };
    });

    // Detect overlapping clusters
    const clusters: (typeof parsed)[] = [];
    let currentCluster: typeof parsed = [];
    let clusterEndMs = 0;

    for (const item of parsed) {
      if (currentCluster.length === 0) {
        currentCluster.push(item);
        clusterEndMs = item.endMs;
      } else if (item.startMs < clusterEndMs) {
        currentCluster.push(item);
        clusterEndMs = Math.max(clusterEndMs, item.endMs);
      } else {
        clusters.push(currentCluster);
        currentCluster = [item];
        clusterEndMs = item.endMs;
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    // Assign sub-columns for each cluster using greedy interval packing (no limit on concurrent overlaps)
    const positioned: PositionedEvent[] = [];
    clusters.forEach((cluster, clusterIdx) => {
      const clusterId = `cluster_${targetDateStr || 'day'}_${clusterIdx}`;
      const colEndTimes: number[] = [];
      const itemColIndices: number[] = [];

      cluster.forEach((item) => {
        let assignedCol = -1;
        for (let c = 0; c < colEndTimes.length; c++) {
          if (colEndTimes[c] <= item.startMs) {
            assignedCol = c;
            colEndTimes[c] = item.endMs;
            break;
          }
        }
        if (assignedCol === -1) {
          assignedCol = colEndTimes.length;
          colEndTimes.push(item.endMs);
        }
        itemColIndices.push(assignedCol);
      });

      const totalCols = Math.max(1, colEndTimes.length);

      cluster.forEach((item, idx) => {
        const colIndex = itemColIndices[idx];
        positioned.push({
          ...item,
          leftPct: (colIndex * 100) / totalCols,
          widthPct: 100 / totalCols,
          clusterId,
          totalColsInCluster: totalCols,
          colIndex,
        });
      });
    });

    return positioned;
  };

  // Helper to extract dense overlapping clusters for high-density badges & popovers
  const getDenseClusters = (dayEvents: CalendarEvent[], targetDateStr: string): DenseCluster[] => {
    const positioned = calculateDayEventPositions(dayEvents, targetDateStr);
    const map = new Map<string, PositionedEvent[]>();
    for (const ev of positioned) {
      if (!map.has(ev.clusterId)) {
        map.set(ev.clusterId, []);
      }
      map.get(ev.clusterId)!.push(ev);
    }

    const denseList: DenseCluster[] = [];
    map.forEach((clusterEvents, clusterId) => {
      const totalCols = clusterEvents[0]?.totalColsInCluster || 1;
      // High-density threshold: 3+ concurrent tracks or 4+ total overlapping blocks
      if (totalCols >= 3 || clusterEvents.length >= 4) {
        const topPx = Math.min(...clusterEvents.map(e => e.topPx));
        const bottomPx = Math.max(...clusterEvents.map(e => e.topPx + e.heightPx));
        const earliestStart = new Date(Math.min(...clusterEvents.map(e => e.startMs)));
        const latestEnd = new Date(Math.max(...clusterEvents.map(e => e.endMs)));

        denseList.push({
          id: clusterId,
          dateIso: targetDateStr,
          topPx,
          heightPx: bottomPx - topPx,
          startFormatted: earliestStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
          endFormatted: latestEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
          totalCols,
          events: clusterEvents.sort((a, b) => a.startMs - b.startMs),
        });
      }
    });

    return denseList;
  };

  // Keyboard navigation support across events
  const handleEventKeyDown = (
    e: React.KeyboardEvent,
    ev: PositionedEvent,
    allDayEvents: PositionedEvent[]
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      handleOpenEdit(ev);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const sorted = [...allDayEvents].sort((a, b) => a.startMs - b.startMs);
      const idx = sorted.findIndex(item => item.id === ev.id);
      if (idx !== -1 && idx < sorted.length - 1) {
        const nextId = sorted[idx + 1].id;
        const el = document.querySelector(`[data-event-id="${nextId}"]`) as HTMLElement;
        el?.focus();
      }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const sorted = [...allDayEvents].sort((a, b) => a.startMs - b.startMs);
      const idx = sorted.findIndex(item => item.id === ev.id);
      if (idx > 0) {
        const prevId = sorted[idx - 1].id;
        const el = document.querySelector(`[data-event-id="${prevId}"]`) as HTMLElement;
        el?.focus();
      }
    }
  };

  // Format header range text
  const headerRangeLabel = useMemo(() => {
    if (calendarView === 'week') {
      const first = weekDays[0];
      const last = weekDays[6];
      return `${first.monthName} ${first.dayNum} – ${last.monthName} ${last.dayNum}, ${first.dateObj.getFullYear()}`;
    }
    const d = new Date(selectedDate + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  }, [calendarView, weekDays, selectedDate]);

  // Agenda events filtered & sorted chronologically
  const sortedAgendaEvents = useMemo(() => {
    return [...events].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [events]);

  return (
    <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5">
              <CalendarIcon className="w-5 h-5 text-zinc-300" />
              <span>Calendar & Time Blocking</span>
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded border border-white/[0.08] bg-zinc-900/60 text-zinc-400">
              {events.length} {events.length === 1 ? 'block' : 'blocks'} scheduled
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Chronological executive scheduling, calendar sync, and guaranteed capacity boundaries.
          </p>
        </div>

        {/* View Controls & Action Triggers */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Navigation Controls */}
          <div className="flex items-center bg-zinc-950/80 border border-white/[0.08] rounded-md p-0.5 text-xs">
            <button
              onClick={handlePrev}
              aria-label="Previous period"
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-2.5 py-0.5 text-[11px] font-medium text-zinc-300 hover:text-white transition-colors"
            >
              Today
            </button>
            <button
              onClick={handleNext}
              aria-label="Next period"
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* View switcher */}
          <div className="bg-zinc-950/80 border border-white/[0.08] rounded-md p-0.5 flex items-center text-xs">
            <button
              data-view="day"
              onClick={() => setCalendarView('day')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                calendarView === 'day' ? 'bg-zinc-800 text-zinc-100 shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Day
            </button>
            <button
              data-view="week"
              onClick={() => setCalendarView('week')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                calendarView === 'week' ? 'bg-zinc-800 text-zinc-100 shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Week
            </button>
            <button
              data-view="agenda"
              onClick={() => setCalendarView('agenda')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                calendarView === 'agenda' ? 'bg-zinc-800 text-zinc-100 shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Agenda
            </button>
          </div>

          <div className="h-4 w-px bg-white/[0.08] hidden sm:block" />

          {/* AI Plan Link */}
          <Link
            href="/productivity/plan"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-white/[0.08] hover:bg-zinc-800 text-zinc-200 rounded-md text-xs font-medium transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
            <span>AI Planning Workstation</span>
          </Link>

          {/* Block Time Action */}
          <button
            onClick={() => {
              setNewEventDate(selectedDate);
              setIsAddEventOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold rounded-md text-xs transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Block Time</span>
          </button>
        </div>
      </div>

      {/* Date Header Sub-bar & Authoritative Operating Hours Synchronization */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-zinc-400 bg-zinc-950/60 border border-white/[0.06] rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-4 h-4 text-zinc-400" />
          <span className="font-semibold text-zinc-200 text-sm">{headerRangeLabel}</span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-white/[0.08] text-zinc-400">
            Work Hours: {operatingRules.workStart} – {operatingRules.workEnd} (Max {operatingRules.maxDailyWorkloadHours}h Focus)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400/80" />
            <span className="text-zinc-300">Daily Plan Blocks</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-400/80" />
            <span className="text-zinc-300">Protected Focus Blocks</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400/80" />
            <span className="text-zinc-300">Meetings</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-400/80" />
            <span className="text-zinc-300">Recurring Habits</span>
          </span>
        </div>
      </div>

      {/* Add Time Block Modal */}
      {isAddEventOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/[0.1] rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-300" />
                <h3 className="text-sm font-semibold text-zinc-100">Schedule Time Block</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddEventOpen(false)}
                className="text-zinc-400 hover:text-zinc-100 p-1"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Title</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newEventTitle}
                  onChange={e => setNewEventTitle(e.target.value)}
                  placeholder="e.g., Deep Focus: Architecture Review"
                  className="w-full bg-zinc-950 border border-white/[0.1] rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-400 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={newEventDate}
                    onChange={e => setNewEventDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/[0.1] rounded-md px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-zinc-400 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Block Type</label>
                  <select
                    value={newEventType}
                    onChange={e => setNewEventType(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/[0.1] rounded-md px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-zinc-400 text-xs"
                  >
                    <option value="time_block">Focus Time Block</option>
                    <option value="meeting">External Meeting</option>
                    <option value="daily_plan_block">Committed Plan Block</option>
                    <option value="habit">Recurring Habit / Routine</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={newStartTime}
                    onChange={e => setNewStartTime(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/[0.1] rounded-md px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-zinc-400 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={newEndTime}
                    onChange={e => setNewEndTime(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/[0.1] rounded-md px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-zinc-400 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setIsAddEventOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold rounded-md text-xs transition-colors"
                >
                  Confirm & Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Reschedule Modal */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/[0.1] rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-zinc-300" />
                <h3 className="text-sm font-semibold text-zinc-100">Edit & Reschedule Block</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingEvent(null)}
                className="text-zinc-400 hover:text-zinc-100 p-1"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/[0.1] rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-400 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Target Date</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/[0.1] rounded-md px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-zinc-400 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Block Type</label>
                  <select
                    value={editEventType}
                    onChange={e => setEditEventType(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/[0.1] rounded-md px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-zinc-400 text-xs"
                  >
                    <option value="time_block">Focus Time Block</option>
                    <option value="meeting">External Meeting</option>
                    <option value="daily_plan_block">Committed Plan Block</option>
                    <option value="habit">Recurring Habit / Routine</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={editStartTime}
                    onChange={e => setEditStartTime(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/[0.1] rounded-md px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-zinc-400 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={editEndTime}
                    onChange={e => setEditEndTime(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/[0.1] rounded-md px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-zinc-400 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => handleDeleteEvent(editingEvent.id)}
                  className="px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 rounded-md transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Block</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingEvent(null)}
                    className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold rounded-md text-xs transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Accessible Conflict & Dense Events Popover / Modal */}
      {selectedDenseCluster && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dense-cluster-modal-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSelectedDenseCluster(null);
          }}
        >
          <div className="bg-zinc-900 border border-white/[0.1] rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <div>
                  <h3 id="dense-cluster-modal-title" className="text-sm font-semibold text-zinc-100">
                    Concurrent Events & Overlaps
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    {selectedDenseCluster.dateIso} • {selectedDenseCluster.startFormatted} – {selectedDenseCluster.endFormatted} ({selectedDenseCluster.events.length} overlapping blocks)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDenseCluster(null)}
                className="text-zinc-400 hover:text-zinc-100 p-1"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-zinc-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                High concurrency detected: {selectedDenseCluster.events.length} time blocks share this interval across {selectedDenseCluster.totalCols} parallel columns. Review items below or click to reschedule.
              </span>
            </div>

            <div className="overflow-y-auto space-y-2 pr-1 flex-1">
              {selectedDenseCluster.events.map((ev, i) => {
                const meta = getEventSourceMeta(ev);
                const Icon = meta.icon;
                const sTime = new Date(ev.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const eTime = new Date(ev.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const hasIdenticalStart = selectedDenseCluster.events.some((o, idx) => idx !== i && o.start_time === ev.start_time);

                return (
                  <div
                    key={ev.id}
                    className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${meta.badgeClass}`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />
                        <span className="font-semibold text-xs text-zinc-100 truncate">{ev.title}</span>
                        <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded ${meta.pillClass}`}>
                          {meta.label}
                        </span>
                        {hasIdenticalStart && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            Twin Overlap
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono opacity-80 flex items-center gap-2">
                        <span>{sTime} – {eTime}</span>
                        {ev.crossesMidnight && <span className="opacity-70">• Crosses midnight</span>}
                        {ev.isOutsideWorkingHours && <span className="opacity-70">• Off-hours</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDenseCluster(null);
                          handleOpenEdit(ev);
                        }}
                        className="px-2.5 py-1 text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-white/[0.08] transition-colors"
                      >
                        Edit / Reschedule
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          handleDeleteEvent(ev.id, e);
                          setSelectedDenseCluster(prev => {
                            if (!prev) return null;
                            const nextEvents = prev.events.filter(x => x.id !== ev.id);
                            if (nextEvents.length === 0) return null;
                            return { ...prev, events: nextEvents };
                          });
                        }}
                        className="p-1 text-zinc-400 hover:text-rose-400 rounded transition-colors"
                        title="Delete event"
                        aria-label="Delete event"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setSelectedDenseCluster(null)}
                className="px-4 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold rounded-md text-xs transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: WEEK VIEW */}
      {calendarView === 'week' && (
        <div className="bg-zinc-950 border border-white/[0.08] rounded-xl overflow-hidden shadow-sm flex flex-col">
          {/* Day Columns Header */}
          <div className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-white/[0.08] bg-zinc-900/60 sticky top-0 z-20">
            <div className="p-3 text-[11px] font-mono text-zinc-500 border-r border-white/[0.08] flex items-center justify-center">
              GMT
            </div>
            {weekDays.map(day => {
              const isToday = day.iso === todayStr;
              return (
                <div
                  key={day.iso}
                  onClick={() => {
                    setSelectedDate(day.iso);
                    setCalendarView('day');
                  }}
                  className={`p-3 text-center border-r border-white/[0.08] cursor-pointer hover:bg-white/[0.02] transition-colors ${
                    isToday ? 'bg-zinc-800/40' : ''
                  }`}
                >
                  <div className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
                    {day.dayName}
                  </div>
                  <div className="mt-1 flex items-center justify-center">
                    <span
                      className={`text-sm font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                        isToday ? 'bg-white text-zinc-950 font-extrabold' : 'text-zinc-200'
                      }`}
                    >
                      {day.dayNum}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time Grid with scroll */}
          <div className="relative overflow-y-auto max-h-[720px] select-none">
            <div
              className="grid grid-cols-[70px_repeat(7,1fr)] relative"
              style={{ height: `${hours.length * ROW_HEIGHT}px` }}
            >
              {/* Left Time Gutter */}
              <div className="border-r border-white/[0.08] bg-zinc-950/80">
                {hours.map(hour => {
                  const label = `${hour.toString().padStart(2, '0')}:00`;
                  const isWorkHour = hour >= workStartHour && hour < workEndHour;
                  return (
                    <div
                      key={hour}
                      style={{ height: `${ROW_HEIGHT}px` }}
                      className={`border-b border-white/[0.04] px-2 text-[10px] font-mono flex items-start pt-1 justify-end pr-2 ${
                        isWorkHour ? 'text-zinc-400 font-medium' : 'text-zinc-600'
                      }`}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>

              {/* 7 Day Columns */}
              {weekDays.map(day => {
                const dayEvents = events.filter(ev => {
                  const sDate = ev.start_time.split('T')[0];
                  const eDate = ev.end_time.split('T')[0];
                  return sDate <= day.iso && eDate >= day.iso;
                });
                const positionedEvents = calculateDayEventPositions(dayEvents, day.iso);
                const denseClusters = getDenseClusters(dayEvents, day.iso);
                const isToday = day.iso === todayStr;

                return (
                  <div
                    key={day.iso}
                    data-day-column={day.iso}
                    onClick={() => {
                      setNewEventDate(day.iso);
                      setIsAddEventOpen(true);
                    }}
                    className={`border-r border-white/[0.08] relative group ${
                      isToday ? 'bg-white/[0.015]' : ''
                    }`}
                  >
                    {/* Hourly background lines with working-hours highlight */}
                    {hours.map(hour => {
                      const isWorkHour = hour >= workStartHour && hour < workEndHour;
                      return (
                        <div
                          key={hour}
                          style={{ height: `${ROW_HEIGHT}px` }}
                          className={`border-b border-white/[0.04] transition-colors group-hover:border-white/[0.07] ${
                            isWorkHour ? 'bg-white/[0.01]' : 'bg-black/20'
                          }`}
                        />
                      );
                    })}

                    {/* Overlap Density Badges for dense clusters (3+ concurrent columns or 4+ events) */}
                    {denseClusters.map(cluster => (
                      <button
                        key={cluster.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDenseCluster(cluster);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedDenseCluster(cluster);
                          }
                        }}
                        style={{
                          top: `${Math.max(2, cluster.topPx - 10)}px`,
                          right: '4px',
                        }}
                        className="absolute z-25 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[9px] font-mono font-semibold shadow-md backdrop-blur-xs transition-all hover:scale-105 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                        title={`High overlap density: ${cluster.events.length} concurrent events (${cluster.startFormatted} – ${cluster.endFormatted}). Click to inspect conflict details.`}
                        aria-label={`High density cluster: ${cluster.events.length} concurrent events. Press Enter to view list.`}
                      >
                        <AlertCircle className="w-2.5 h-2.5 text-amber-400" />
                        <span>+{cluster.events.length} dense</span>
                      </button>
                    ))}

                    {/* Positioned Events in this column (with overlap sub-columns) */}
                    {positionedEvents.map(ev => {
                      const sourceMeta = getEventSourceMeta(ev);
                      const startFormatted = new Date(ev.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                      const endFormatted = new Date(ev.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

                      return (
                        <div
                          key={ev.id}
                          data-event-id={ev.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`${ev.title}, ${startFormatted} to ${endFormatted}, ${sourceMeta.label}${ev.crossesMidnight ? ', continues next day' : ''}${ev.isOutsideWorkingHours ? ', off-hours' : ''}. Press Enter to edit.`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(ev);
                          }}
                          onKeyDown={(e) => handleEventKeyDown(e, ev, positionedEvents)}
                          style={{
                            top: `${ev.topPx}px`,
                            height: `${ev.heightPx}px`,
                            left: `calc(${ev.leftPct}% + 2px)`,
                            width: `calc(${ev.widthPct}% - 4px)`,
                          }}
                          className={`group cursor-pointer absolute rounded-md border p-1.5 text-xs overflow-hidden transition-all shadow-xs z-10 hover:z-30 hover:scale-[1.02] hover:min-w-[140px] hover:w-auto hover:brightness-125 focus:outline-hidden focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-zinc-950 focus:z-40 focus:min-w-[140px] focus:w-auto ${sourceMeta.badgeClass}`}
                          title={`${ev.title}\nTime: ${startFormatted} – ${endFormatted}\nType: ${sourceMeta.label}\nClick or press Enter to edit/reschedule`}
                        >
                          <div className="flex items-start justify-between gap-1 leading-tight">
                            <span className="font-semibold text-[11px] truncate">{ev.title}</span>
                            {ev.crossesMidnight && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-black/40 font-mono text-zinc-300 shrink-0">
                                → Next Day
                              </span>
                            )}
                            {ev.isContinuationFromPrevDay && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/30 font-mono text-indigo-200 shrink-0">
                                ← Continued
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] opacity-75 font-mono mt-0.5 flex items-center justify-between">
                            <span>{startFormatted} – {endFormatted}</span>
                            {ev.isOutsideWorkingHours && (
                              <span className="text-[9px] opacity-60">Off-hours</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* VIEW: DAY VIEW */}
      {calendarView === 'day' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Day Timeline */}
          <div className="lg:col-span-3 bg-zinc-950 border border-white/[0.08] rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-white/[0.08] bg-zinc-900/60 flex items-center justify-between">
              <div>
                <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400">Day Timeline</span>
                <h3 className="text-sm font-bold text-zinc-100">{headerRangeLabel}</h3>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  aria-label="Selected Date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="bg-zinc-900 border border-white/[0.1] rounded-md px-2.5 py-1 text-xs text-zinc-200"
                />
              </div>
            </div>

            <div className="relative overflow-y-auto max-h-[700px] select-none">
              <div
                className="grid grid-cols-[80px_1fr] relative"
                style={{ height: `${hours.length * ROW_HEIGHT}px` }}
              >
                {/* Left Gutter */}
                <div className="border-r border-white/[0.08] bg-zinc-950/80">
                  {hours.map(hour => {
                    const label = `${hour.toString().padStart(2, '0')}:00`;
                    const isWorkHour = hour >= workStartHour && hour < workEndHour;
                    return (
                      <div
                        key={hour}
                        style={{ height: `${ROW_HEIGHT}px` }}
                        className={`border-b border-white/[0.04] px-3 text-[11px] font-mono flex items-start pt-1 justify-end ${
                          isWorkHour ? 'text-zinc-400 font-medium' : 'text-zinc-600'
                        }`}
                      >
                        {label}
                      </div>
                    );
                  })}
                </div>

                {/* Day Canvas */}
                <div
                  onClick={() => {
                    setNewEventDate(selectedDate);
                    setIsAddEventOpen(true);
                  }}
                  className="relative group bg-zinc-950"
                >
                  {hours.map(hour => {
                    const isWorkHour = hour >= workStartHour && hour < workEndHour;
                    return (
                      <div
                        key={hour}
                        style={{ height: `${ROW_HEIGHT}px` }}
                        className={`border-b border-white/[0.04] hover:bg-white/[0.01] transition-colors ${
                          isWorkHour ? 'bg-white/[0.01]' : 'bg-black/20'
                        }`}
                      />
                    );
                  })}

                  {/* Day Events Positioned */}
                  {calculateDayEventPositions(
                    events.filter(ev => {
                      const sDate = ev.start_time.split('T')[0];
                      const eDate = ev.end_time.split('T')[0];
                      return sDate <= selectedDate && eDate >= selectedDate;
                    }),
                    selectedDate
                  ).map((ev, _, dayPositioned) => {
                    const sourceMeta = getEventSourceMeta(ev);
                    const SourceIcon = sourceMeta.icon;
                    const startFormatted = new Date(ev.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    const endFormatted = new Date(ev.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

                    return (
                      <div
                        key={ev.id}
                        data-event-id={ev.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${ev.title}, ${startFormatted} to ${endFormatted}, ${sourceMeta.label}${ev.crossesMidnight ? ', continues next day' : ''}${ev.isOutsideWorkingHours ? ', off-hours' : ''}. Press Enter to edit.`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(ev);
                        }}
                        onKeyDown={(e) => handleEventKeyDown(e, ev, dayPositioned)}
                        style={{
                          top: `${ev.topPx}px`,
                          height: `${ev.heightPx}px`,
                          left: `calc(${ev.leftPct}% + 8px)`,
                          width: `calc(${ev.widthPct}% - 16px)`,
                        }}
                        className={`group cursor-pointer absolute rounded-lg border p-3 text-xs overflow-hidden transition-all shadow-sm z-10 hover:brightness-125 focus:outline-hidden focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-zinc-950 ${sourceMeta.badgeClass}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <SourceIcon className="w-4 h-4 shrink-0 opacity-80" />
                            <span className="font-semibold text-sm truncate">{ev.title}</span>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${sourceMeta.pillClass}`}>
                              {sourceMeta.label}
                            </span>
                            {ev.crossesMidnight && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                → Next Day
                              </span>
                            )}
                            {ev.isContinuationFromPrevDay && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-500/40">
                                ← Continued
                              </span>
                            )}
                            {ev.startsBeforeGrid && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-white/[0.08]">
                                Early Start ({startFormatted})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-mono opacity-80">
                              {startFormatted} – {endFormatted}
                            </span>
                            {ev.isOutsideWorkingHours && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-zinc-400 font-mono">
                                Off-hours
                              </span>
                            )}
                            <button
                              onClick={(e) => handleDeleteEvent(ev.id, e)}
                              className="text-zinc-400 hover:text-rose-400 p-1"
                              title="Delete block"
                              aria-label="Delete block"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {ev.description && (
                          <p className="text-[11px] opacity-75 mt-1">{ev.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Day Summary & Guidance Sidebar */}
          <div className="space-y-4">
            <div className="bg-zinc-950 border border-white/[0.08] rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Day Capacity Breakdown</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Scheduled Blocks</span>
                  <span className="font-mono text-zinc-200">
                    {events.filter(ev => ev.start_time.split('T')[0] === selectedDate).length}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Planned Work Blocks</span>
                  <span className="font-mono text-emerald-400">
                    {events.filter(ev => ev.start_time.split('T')[0] === selectedDate && ev.event_type === 'daily_plan_block').length}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Configured Work Window</span>
                  <span className="font-mono text-zinc-300">{operatingRules.workStart} – {operatingRules.workEnd}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Daily Cap</span>
                  <span className="font-mono text-zinc-300">{operatingRules.maxDailyWorkloadHours}h / day</span>
                </div>
              </div>

              <div className="pt-3 border-t border-white/[0.08]">
                <Link
                  href="/productivity/plan"
                  className="w-full flex items-center justify-center gap-2 py-2 bg-zinc-900 border border-white/[0.08] hover:bg-zinc-800 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
                  <span>Launch Daily AI Planner</span>
                </Link>
              </div>
            </div>

            <div className="bg-zinc-950 border border-white/[0.08] rounded-xl p-4 space-y-2 text-xs">
              <h4 className="font-semibold text-zinc-200 uppercase tracking-wider text-[11px]">Calendar Interactions</h4>
              <p className="text-zinc-400 leading-relaxed text-[11px]">
                Click any scheduled block or press Enter while focused to edit its title, reschedule to another date, or adjust start/end boundaries.
                Click on any empty hour row to quickly reserve new time. Use Arrow keys to navigate chronologically.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: AGENDA VIEW */}
      {calendarView === 'agenda' && (
        <div className="bg-zinc-950 border border-white/[0.08] rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-white/[0.08] bg-zinc-900/60 flex items-center justify-between">
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400">Chronological Agenda</span>
              <h3 className="text-sm font-bold text-zinc-100">Scheduled Priorities & Time Reservations</h3>
            </div>
            <button
              onClick={() => {
                setNewEventDate(todayStr);
                setIsAddEventOpen(true);
              }}
              className="px-3 py-1 bg-zinc-100 hover:bg-white text-zinc-950 rounded-md text-xs font-semibold"
            >
              + Add Block
            </button>
          </div>

          <div className="divide-y divide-white/[0.06]">
            {sortedAgendaEvents.length === 0 ? (
              <div className="p-12 text-center text-zinc-500 text-xs">
                No events or time blocks scheduled. Click &quot;Block Time&quot; or launch the AI Daily Planner.
              </div>
            ) : (
              sortedAgendaEvents.map(ev => {
                const dateObj = new Date(ev.start_time);
                const dateFormatted = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                const startTimeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const endTimeStr = new Date(ev.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const sourceMeta = getEventSourceMeta(ev);
                const SourceIcon = sourceMeta.icon;

                const startH = dateObj.getHours();
                const endH = new Date(ev.end_time).getHours();
                const isOffHours = startH < workStartHour || endH > workEndHour;
                const crossesMid = ev.end_time.split('T')[0] > ev.start_time.split('T')[0];

                return (
                  <div
                    key={ev.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenEdit(ev)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenEdit(ev);
                      }
                    }}
                    className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer group focus:outline-hidden focus:bg-white/[0.04]"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-36 shrink-0">
                        <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5 text-zinc-400" />
                          <span>{dateFormatted}</span>
                        </div>
                        <div className="text-[11px] font-mono text-zinc-400 mt-0.5">{startTimeStr} – {endTimeStr}</div>
                      </div>

                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sourceMeta.dotClass}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-zinc-100 truncate">{ev.title}</span>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${sourceMeta.pillClass}`}>
                              {sourceMeta.label}
                            </span>
                            {crossesMid && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                → Next Day
                              </span>
                            )}
                            {isOffHours && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-white/[0.08]">
                                Off-hours
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-400 capitalize truncate mt-0.5">
                            {ev.description || (ev.task_id ? 'Linked to Planned Task' : 'Scheduled Calendar Event')}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(ev);
                        }}
                        className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded transition-colors text-xs flex items-center gap-1"
                        title="Edit / Reschedule"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={(e) => handleDeleteEvent(ev.id, e)}
                        className="text-zinc-500 hover:text-rose-400 p-1.5 rounded transition-colors"
                        title="Delete block"
                        aria-label="Delete block"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { todayISO } from '@/lib/time';
import { apiFetch, apiSend, errorText } from '@/lib/api/client';
import {
  Clock,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface FocusSessionRow {
  id: string;
  task_id: string | null;
  task_title: string | null;
  planned_duration: number;
  actual_duration: number;
  interruptions_count: number;
  notes: string | null;
  started_at: string;
  created_at: string;
}

interface CompletedSession {
  id: string;
  title: string;
  duration: number;
  interruptions: number;
  timestamp: string;
}

interface StoredTimerState {
  sessionDurationMinutes?: number;
  secondsRemaining?: number;
  isRunning?: boolean;
  lastUpdated?: number;
  sessionNotes?: string;
  interruptionsCount?: number;
  startedAt?: string | null;
}

const STORAGE_KEY = 'personal_os_focus_timer_state';

export default function FocusTimerPage() {
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(25);
  const [secondsRemaining, setSecondsRemaining] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [interruptionsCount, setInterruptionsCount] = useState(0);
  const [sessionNotes, setSessionNotes] = useState('');
  const [sessionStartTime, setSessionStartTime] = useState<string | null>(null);
  const [completedSessions, setCompletedSessions] = useState<CompletedSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for reliable access in event handlers and beforeunload
  const isRunningRef = React.useRef(isRunning);
  const secondsRemainingRef = React.useRef(secondsRemaining);
  const sessionDurationMinutesRef = React.useRef(sessionDurationMinutes);
  const sessionNotesRef = React.useRef(sessionNotes);
  const interruptionsCountRef = React.useRef(interruptionsCount);
  const sessionStartTimeRef = React.useRef(sessionStartTime);

  useEffect(() => {
    isRunningRef.current = isRunning;
    secondsRemainingRef.current = secondsRemaining;
    sessionDurationMinutesRef.current = sessionDurationMinutes;
    sessionNotesRef.current = sessionNotes;
    interruptionsCountRef.current = interruptionsCount;
    sessionStartTimeRef.current = sessionStartTime;
  }, [isRunning, secondsRemaining, sessionDurationMinutes, sessionNotes, interruptionsCount, sessionStartTime]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await apiFetch<{ sessions?: FocusSessionRow[] }>('/api/focus');
      // GET /api/focus returns the most recent sessions of all time; the heading
      // is "Today's Completed Sessions", so older days are filtered out here.
      const today = todayISO();
      const todaySessions = (data.sessions ?? []).filter(s => {
        const created = s.created_at || s.started_at || '';
        return created.slice(0, 10) === today;
      });
      setCompletedSessions(todaySessions.map(s => ({
        id: s.id,
        title: s.notes || s.task_title || 'Deep Work Session',
        duration: s.actual_duration || s.planned_duration,
        interruptions: s.interruptions_count || 0,
        timestamp: s.created_at ? new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
      })));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const saveSessionToDb = useCallback(async (
    plannedDuration: number,
    actualDuration: number,
    notes: string,
    interruptions: number,
    startedAt?: string
  ) => {
    try {
      await apiSend('/api/focus', 'POST', {
        plannedDuration,
        actualDuration,
        notes: notes || 'Focus Session',
        interruptions,
        startedAt: startedAt || new Date(Date.now() - actualDuration * 60000).toISOString(),
        endedAt: new Date().toISOString(),
      });
      await loadSessions();
    } catch (err) {
      setError(errorText(err));
    }
  }, [loadSessions]);

  // 1. Session Persistence: Restore timer state from localStorage on initial mount
  useEffect(() => {
    void (async () => {
      await loadSessions();

      let state: StoredTimerState | null = null;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) state = JSON.parse(stored) as StoredTimerState;
      } catch {
        state = null;
      }
      if (!state || typeof state.sessionDurationMinutes !== 'number') return;

      const durationMinutes = state.sessionDurationMinutes;
      setSessionDurationMinutes(durationMinutes);
      setSessionNotes(state.sessionNotes || '');
      setInterruptionsCount(state.interruptionsCount || 0);
      setSessionStartTime(state.startedAt || null);

      if (state.isRunning && state.lastUpdated) {
        const elapsed = Math.floor((Date.now() - state.lastUpdated) / 1000);
        const remaining = Math.max(0, (state.secondsRemaining || 0) - elapsed);

        if (remaining === 0) {
          // Session completed while away
          await saveSessionToDb(
            durationMinutes,
            durationMinutes,
            state.sessionNotes || 'Focus Session',
            state.interruptionsCount || 0,
            state.startedAt || undefined
          );
          setSecondsRemaining(durationMinutes * 60);
          setIsRunning(false);
          localStorage.removeItem(STORAGE_KEY);
        } else {
          setSecondsRemaining(remaining);
          setIsRunning(true);
        }
      } else {
        setSecondsRemaining(state.secondsRemaining ?? durationMinutes * 60);
        setIsRunning(false);
      }
    })();
  }, [loadSessions, saveSessionToDb]);

  // 2. Persist state changes to localStorage
  useEffect(() => {
    try {
      if (secondsRemaining < sessionDurationMinutes * 60 || isRunning) {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            sessionDurationMinutes,
            secondsRemaining,
            isRunning,
            lastUpdated: Date.now(),
            sessionNotes,
            interruptionsCount,
            startedAt: sessionStartTime,
          })
        );
      }
    } catch {
      /* private browsing: timer state is a convenience, never a correctness path */
    }
  }, [sessionDurationMinutes, secondsRemaining, isRunning, sessionNotes, interruptionsCount, sessionStartTime]);

  // 3. Save session on interruption beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isRunningRef.current) {
        const elapsedSec = (sessionDurationMinutesRef.current * 60) - secondsRemainingRef.current;
        const actualMins = Math.floor(elapsedSec / 60);
        if (actualMins >= 1) {
          const payload = JSON.stringify({
            plannedDuration: sessionDurationMinutesRef.current,
            actualDuration: actualMins,
            notes: sessionNotesRef.current
              ? `${sessionNotesRef.current} (Interrupted)`
              : 'Focus Session (Interrupted)',
            interruptions: interruptionsCountRef.current + 1,
            startedAt: sessionStartTimeRef.current || new Date(Date.now() - actualMins * 60000).toISOString(),
            endedAt: new Date().toISOString(),
          });
          try {
            if (navigator.sendBeacon) {
              const blob = new Blob([payload], { type: 'application/json' });
              navigator.sendBeacon('/api/focus', blob);
            } else {
              fetch('/api/focus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true,
              });
            }
          } catch {
            /* page is unloading: nothing left to surface the failure to */
          }
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // 4. Timer interval tick
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setSecondsRemaining(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  // 5. Completion: persist the finished session once the countdown reaches zero
  useEffect(() => {
    if (!isRunning || secondsRemaining !== 0) return;
    void (async () => {
      setIsRunning(false);
      await saveSessionToDb(
        sessionDurationMinutes,
        sessionDurationMinutes,
        sessionNotes,
        interruptionsCount,
        sessionStartTime || undefined
      );
      setSessionNotes('');
      setSessionStartTime(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* private browsing */
      }
    })();
  }, [isRunning, secondsRemaining, sessionDurationMinutes, sessionNotes, interruptionsCount, sessionStartTime, saveSessionToDb]);

  const setDuration = async (mins: number) => {
    // If >= 1 minute has elapsed (running OR paused), record the partial session
    // so the time isn't silently discarded when the preset changes.
    const elapsedSec = (sessionDurationMinutes * 60) - secondsRemaining;
    const elapsedMins = Math.floor(elapsedSec / 60);
    if (elapsedMins >= 1) {
      await saveSessionToDb(
        sessionDurationMinutes,
        elapsedMins,
        sessionNotes ? `${sessionNotes} (Interrupted)` : 'Focus Session (Interrupted)',
        interruptionsCount,
        sessionStartTime || undefined
      );
    }

    setIsRunning(false);
    setSessionDurationMinutes(mins);
    setSecondsRemaining(mins * 60);
    setSessionStartTime(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* private browsing */
    }
  };

  const handleToggleRunning = () => {
    const nextRunning = !isRunning;
    // Persist the transition immediately. The generic effect below runs on the
    // render after this state change, but a reload triggered in the same tick
    // (or a fast pause-then-reload) could otherwise replay the previous snapshot
    // and restore `isRunning: true` — the timer would appear to keep running.
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          sessionDurationMinutes,
          secondsRemaining,
          isRunning: nextRunning,
          lastUpdated: Date.now(),
          sessionNotes,
          interruptionsCount,
          startedAt: nextRunning ? (sessionStartTime ?? new Date().toISOString()) : sessionStartTime,
        })
      );
    } catch {
      /* private browsing: timer state is a convenience, never a correctness path */
    }

    if (nextRunning) {
      if (!sessionStartTime) setSessionStartTime(new Date().toISOString());
      setIsRunning(true);
      return;
    }
    setIsRunning(false);
  };

  const handleResetTimer = async () => {
    const elapsedSec = (sessionDurationMinutes * 60) - secondsRemaining;
    const elapsedMins = Math.floor(elapsedSec / 60);

    if (elapsedMins >= 1) {
      await saveSessionToDb(
        sessionDurationMinutes,
        elapsedMins,
        sessionNotes ? `${sessionNotes} (Interrupted)` : 'Focus Session (Interrupted)',
        interruptionsCount,
        sessionStartTime || undefined
      );
    }

    setIsRunning(false);
    setSecondsRemaining(sessionDurationMinutes * 60);
    setSessionStartTime(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* private browsing */
    }
  };

  const formatDisplay = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="w-full px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-400" />
          <span>Focus Session</span>
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Protect uninterrupted deep work, record session distractions, and measure actual effort.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* Main Timer Display */}
      <div className="p-8 bg-zinc-950/60 border border-white/[0.06] rounded-xl flex flex-col items-center justify-center space-y-6 text-center">
        {/* Preset Duration Buttons */}
        <div className="flex items-center gap-1.5 bg-zinc-900/60 p-1 rounded-md border border-white/[0.06] text-xs font-medium">
          <button
            onClick={() => setDuration(15)}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              sessionDurationMinutes === 15 ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            15m Sprint
          </button>
          <button
            onClick={() => setDuration(25)}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              sessionDurationMinutes === 25 ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            25m Pomodoro
          </button>
          <button
            onClick={() => setDuration(50)}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              sessionDurationMinutes === 50 ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            50m Deep Block
          </button>
        </div>

        {/* Big Prominent Countdown with live progress and pulse indicator */}
        <div className="flex flex-col items-center justify-center py-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              {isRunning ? 'Deep Work Block Active' : secondsRemaining < sessionDurationMinutes * 60 ? 'Session Paused' : 'Timer Ready'}
            </span>
          </div>

          <div className="font-mono text-8xl font-light text-zinc-100 tracking-tighter select-none py-1 drop-shadow-md">
            {formatDisplay(secondsRemaining)}
          </div>

          {/* Prominent Session Progress Bar */}
          <div className="w-full max-w-sm bg-zinc-900 h-2 rounded-full overflow-hidden border border-white/[0.04]">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.max(0, (((sessionDurationMinutes * 60) - secondsRemaining) / (sessionDurationMinutes * 60)) * 100))}%`,
              }}
            />
          </div>
        </div>

        {/* Input for target task/note */}
        <input
          type="text"
          aria-label="What is your singular focus during this block?"
          value={sessionNotes}
          onChange={e => setSessionNotes(e.target.value)}
          placeholder="What is your singular focus during this block?"
          className="w-full max-w-md bg-zinc-900/60 border border-white/[0.08] rounded-md px-4 py-2 text-xs text-center text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition-colors"
        />

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleRunning}
            className={`px-6 py-2 rounded-md font-medium text-xs flex items-center gap-2 transition-all active:scale-[0.98] ${
              isRunning
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08]'
                : 'bg-zinc-100 hover:bg-white text-zinc-950 shadow-sm'
            }`}
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isRunning ? 'Pause Timer' : 'Start Focus Block'}</span>
          </button>

          <button
            onClick={handleResetTimer}
            className="p-2 rounded-md bg-zinc-900/60 hover:bg-zinc-800 border border-white/[0.06] text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Reset Timer"
            aria-label="Reset Timer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setInterruptionsCount(prev => prev + 1)}
            className="px-3 py-2 rounded-md bg-zinc-900/60 hover:bg-zinc-800 border border-white/[0.06] text-zinc-400 hover:text-zinc-200 text-xs font-mono flex items-center gap-1.5 transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-zinc-400" />
            <span>Interruptions: {interruptionsCount}</span>
          </button>
        </div>
      </div>

      {/* Completed Focus Sessions History */}
      <div className="bg-zinc-950/60 border border-white/[0.06] rounded-lg p-4 space-y-3">
        <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">Today&apos;s Completed Sessions</h2>
        <div className="divide-y divide-white/[0.04]">
          {isLoadingSessions ? (
            <p className="py-4 text-xs text-zinc-500 text-center font-mono">Loading sessions...</p>
          ) : completedSessions.length === 0 ? (
            <p className="py-4 text-xs text-zinc-500 text-center font-mono">No sessions logged yet today.</p>
          ) : (
            completedSessions.map(session => (
              <div key={session.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" />
                  <div>
                    <p className="font-medium text-zinc-200">{session.title}</p>
                    <p className="text-[11px] text-zinc-500 font-mono">{session.timestamp}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-zinc-400 font-mono text-xs">
                  <span>{session.duration} mins</span>
                  {session.interruptions > 0 && (
                    <span className="text-[11px] text-zinc-500">
                      ({session.interruptions} interruptions)
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  Clock,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
} from 'lucide-react';

export default function FocusTimerPage() {
  const { activeSpaceId } = useWorkspace();
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(25);
  const [secondsRemaining, setSecondsRemaining] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [interruptionsCount, setInterruptionsCount] = useState(0);
  const [sessionNotes, setSessionNotes] = useState('');
  const [completedSessions, setCompletedSessions] = useState<any[]>([
    {
      id: 'fs_1',
      title: 'Distributed Architecture Specification Review',
      duration: 25,
      interruptions: 0,
      timestamp: 'Today, 10:30 AM',
    },
    {
      id: 'fs_2',
      title: 'Ledger Balancing & Double-Entry Invariants',
      duration: 45,
      interruptions: 1,
      timestamp: 'Today, 02:15 PM',
    },
  ]);

  useEffect(() => {
    let timer: any = null;
    if (isRunning && secondsRemaining > 0) {
      timer = setInterval(() => {
        setSecondsRemaining(prev => prev - 1);
      }, 1000);
    } else if (secondsRemaining === 0 && isRunning) {
      setIsRunning(false);
      // Auto complete session
      setCompletedSessions(prev => [
        {
          id: `fs_${Date.now()}`,
          title: sessionNotes || 'Focus Session',
          duration: sessionDurationMinutes,
          interruptions: interruptionsCount,
          timestamp: 'Just now',
        },
        ...prev,
      ]);
    }
    return () => clearInterval(intervalCleanup(timer));
  }, [isRunning, secondsRemaining]);

  const intervalCleanup = (t: any) => t;

  const setDuration = (mins: number) => {
    setIsRunning(false);
    setSessionDurationMinutes(mins);
    setSecondsRemaining(mins * 60);
  };

  const formatDisplay = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="w-full px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-400" />
          <span>Focus Timer & Work Session</span>
        </h1>
        <p className="text-xs text-zinc-400">
          Protect uninterrupted deep work, record session distractions, and measure actual effort.
        </p>
      </div>

      {/* Main Timer Display */}
      <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col items-center justify-center space-y-6 text-center shadow-lg">
        {/* Preset Duration Buttons */}
        <div className="flex items-center gap-2 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs font-medium">
          <button
            onClick={() => setDuration(15)}
            className={`px-3 py-1 rounded-md transition-colors ${
              sessionDurationMinutes === 15 ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            15m Sprint
          </button>
          <button
            onClick={() => setDuration(25)}
            className={`px-3 py-1 rounded-md transition-colors ${
              sessionDurationMinutes === 25 ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            25m Pomodoro
          </button>
          <button
            onClick={() => setDuration(50)}
            className={`px-3 py-1 rounded-md transition-colors ${
              sessionDurationMinutes === 50 ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            50m Deep Block
          </button>
        </div>

        {/* Big Countdown */}
        <div className="font-mono text-7xl font-extrabold text-zinc-100 tracking-tight select-none">
          {formatDisplay(secondsRemaining)}
        </div>

        {/* Input for target task/note */}
        <input
          type="text"
          value={sessionNotes}
          onChange={e => setSessionNotes(e.target.value)}
          placeholder="What are you focusing on during this block?"
          className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-center text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
        />

        {/* Action Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-md transition-all active:scale-95 ${
              isRunning
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
            }`}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isRunning ? 'Pause Timer' : 'Start Focus Block'}</span>
          </button>

          <button
            onClick={() => setDuration(sessionDurationMinutes)}
            className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            title="Reset Timer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setInterruptionsCount(prev => prev + 1)}
            className="px-3 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Interruption ({interruptionsCount})</span>
          </button>
        </div>
      </div>

      {/* Completed Focus Sessions History */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-zinc-200">Today's Completed Focus History</h2>
        <div className="divide-y divide-zinc-800/60">
          {completedSessions.map(session => (
            <div key={session.id} className="py-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <div>
                  <p className="font-medium text-zinc-200">{session.title}</p>
                  <p className="text-[11px] text-zinc-500">{session.timestamp}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-zinc-400 font-mono">
                <span>{session.duration} mins</span>
                {session.interruptions > 0 && (
                  <span className="text-[10px] text-amber-400">
                    ({session.interruptions} interruptions)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  CalendarCheck,
  CheckCircle2,
  Circle,
  Clock,
  Sparkles,
  ArrowRight,
  Flame,
  Plus,
  Play,
  RotateCcw,
} from 'lucide-react';

export default function TodayPage() {
  const { setIsAiDrawerOpen, activeSpaceId } = useWorkspace();
  const [tasks, setTasks] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [habits, setHabits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Focus Timer state
  const [timerSeconds, setTimerSeconds] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerSessionName, setTimerSessionName] = useState('Deep Work Block');
  const [formattedDate, setFormattedDate] = useState('Today');

  const loadTodayData = () => {
    setIsLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const spaceQuery = activeSpaceId !== 'all' ? `&spaceId=${activeSpaceId}` : '';
    Promise.all([
      fetch(`/api/tasks?dueDate=${today}${spaceQuery}`).then(r => r.json()),
      fetch(`/api/calendar?startDate=${today}&endDate=${today}`).then(r => r.json()),
      fetch(`/api/habits`).then(r => r.json()),
    ])
      .then(([tasksData, eventsData, habitsData]) => {
        setTasks(tasksData.tasks || []);
        setEvents(eventsData.events || []);
        setHabits(habitsData.habits || []);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    setFormattedDate(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));
    loadTodayData();
  }, [activeSpaceId]);

  // Pomodoro countdown effect
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds(prev => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0) {
      setIsTimerRunning(false);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerSeconds]);

  const toggleTask = async (taskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'completed' ? 'in_progress' : 'completed';
    await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, status: nextStatus }),
    });
    setTasks(prev =>
      prev.map(t => (t.id === taskId ? { ...t, status: nextStatus } : t))
    );
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="w-full px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-indigo-400" />
            <h1 className="text-xl font-bold text-zinc-100">Today's Focus & Daily Plan</h1>
          </div>
          <p className="text-xs text-zinc-400">
            {formattedDate}
          </p>
        </div>

        <button
          onClick={() => setIsAiDrawerOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Generate AI Daily Plan</span>
        </button>
      </div>

      {/* Focus Timer Strip */}
      <div className="p-5 bg-gradient-to-r from-zinc-900 to-indigo-950/40 border border-zinc-800 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Active Focus Session</span>
            <input
              type="text"
              value={timerSessionName}
              onChange={e => setTimerSessionName(e.target.value)}
              className="block font-bold text-sm text-zinc-100 bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="font-mono text-3xl font-extrabold text-zinc-100 tracking-tight">
            {formatTime(timerSeconds)}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all ${
                isTimerRunning
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isTimerRunning ? 'Pause' : 'Start Focus'}</span>
            </button>
            <button
              onClick={() => {
                setIsTimerRunning(false);
                setTimerSeconds(25 * 60);
              }}
              className="p-2 text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
              title="Reset Timer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Scheduled Time Blocks & Prioritized Tasks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Time Blocks */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-sm font-semibold text-zinc-200">Scheduled Time Blocks</h2>
            <Link href="/productivity/calendar" className="text-xs text-indigo-400 hover:text-indigo-300">
              Calendar View →
            </Link>
          </div>

          <div className="space-y-2.5">
            {events.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
                No time blocks scheduled for today yet. Use the AI Assistant to generate proposed blocks based on your workload.
              </div>
            ) : (
              events.map(ev => (
                <div key={ev.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-8 rounded-full bg-indigo-500" />
                    <div>
                      <p className="text-xs font-medium text-zinc-200">{ev.title}</p>
                      <p className="text-[11px] text-zinc-500">
                        {new Date(ev.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                        {new Date(ev.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase">
                    {ev.event_type}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Prioritized Task List for Today */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-sm font-semibold text-zinc-200">Prioritized Next Actions</h2>
            <Link href="/productivity/tasks" className="text-xs text-indigo-400 hover:text-indigo-300">
              Task Hub →
            </Link>
          </div>

          <div className="space-y-2 divide-y divide-zinc-800/40">
            {tasks.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
                All due actions completed for today!
              </div>
            ) : (
              tasks.map(t => {
                const isDone = t.status === 'completed';
                return (
                  <div key={t.id} className="pt-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleTask(t.id, t.status)}
                        className="text-zinc-500 hover:text-indigo-400"
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Circle className="w-4 h-4 text-zinc-600" />
                        )}
                      </button>
                      <div>
                        <p className={`text-xs font-medium ${isDone ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
                          {t.title}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {t.estimated_duration ? `${t.estimated_duration} mins • ` : ''}
                          Priority: {t.priority}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

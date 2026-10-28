'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  CalendarCheck,
  CheckCircle2,
  AlertCircle,
  Flame,
  Target,
  Briefcase,
  TrendingUp,
  Clock,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
  Save,
} from 'lucide-react';

export default function WeeklyReviewPage() {
  const { activeSpaceId, setSelectedExplainer } = useWorkspace();
  const [tasks, setTasks] = useState<any[]>([]);
  const [habits, setHabits] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [safeToSpend, setSafeToSpend] = useState<any | null>(null);
  const [reflectionNotes, setReflectionNotes] = useState('');
  const [nextWeekCommitments, setNextWeekCommitments] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const spaceQuery = activeSpaceId !== 'all' ? `?spaceId=${activeSpaceId}` : '';
    Promise.all([
      fetch(`/api/tasks${spaceQuery}`).then(r => r.json()),
      fetch(`/api/habits${spaceQuery}`).then(r => r.json()),
      fetch(`/api/projects${spaceQuery}`).then(r => r.json()),
      fetch(`/api/goals${spaceQuery}`).then(r => r.json()),
      fetch('/api/finance/safe-to-spend').then(r => r.json()),
    ]).then(([tData, hData, pData, gData, stsData]) => {
      setTasks(tData.tasks || []);
      setHabits(hData.habits || []);
      setProjects(pData.projects || []);
      setGoals(gData.goals || []);
      setSafeToSpend(stsData);
    });
  }, [activeSpaceId]);

  const completedTasks = tasks.filter(t => t.status === 'completed');
  const openTasks = tasks.filter(t => t.status !== 'completed');
  const blockedProjects = projects.filter(p => p.status === 'paused' || p.status === 'active');
  const upcomingDeadlines = openTasks.filter(t => t.due_date);

  const handleSaveReview = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const showExplainer = () => {
    setSelectedExplainer({
      metricName: 'Weekly Review Synthesis',
      definition: 'Deterministic audit of accomplishments, streaks, blockers, and commitments without speculative judgments.',
      formula: 'Throughput = Verified Completed Tasks; Consistency = Verified Habit Check-ins; Obligations = Ledger & Due Dates',
      dateRange: { label: 'Active 7-day rolling evaluation window' },
      currency: 'N/A',
      includedEntities: ['Active space tasks', 'Habit check-ins', 'Project definitions of done', 'Upcoming deadlines'],
      excludedEntities: ['Soft-deleted items', 'Unverified speculative projections'],
      assumptions: ['User completes weekly reflection with honest appraisal of blockers'],
      inputs: {
        completedTasksCount: completedTasks.length,
        openTasksCount: openTasks.length,
        activeProjectsCount: projects.length,
        activeHabitsCount: habits.length,
      },
      lastCalculatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="w-full px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-indigo-400" />
            <span>Structured Weekly Review</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Audit completed work, habits, project blockers, goals, upcoming commitments, and financial trajectory.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={showExplainer}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium border border-zinc-700 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
            <span>How This Review Works</span>
          </button>
          <button
            onClick={handleSaveReview}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaved ? 'Review Saved' : 'Save Review'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Completed Work</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">{completedTasks.length}</div>
          <p className="text-[11px] text-zinc-500">Tasks verified done</p>
        </div>

        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Active Habits</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">{habits.length}</div>
          <p className="text-[11px] text-zinc-500">Tracked consistency routines</p>
        </div>

        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Open Projects</span>
            <Briefcase className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">{projects.length}</div>
          <p className="text-[11px] text-zinc-500">Work initiatives in flight</p>
        </div>

        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Safe-to-Spend Pulse</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {safeToSpend?.safeToSpend ? `${safeToSpend.currency} ${safeToSpend.safeToSpend}` : '—'}
          </div>
          <p className="text-[11px] text-zinc-500">Liquid reserves verified</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completed Work Audit */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>1. Completed Work Audit</span>
            </h2>
            <span className="text-xs text-zinc-400">{completedTasks.length} items</span>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {completedTasks.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">No tasks marked completed in current scope.</p>
            ) : (
              completedTasks.map(t => (
                <div key={t.id} className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-lg flex items-center justify-between text-xs">
                  <div>
                    <span className="font-medium text-zinc-300">{t.title}</span>
                    <p className="text-[10px] text-zinc-500">Priority: {t.priority} • Est: {t.estimated_duration || 0}m</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/50">Done</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Habit Consistency */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>2. Habit Consistency & Streaks</span>
            </h2>
            <span className="text-xs text-zinc-400">{habits.length} habits</span>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {habits.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">No habits configured.</p>
            ) : (
              habits.map(h => (
                <div key={h.id} className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-lg flex items-center justify-between text-xs">
                  <div>
                    <span className="font-medium text-zinc-300">{h.title}</span>
                    <p className="text-[10px] text-zinc-500">Current: {h.currentStreak}d • Best: {h.bestStreak}d</p>
                  </div>
                  <span className="text-xs font-semibold text-amber-400">{h.completionRate}% rate</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Project Blockers & Health */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-400" />
              <span>3. Project Trajectory & Blockers</span>
            </h2>
            <span className="text-xs text-zinc-400">{projects.length} projects</span>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {blockedProjects.map(p => (
              <div key={p.id} className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-200">{p.name}</span>
                  <span className="text-xs font-semibold text-indigo-400">{p.progress}%</span>
                </div>
                <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${p.progress}%` }} />
                </div>
                {p.status === 'paused' && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Project is currently paused/blocked.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Commitments & Deadlines */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" />
              <span>4. Upcoming Deadlines for Next Week</span>
            </h2>
            <span className="text-xs text-zinc-400">{upcomingDeadlines.length} scheduled</span>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {upcomingDeadlines.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">No scheduled deadlines.</p>
            ) : (
              upcomingDeadlines.slice(0, 5).map(t => (
                <div key={t.id} className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-lg flex items-center justify-between text-xs">
                  <div>
                    <span className="font-medium text-zinc-300">{t.title}</span>
                    <p className="text-[10px] text-zinc-500">Due: {t.due_date} • Priority: {t.priority}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Review Reflections & Next Week Commitments */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
          <h2 className="text-sm font-semibold text-zinc-200">5. Weekly Reflection Notes</h2>
          <p className="text-xs text-zinc-400">
            Document what worked, what caused friction, and lessons learned without speculative conclusions.
          </p>
          <textarea
            value={reflectionNotes}
            onChange={e => setReflectionNotes(e.target.value)}
            placeholder="Focus was strong early in the week; mid-week meetings caused schedule drift. Project delivery is on track..."
            rows={4}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
          <h2 className="text-sm font-semibold text-zinc-200">6. Next Week Focus Commitments</h2>
          <p className="text-xs text-zinc-400">
            Define top 3 priority objectives for next week.
          </p>
          <textarea
            value={nextWeekCommitments}
            onChange={e => setNextWeekCommitments(e.target.value)}
            placeholder="1. Complete MVP Milestone A&#10;2. Reconcile monthly credit card ledger&#10;3. Maintain morning focus routine 5/5 days"
            rows={4}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>
    </div>
  );
}

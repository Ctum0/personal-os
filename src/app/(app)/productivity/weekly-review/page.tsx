'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { todayISO, addDaysISO } from "@/lib/time";
import { apiFetch, apiSend, errorText } from "@/lib/api/client";
import { useTodayISO } from "@/lib/time/useTodayISO";
import {
  CalendarCheck,
  CheckCircle2,
  AlertCircle,
  Flame,
  Briefcase,
  Clock,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
  Save,
  Check,
  History,
} from 'lucide-react';

interface StoredWeeklyReview {
  id: string;
  week_start: string;
  week_end: string | null;
  summary: string | null;
  payload?: {
    completedCount?: number;
    openCount?: number;
    habitsCount?: number;
    reflectionNotes?: string;
    nextWeekCommitments?: string;
  };
  created_at: string;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  completion_at: string | null;
}

interface HabitRow {
  id: string;
  title: string;
  streak: number;
  currentStreak?: number;
}

interface ProjectRow {
  id: string;
  name: string;
  status: string;
}

interface SafeToSpendSummary {
  safeToSpendAmount: string | number | null;
}

interface HistoricalWeeklyReview {
  id: string;
  date: string;
  completedCount: number;
  openCount: number;
  habitsCount: number;
  reflectionNotes: string;
  nextWeekCommitments: string;
  savedAt: string;
}

export default function WeeklyReviewPage() {
  const { activeSpaceId, setSelectedExplainer } = useWorkspace();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [safeToSpend, setSafeToSpend] = useState<SafeToSpendSummary | null>(null);
  const [reflectionNotes, setReflectionNotes] = useState('');
  const [nextWeekCommitments, setNextWeekCommitments] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pastReviews, setPastReviews] = useState<HistoricalWeeklyReview[]>([]);
  const [error, setError] = useState<string | null>(null);

  /**
   * Weekly reviews live in the `weekly_reviews` table (migration v4 made it the
   * authoritative store). Reading and writing `users.preferences.weeklyReviews`
   * instead left that table permanently empty and put review text in an
   * unbounded JSON blob.
   */
  const loadData = useCallback(async () => {
    const spaceQuery = activeSpaceId !== 'all' ? `?spaceId=${encodeURIComponent(activeSpaceId)}` : '';
    setError(null);
    try {
      const [tData, hData, pData, stsData, reviewsData] = await Promise.all([
        apiFetch<{ tasks?: TaskRow[] }>(`/api/tasks${spaceQuery}`),
        apiFetch<{ habits?: HabitRow[] }>(`/api/habits${spaceQuery}`),
        apiFetch<{ projects?: ProjectRow[] }>(`/api/projects${spaceQuery}`),
        apiFetch<{ safeToSpend?: SafeToSpendSummary }>('/api/finance/safe-to-spend'),
        apiFetch<{ reviews?: StoredWeeklyReview[] }>('/api/weekly-review?limit=12'),
      ]);
      setTasks(tData.tasks ?? []);
      setHabits(hData.habits ?? []);
      setProjects(pData.projects ?? []);
      setSafeToSpend(stsData.safeToSpend ?? null);

      const mapped: HistoricalWeeklyReview[] = (reviewsData.reviews ?? []).map(review => {
        const payload = review.payload ?? {};
        return {
          id: review.id,
          date: review.week_end ?? review.week_start,
          completedCount: Number(payload.completedCount ?? 0),
          openCount: Number(payload.openCount ?? 0),
          habitsCount: Number(payload.habitsCount ?? 0),
          reflectionNotes: String(payload.reflectionNotes ?? review.summary ?? ''),
          nextWeekCommitments: String(payload.nextWeekCommitments ?? ''),
          savedAt: review.created_at ?? new Date().toISOString(),
        };
      });
      setPastReviews(mapped);
      if (mapped.length > 0) {
        setReflectionNotes(previous => previous || mapped[0].reflectionNotes);
        setNextWeekCommitments(previous => previous || mapped[0].nextWeekCommitments);
      }
    } catch (err) {
      setError(errorText(err));
    }
  }, [activeSpaceId]);

  useEffect(() => {
    void (async () => {
      await loadData();
    })();
  }, [loadData]);

  // 7-day rolling review window (matches the explainer's "Active 7-day rolling evaluation window")
  const currentDate = useTodayISO();
  const windowStart = currentDate ? addDaysISO(currentDate, -7) : '';

  const completedTasks = tasks.filter(
    t =>
      t.status === 'completed' &&
      (!windowStart ||
        (t.completion_at !== null && t.completion_at.slice(0, 10) >= windowStart) ||
        (t.due_date !== null && t.due_date >= windowStart))
  );
  const openTasks = tasks.filter(t => t.status !== 'completed');
  const upcomingDeadlines = useMemo(() => {
    // [defer] today's read must not happen inside render (prerender-safe)
    if (!currentDate) return [];
    const in7Days = addDaysISO(currentDate, 7);
    return openTasks
      .filter((t): t is TaskRow & { due_date: string } =>
        t.due_date !== null && t.due_date >= currentDate && t.due_date <= in7Days
      )
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [openTasks, currentDate]);

  const handleSaveReview = async () => {
    setIsSaving(true);
    setError(null);
    const today = todayISO();
    const weekStart = addDaysISO(today, -6);
    try {
      await apiSend('/api/weekly-review', 'POST', {
        weekStart,
        weekEnd: today,
        summary: reflectionNotes.trim() || null,
        payload: {
          completedCount: completedTasks.length,
          openCount: openTasks.length,
          habitsCount: habits.length,
          reflectionNotes: reflectionNotes.trim(),
          nextWeekCommitments: nextWeekCommitments.trim(),
        },
      });
      setIsSaved(true);
      window.setTimeout(() => setIsSaved(false), 3500);
      await loadData();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setIsSaving(false);
    }
  };

  const showExplainer = () => {
    setSelectedExplainer({
      metricName: 'Weekly Review Synthesis',
      definition: 'Deterministic audit of accomplishments, streaks, blockers, and commitments without speculative judgments.',
      formula: 'Throughput = Verified Completed Tasks; Consistency = Verified Habit Check-ins; Obligations = Ledger & Due Dates',
      dateRange: { label: 'Active 7-day rolling evaluation window' },
      currency: 'N/A',
      includedEntities: ['Active space tasks', 'Habit check-ins', 'Project definitions of done', 'Upcoming deadlines'],
      excludedEntities: ['Soft-deleted items', 'Unverified speculative projections', 'Quarantined test fixtures'],
      assumptions: ['User completes weekly reflection with honest appraisal of blockers'],
      inputs: {
        completedTasksCount: String(completedTasks.length),
        openTasksCount: String(openTasks.length),
        activeProjectsCount: String(projects.length),
        activeHabitsCount: String(habits.length),
      },
      lastCalculatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-400">
            <span className="text-emerald-400">●</span>
            <span>Productivity OS</span>
            <span className="text-zinc-600">/</span>
            <span>Operational Synthesis</span>
          </div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight mt-1 flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-zinc-300" />
            <span>Structured Weekly Review</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Audit completed work, habits, project blockers, goals, upcoming commitments, and financial trajectory.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={showExplainer}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-md text-xs font-medium border border-white/[0.08] transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
            <span>How This Review Works</span>
          </button>
          <button
            onClick={handleSaveReview}
            disabled={isSaving}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors shadow-xs ${
              isSaved
                ? 'bg-emerald-600 text-zinc-950'
                : 'bg-zinc-100 hover:bg-white text-zinc-950'
            }`}
          >
            {isSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5 text-zinc-900" />}
            <span>{isSaving ? 'Saving...' : isSaved ? 'Review Preserved' : 'Save & Archive Review'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200">
          {error}
        </div>
      )}

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
            <span>Safe-to-Spend Liquidity</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {safeToSpend?.safeToSpendAmount ? `$${parseFloat(String(safeToSpend.safeToSpendAmount)).toLocaleString()}` : '$0'}
          </div>
          <p className="text-[11px] text-zinc-500">Available cash buffer</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Completed Deliverables */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>1. Verified Completed Tasks ({completedTasks.length})</span>
            </h2>
            <span className="text-[11px] font-mono text-zinc-500">last 7 days window</span>
          </div>
          <div tabIndex={0} role="region" aria-label="Completed tasks in this review window" className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {completedTasks.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">No tasks completed yet in this review cycle.</p>
            ) : (
              completedTasks.slice(0, 10).map(t => (
                <div key={t.id} className="p-2.5 bg-zinc-950/60 border border-zinc-800/80 rounded-lg flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-medium">{t.title}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {t.completion_at ? `Done ${t.completion_at.slice(0, 10)}` : 'Done'}
                  </span>
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
              <span>2. Habit Consistency Check</span>
            </h2>
          </div>
          <div tabIndex={0} role="region" aria-label="Habit consistency in this review window" className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {habits.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">No active habits logged.</p>
            ) : (
              habits.map(h => (
                <div key={h.id} className="p-2.5 bg-zinc-950/60 border border-zinc-800/80 rounded-lg flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-medium">{h.title}</span>
                  <span className="text-xs font-mono text-amber-400 flex items-center gap-1">
                    <Flame className="w-3 h-3 fill-amber-400" />
                    {(h.streak ?? h.currentStreak ?? 0)}d streak
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Project Blockers */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-400" />
              <span>3. Project Momentum & Blocker Scan</span>
            </h2>
          </div>
          <div tabIndex={0} role="region" aria-label="Project momentum in this review window" className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {projects.map(p => (
              <div key={p.id} className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-lg space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-200">{p.name}</span>
                  <span className="text-[10px] font-mono uppercase text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-900">
                    {p.status}
                  </span>
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
          <div tabIndex={0} role="region" aria-label="Upcoming deadlines for next week" className="space-y-2 max-h-60 overflow-y-auto pr-1">
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
          <label htmlFor="reflection-notes" className="sr-only">
            Weekly reflection notes
          </label>
          <textarea
            id="reflection-notes"
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
          <label htmlFor="next-week-commitments" className="sr-only">
            Next week focus commitments
          </label>
          <textarea
            id="next-week-commitments"
            value={nextWeekCommitments}
            onChange={e => setNextWeekCommitments(e.target.value)}
            placeholder="1. Complete MVP Milestone A&#10;2. Reconcile monthly credit card ledger&#10;3. Maintain morning focus routine 5/5 days"
            rows={4}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Historical Weekly Review Archive */}
      {pastReviews.length > 0 && (
        <div className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-200">Historical Review Archive ({pastReviews.length})</h2>
          </div>
          <div tabIndex={0} role="region" aria-label="Archived weekly reviews" className="divide-y divide-white/[0.04] max-h-72 overflow-y-auto">
            {pastReviews.map(rev => (
              <div key={rev.id} className="py-3 text-xs space-y-1">
                <div className="flex items-center justify-between text-zinc-400 font-mono">
                  <span className="font-semibold text-zinc-200">Week of {rev.date}</span>
                  <span>{rev.completedCount} completed • {rev.habitsCount} habits</span>
                </div>
                {rev.reflectionNotes && (
                  <p className="text-zinc-300 text-xs italic">&ldquo;{rev.reflectionNotes}&rdquo;</p>
                )}
                {rev.nextWeekCommitments && (
                  <p className="text-zinc-400 text-[11px]">Next: {rev.nextWeekCommitments}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

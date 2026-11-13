'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { guardOffline } from '@/lib/offline/queue';
import {
  CheckSquare,
  Plus,
  Search,
  Columns3,
  List,
  CheckCircle2,
  Circle,
  Clock,
  Calendar,
  Trash2,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiFetch, apiSend, errorText } from '@/lib/api/client';

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  project_id: string | null;
  project_name?: string | null;
  project_color?: string | null;
  estimated_duration: number;
  created_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
  color: string;
}

type CategoryTab = 'all' | 'scheduled' | 'backlog' | 'completed';

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'text-rose-300 border-rose-500/30',
  critical: 'text-rose-300 border-rose-500/30',
  high: 'text-amber-300 border-amber-500/30',
  normal: 'text-zinc-300 border-zinc-700',
  low: 'text-zinc-400 border-zinc-700',
  optional: 'text-zinc-500 border-zinc-800',
};

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  optional: 4,
};

export default function TasksPage() {
  const { activeSpaceId, setIsQuickAddOpen } = useWorkspace();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const [inlineTitle, setInlineTitle] = useState('');
  const [inlinePriority, setInlinePriority] = useState('normal');
  const [inlineDueDate, setInlineDueDate] = useState('');
  const [inlineProjectId, setInlineProjectId] = useState('');
  const [creating, setCreating] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const spaceQuery = activeSpaceId !== 'all' ? `?spaceId=${encodeURIComponent(activeSpaceId)}` : '';
      const data = await apiFetch<{ projects: ProjectRow[] }>(`/api/projects${spaceQuery}`);
      setProjects(data.projects ?? []);
    } catch {
      // A failed project list degrades filtering, not the task list.
      setProjects([]);
    }
  }, [activeSpaceId]);

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (activeSpaceId !== 'all') params.set('spaceId', activeSpaceId);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      const data = await apiFetch<{ tasks: TaskRow[] }>(`/api/tasks?${params.toString()}`);
      // The API already excludes quarantined records (status-based policy);
      // re-filtering client side would hide nothing new and drift from it.
      setTasks(data.tasks ?? []);
    } catch (err) {
      setError(errorText(err));
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeSpaceId, priorityFilter, search]);

  useEffect(() => {
    void (async () => {
      await loadProjects();
    })();
  }, [loadProjects]);

  useEffect(() => {
    void (async () => {
      await loadTasks();
    })();
  }, [loadTasks]);

  const toggleTaskStatus = async (taskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'completed' ? 'in_progress' : 'completed';
    const previous = tasks;
    setTasks(current => current.map(task => (task.id === taskId ? { ...task, status: nextStatus } : task)));
    try {
      const { queuedOffline } = await guardOffline('complete_task', { id: taskId, status: nextStatus });
      if (queuedOffline) {
        setStatusBanner('Offline — status change queued locally');
        window.setTimeout(() => setStatusBanner(null), 3000);
        return;
      }
      await loadTasks();
    } catch (err) {
      setTasks(previous);
      setError(errorText(err));
    }
  };

  const handleInlineAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inlineTitle.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      await apiSend('/api/tasks', 'POST', {
        title: inlineTitle.trim(),
        status: inlineDueDate ? 'next' : 'inbox',
        priority: inlinePriority,
        dueDate: inlineDueDate || undefined,
        projectId: inlineProjectId || undefined,
        spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
      });
      setInlineTitle('');
      setInlineDueDate('');
      setInlineProjectId('');
      await loadTasks();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setCreating(false);
    }
  };

  const deleteTask = async (taskId: string, title: string) => {
    if (!window.confirm(`Archive "${title}"?`)) return;
    try {
      await apiSend(`/api/tasks?id=${encodeURIComponent(taskId)}`, 'DELETE');
      setTasks(current => current.filter(task => task.id !== taskId));
    } catch (err) {
      setError(errorText(err));
    }
  };

  const filteredTasks = useMemo(() => {
    const matchesTab = (task: TaskRow): boolean => {
      if (projectFilter !== 'all' && task.project_id !== projectFilter) return false;
      switch (categoryTab) {
        case 'scheduled':
          return Boolean(task.due_date) && task.status !== 'completed';
        case 'backlog':
          return !task.due_date && task.status !== 'completed';
        case 'completed':
          return task.status === 'completed';
        default:
          return task.status !== 'completed';
      }
    };
    return tasks
      .filter(matchesTab)
      .sort((a, b) => {
        const rank = (PRIORITY_RANK[a.priority] ?? 5) - (PRIORITY_RANK[b.priority] ?? 5);
        if (rank !== 0) return rank;
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return 0;
      });
  }, [tasks, categoryTab, projectFilter]);

  const counts = useMemo(
    () => ({
      all: tasks.filter(task => task.status !== 'completed').length,
      scheduled: tasks.filter(task => Boolean(task.due_date) && task.status !== 'completed').length,
      backlog: tasks.filter(task => !task.due_date && task.status !== 'completed').length,
      completed: tasks.filter(task => task.status === 'completed').length,
    }),
    [tasks]
  );

  const formatDue = (value: string | null): string | null => {
    if (!value) return null;
    const parsed = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-zinc-400" />
            <span>Tasks &amp; Commitments</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Clear separation between active backlog, scheduled commitments, and completed deliverables.
          </p>
        </div>
        <Button size="sm" onClick={() => setIsQuickAddOpen(true)}>
          <Plus className="w-3.5 h-3.5" />
          New Task
        </Button>
      </div>

      {statusBanner && (
        <div role="status" className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
          {statusBanner}
        </div>
      )}
      {error && (
        <div role="alert" className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] pb-2 text-xs font-medium">
        {(
          [
            ['all', 'All Tasks', counts.all],
            ['scheduled', 'Scheduled', counts.scheduled],
            ['backlog', 'Backlog', counts.backlog],
            ['completed', 'Completed', counts.completed],
          ] as const
        ).map(([tab, label, count]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setCategoryTab(tab)}
            aria-pressed={categoryTab === tab}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              categoryTab === tab
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            {label} <span className="text-zinc-400 tabular-nums">({count})</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            aria-label="Switch to list view"
            aria-pressed={viewMode === 'list'}
            className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('kanban')}
            aria-label="Switch to kanban board view"
            aria-pressed={viewMode === 'kanban'}
            className={`p-1.5 rounded-md ${viewMode === 'kanban' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Columns3 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search tasks..."
            aria-label="Search tasks"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <label htmlFor="priority-filter" className="sr-only">
          Filter by priority
        </label>
        <select
          id="priority-filter"
          value={priorityFilter}
          onChange={event => setPriorityFilter(event.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
        >
          <option value="all">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        <label htmlFor="project-filter" className="sr-only">
          Filter by project
        </label>
        <select
          id="project-filter"
          value={projectFilter}
          onChange={event => setProjectFilter(event.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
        >
          <option value="all">All Projects</option>
          {projects.map(project => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={handleInlineAdd} className="flex flex-wrap items-center gap-2">
        <label htmlFor="quick-capture-task" className="sr-only">
          Quick capture task
        </label>
        <input
          id="quick-capture-task"
          value={inlineTitle}
          onChange={event => setInlineTitle(event.target.value)}
          placeholder="+ Quick capture task (press Enter to save)..."
          className="flex-1 min-w-[220px] bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
        <label htmlFor="quick-capture-due" className="sr-only">
          Due date
        </label>
        <input
          id="quick-capture-due"
          type="date"
          value={inlineDueDate}
          onChange={event => setInlineDueDate(event.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
        />
        <label htmlFor="quick-capture-priority" className="sr-only">
          Priority
        </label>
        <select
          id="quick-capture-priority"
          value={inlinePriority}
          onChange={event => setInlinePriority(event.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <Button size="sm" type="submit" loading={creating} disabled={!inlineTitle.trim()}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </form>

      {isLoading ? (
        <p className="text-xs text-zinc-500" role="status">
          Loading tasks…
        </p>
      ) : filteredTasks.length === 0 ? (
        <div className="p-10 text-center border border-dashed border-zinc-800 rounded-xl">
          <Filter className="w-5 h-5 text-zinc-600 mx-auto mb-2" />
          <p className="text-xs text-zinc-400">
            {search ? `No tasks match "${search}".` : 'Nothing here yet — capture a task above to get started.'}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        <ul className="divide-y divide-white/[0.06] border border-zinc-800 rounded-xl overflow-hidden">
          {filteredTasks.map(task => {
            const done = task.status === 'completed';
            return (
              <li key={task.id} className="group flex items-center gap-3 px-3 py-2.5 bg-zinc-900/40 hover:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => void toggleTaskStatus(task.id, task.status)}
                  aria-label={`Toggle task ${task.title}`}
                  aria-pressed={done}
                  className={`shrink-0 ${done ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs truncate ${done ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
                    {task.due_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" />
                        {formatDue(task.due_date)}
                      </span>
                    )}
                    {task.project_name && <span className="truncate">{task.project_name}</span>}
                    {task.estimated_duration > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {task.estimated_duration}m
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border capitalize ${
                    PRIORITY_STYLES[task.priority] ?? 'text-zinc-400 border-zinc-800'
                  }`}
                >
                  {task.priority}
                </span>
                <button
                  type="button"
                  onClick={() => void deleteTask(task.id, task.title)}
                  className="shrink-0 p-2 -m-2 text-zinc-500 hover:text-rose-400 transition-colors"
                  aria-label={`Archive task ${task.title}`}
                  title="Archive task"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(
            [
              ['inbox', 'Inbox'],
              ['next', 'Scheduled'],
              ['completed', 'Completed'],
            ] as const
          ).map(([column, label]) => {
            const columnTasks = filteredTasks.filter(task =>
              column === 'completed'
                ? task.status === 'completed'
                : column === 'inbox'
                  ? task.status !== 'completed' && !task.due_date
                  : task.status !== 'completed' && Boolean(task.due_date)
            );
            return (
              <section key={column} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-3 space-y-2">
                <h2 className="text-[11px] uppercase tracking-wider text-zinc-400">
                  {label} <span className="text-zinc-600 tabular-nums">({columnTasks.length})</span>
                </h2>
                {columnTasks.length === 0 ? (
                  <p className="text-[11px] text-zinc-600">Empty</p>
                ) : (
                  columnTasks.map(task => (
                    <div key={task.id} className="p-2 bg-zinc-950 border border-zinc-800 rounded-lg">
                      <p className="text-xs text-zinc-200 truncate">{task.title}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5 capitalize">{task.priority}</p>
                    </div>
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

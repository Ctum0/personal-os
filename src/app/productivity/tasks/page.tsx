'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
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
  Folder,
  Tag,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function TasksPage() {
  const { activeSpaceId, setIsQuickAddOpen } = useWorkspace();
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [categoryTab, setCategoryTab] = useState<'all' | 'scheduled' | 'backlog' | 'completed'>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Quick inline task creation input
  const [inlineTitle, setInlineTitle] = useState('');
  const [inlinePriority, setInlinePriority] = useState('normal');
  const [inlineDueDate, setInlineDueDate] = useState('');
  const [inlineProjectId, setInlineProjectId] = useState('');

  const loadProjects = () => {
    const spaceQuery = activeSpaceId !== 'all' ? `?spaceId=${activeSpaceId}` : '';
    fetch(`/api/projects${spaceQuery}`)
      .then(r => r.json())
      .then(d => setProjects(d.projects || []))
      .catch(() => {});
  };

  const loadTasks = () => {
    setIsLoading(true);
    let url = `/api/tasks?search=${encodeURIComponent(search)}`;
    if (activeSpaceId !== 'all') url += `&spaceId=${activeSpaceId}`;
    if (priorityFilter !== 'all') url += `&priority=${priorityFilter}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        let list = data.tasks || [];
        // Quarantine filter: strictly exclude quarantined tasks
        list = list.filter((t: any) =>
          t.status !== 'quarantined'
        );
        setTasks(list);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadProjects();
  }, [activeSpaceId]);

  useEffect(() => {
    loadTasks();
  }, [activeSpaceId, priorityFilter, search]);

  const toggleTaskStatus = async (taskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'completed' ? 'in_progress' : 'completed';
    setTasks(prev =>
      prev.map(t => (t.id === taskId ? { ...t, status: nextStatus } : t))
    );
    await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, status: nextStatus }),
    });
  };

  const handleInlineAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineTitle.trim()) return;

    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: inlineTitle.trim(),
        status: inlineDueDate ? 'next' : 'inbox',
        priority: inlinePriority,
        dueDate: inlineDueDate || null,
        projectId: inlineProjectId || null,
        spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
      }),
    });
    if (res.ok) {
      setInlineTitle('');
      setInlineDueDate('');
      loadTasks();
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm('Move this task to archive?')) return;
    await fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' });
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  // Filter tasks by category tab & project
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // Project filter
      if (projectFilter !== 'all' && task.project_id !== projectFilter) {
        return false;
      }

      // Category tab distinction: backlog vs scheduled vs completed
      switch (categoryTab) {
        case 'scheduled':
          return Boolean(task.due_date && task.status !== 'completed');
        case 'backlog':
          return !task.due_date && task.status !== 'completed';
        case 'completed':
          return task.status === 'completed';
        case 'all':
        default:
          return true;
      }
    });
  }, [tasks, categoryTab, projectFilter]);

  const kanbanColumns = [
    { id: 'inbox', label: 'Backlog / Inbox' },
    { id: 'next', label: 'Scheduled / Next' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'completed', label: 'Completed' },
  ];

  return (
    <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-emerald-400" />
            <span>Tasks & Commitments</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Clear separation between active backlog, scheduled commitments, and completed deliverables.
          </p>
        </div>

        {/* View Switcher & Action */}
        <div className="flex items-center gap-2.5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 flex items-center">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="List View"
              aria-label="Switch to list view"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-2 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'kanban' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Kanban Board View"
              aria-label="Switch to kanban board view"
            >
              <Columns3 className="w-4 h-4" />
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsQuickAddOpen(true)}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            New Task
          </Button>
        </div>
      </div>

      {/* Category Tabs: Backlog vs Scheduled vs Completed */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2 text-xs font-medium">
        <button
          onClick={() => setCategoryTab('all')}
          className={`px-3 py-2.5 rounded-lg transition-colors ${
            categoryTab === 'all'
              ? 'bg-zinc-800 text-zinc-100 border border-white/[0.08]'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          All Tasks ({tasks.length})
        </button>
        <button
          onClick={() => setCategoryTab('scheduled')}
          className={`px-3 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 ${
            categoryTab === 'scheduled'
              ? 'bg-zinc-800 text-zinc-100 border border-white/[0.08]'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-blue-400" />
          <span>Scheduled ({tasks.filter(t => t.due_date && t.status !== 'completed').length})</span>
        </button>
        <button
          onClick={() => setCategoryTab('backlog')}
          className={`px-3 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 ${
            categoryTab === 'backlog'
              ? 'bg-zinc-800 text-zinc-100 border border-white/[0.08]'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>Backlog ({tasks.filter(t => !t.due_date && t.status !== 'completed').length})</span>
        </button>
        <button
          onClick={() => setCategoryTab('completed')}
          className={`px-3 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 ${
            categoryTab === 'completed'
              ? 'bg-zinc-800 text-zinc-100 border border-white/[0.08]'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Completed ({tasks.filter(t => t.status === 'completed').length})</span>
        </button>
      </div>

      {/* Quick Capture Bar & Filters */}
      <div className="p-3 bg-zinc-950/60 border border-white/[0.06] rounded-xl space-y-3">
        <form onSubmit={handleInlineAdd} className="flex flex-col sm:flex-row items-center gap-2">
          <input
            type="text"
            value={inlineTitle}
            onChange={e => setInlineTitle(e.target.value)}
            placeholder="+ Quick capture task (press Enter to save)..."
            className="flex-1 w-full px-3.5 py-2 bg-zinc-900/80 border border-white/[0.08] rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition-colors"
          />

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <select
              value={inlinePriority}
              onChange={e => setInlinePriority(e.target.value)}
              aria-label="Set priority for new task"
              className="bg-zinc-900 border border-white/[0.08] rounded-lg px-2.5 py-2 text-xs text-zinc-300 focus:outline-none focus:border-zinc-400"
            >
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>

            <input
              type="date"
              value={inlineDueDate}
              onChange={e => setInlineDueDate(e.target.value)}
              aria-label="Set due date for new task"
              className="bg-zinc-900 border border-white/[0.08] rounded-lg px-2 py-[9px] text-xs text-zinc-300 focus:outline-none focus:border-zinc-400"
            />

            <Button type="submit" size="sm" variant="outline" disabled={!inlineTitle.trim()}>
              Capture
            </Button>
          </div>
        </form>

        {/* Filters Row: Project, Priority & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.04] text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Filter className="w-3.5 h-3.5" />
              <span>Filters:</span>
            </div>

            {/* Project Filter */}
            <select
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
              aria-label="Filter by project"
              className="bg-zinc-900 border border-white/[0.08] rounded-md px-2 py-2 text-xs text-zinc-300 focus:outline-none focus:border-zinc-400"
            >
              <option value="all">All Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              aria-label="Filter by priority"
              className="bg-zinc-900 border border-white/[0.08] rounded-md px-2 py-2 text-xs text-zinc-300 focus:outline-none focus:border-zinc-400"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="pl-8 pr-3 py-2 bg-zinc-900/60 border border-white/[0.08] rounded-md text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 w-44"
            />
          </div>
        </div>
      </div>

      {/* View Content */}
      {viewMode === 'list' ? (
        <div className="rounded-xl border border-white/[0.06] bg-zinc-900/30 overflow-hidden">
          <div className="divide-y divide-white/[0.04]">
            {filteredTasks.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500 font-mono">
                No tasks match your filter criteria.
              </div>
            ) : (
              filteredTasks.map(task => {
                const isDone = task.status === 'completed';
                return (
                  <div
                    key={task.id}
                    className="p-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-4">
                      <button
                        onClick={() => toggleTaskStatus(task.id, task.status)}
                        className="p-2 -m-2 text-zinc-600 hover:text-emerald-400 transition-colors shrink-0"
                        aria-label={`Toggle task ${task.title}`}
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Circle className="w-4 h-4 text-zinc-600 hover:text-zinc-400" />
                        )}
                      </button>

                      <div className="min-w-0 truncate">
                        <p className={`text-xs font-medium truncate ${isDone ? 'line-through text-zinc-500' : 'text-zinc-200 group-hover:text-white'}`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500 truncate">
                          {task.project_name && (
                            <span className="text-zinc-400 font-medium truncate">
                              📁 {task.project_name}
                            </span>
                          )}
                          {task.space_name && (
                            <span className="text-zinc-500">
                              [{task.space_name}]
                            </span>
                          )}
                          {task.due_date ? (
                            <span className="flex items-center gap-1 font-mono text-zinc-400">
                              <Calendar className="w-3 h-3 text-blue-400" />
                              {task.due_date}
                            </span>
                          ) : (
                            <span className="font-mono text-zinc-600">
                              Backlog
                            </span>
                          )}
                          {task.estimated_duration > 0 && (
                            <span className="flex items-center gap-1 font-mono tabular-nums">
                              <Clock className="w-3 h-3 text-zinc-500" />
                              {task.estimated_duration}m
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {!isDone && (
                        <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                          task.priority === 'urgent'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : task.priority === 'high'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-zinc-900 text-zinc-400 border-white/[0.06]'
                        }`}>
                          {task.priority}
                        </span>
                      )}

                      <button
                        onClick={() => deleteTask(task.id)}
                        className="opacity-60 max-sm:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2 -m-2 hover:text-rose-400 text-zinc-500 transition-opacity"
                        title="Archive task"
                        aria-label={`Archive task ${task.title}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Kanban View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {kanbanColumns.map(col => {
            const colTasks = filteredTasks.filter(t => {
              if (col.id === 'inbox') return t.status === 'inbox' || (!t.due_date && t.status !== 'completed');
              if (col.id === 'next') return t.status === 'next' || (t.due_date && t.status !== 'completed');
              return t.status === col.id;
            });

            return (
              <div key={col.id} className="p-3 bg-zinc-950/60 border border-white/[0.06] rounded-xl space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                    {col.label}
                  </span>
                  <span className="text-[11px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.2 rounded">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {colTasks.map(t => (
                    <div
                      key={t.id}
                      className="p-3 bg-zinc-900/60 border border-white/[0.06] rounded-lg text-xs space-y-1.5 hover:border-white/[0.12] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-zinc-200 leading-snug">{t.title}</span>
                        <button
                          onClick={() => toggleTaskStatus(t.id, t.status)}
                          className="shrink-0 p-2 -m-2 text-zinc-600 hover:text-emerald-400"
                          aria-label={t.status === 'completed' ? `Reopen task ${t.title}` : `Mark task ${t.title} as done`}
                        >
                          <Circle className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono">
                        {t.due_date && <span>Due: {t.due_date}</span>}
                        {t.project_name && <span>• {t.project_name}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

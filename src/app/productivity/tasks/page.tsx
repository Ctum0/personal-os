'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  CheckSquare,
  Plus,
  Search,
  Filter,
  Columns3,
  List,
  CheckCircle2,
  Circle,
  Clock,
  Calendar,
  Trash2,
  AlertCircle,
  Tag,
} from 'lucide-react';

export default function TasksPage() {
  const { activeSpaceId, setIsQuickAddOpen } = useWorkspace();
  const [tasks, setTasks] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Quick inline task creation input
  const [inlineTitle, setInlineTitle] = useState('');

  const loadTasks = () => {
    setIsLoading(true);
    let url = `/api/tasks?search=${encodeURIComponent(search)}`;
    if (activeSpaceId !== 'all') url += `&spaceId=${activeSpaceId}`;
    if (statusFilter !== 'all') url += `&status=${statusFilter}`;

    fetch(url)
      .then(res => res.json())
      .then(data => setTasks(data.tasks || []))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadTasks();
  }, [activeSpaceId, statusFilter, search]);

  const toggleTaskStatus = async (taskId: string, currentStatus: string) => {
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

  const handleInlineAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineTitle.trim()) return;

    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: inlineTitle.trim(),
        status: 'next',
        priority: 'normal',
        spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
      }),
    });
    if (res.ok) {
      setInlineTitle('');
      loadTasks();
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm('Move this task to archive?')) return;
    await fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' });
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const kanbanColumns = [
    { id: 'inbox', label: 'Inbox', color: 'border-zinc-700' },
    { id: 'next', label: 'Next Actions', color: 'border-blue-500' },
    { id: 'in_progress', label: 'In Progress', color: 'border-amber-500' },
    { id: 'completed', label: 'Completed', color: 'border-emerald-500' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-indigo-400" />
            <span>Tasks & Actions</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Organize, prioritize, and track tasks across projects and spaces.
          </p>
        </div>

        {/* View Switcher & Action */}
        <div className="flex items-center gap-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 flex items-center">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'kanban' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Kanban Board View"
            >
              <Columns3 className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setIsQuickAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all shadow-indigo-600/20"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Filters & Inline Add */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Quick capture input */}
        <form onSubmit={handleInlineAdd} className="flex-1 max-w-lg flex items-center gap-2">
          <input
            type="text"
            value={inlineTitle}
            onChange={e => setInlineTitle(e.target.value)}
            placeholder="+ Quick add a task press Enter..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
        </form>

        {/* Search & Status Filters */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 w-40 sm:w-48"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="inbox">Inbox</option>
            <option value="next">Next</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* View Content */}
      {viewMode === 'list' ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="divide-y divide-zinc-800/60">
            {tasks.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No tasks match your filter criteria.
              </div>
            ) : (
              tasks.map(task => {
                const isDone = task.status === 'completed';
                return (
                  <div
                    key={task.id}
                    className="p-3.5 flex items-center justify-between hover:bg-zinc-800/40 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleTaskStatus(task.id, task.status)}
                        className="text-zinc-500 hover:text-indigo-400 transition-colors shrink-0"
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Circle className="w-4 h-4 text-zinc-600" />
                        )}
                      </button>

                      <div>
                        <p className={`text-xs font-medium ${isDone ? 'line-through text-zinc-500' : 'text-zinc-200 group-hover:text-white'}`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500">
                          {task.project_name && (
                            <span className="text-indigo-400 font-medium">
                              📁 {task.project_name}
                            </span>
                          )}
                          {task.space_name && (
                            <span className="text-zinc-400">
                              [{task.space_name}]
                            </span>
                          )}
                          {task.due_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-zinc-500" />
                              {task.due_date}
                            </span>
                          )}
                          {task.estimated_duration > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-zinc-500" />
                              {task.estimated_duration}m
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${
                          task.priority === 'urgent'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : task.priority === 'high'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {task.priority}
                      </span>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-zinc-600 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete task"
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
      ) : (
        /* Kanban Board View */
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {kanbanColumns.map(col => {
            const colTasks = tasks.filter(t => t.status === col.id);
            return (
              <div key={col.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex flex-col min-h-[400px]">
                <div className={`flex items-center justify-between pb-2 mb-2 border-b-2 ${col.color}`}>
                  <span className="font-semibold text-xs text-zinc-200">{col.label}</span>
                  <span className="text-[10px] text-zinc-500 px-1.5 py-0.2 rounded bg-zinc-800 font-mono">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-2 flex-1">
                  {colTasks.map(task => (
                    <div
                      key={task.id}
                      className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-2 hover:border-zinc-700 transition-colors shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-zinc-200">{task.title}</p>
                        <button
                          onClick={() => toggleTaskStatus(task.id, task.status)}
                          className="text-zinc-500 hover:text-emerald-400"
                        >
                          {task.status === 'completed' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-zinc-600" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-900">
                        {task.due_date ? <span>{task.due_date}</span> : <span>No date</span>}
                        <span className="font-medium text-zinc-400 uppercase">{task.priority}</span>
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

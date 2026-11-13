'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { apiFetch, apiSend, errorText } from '@/lib/api/client';
import {
  Inbox,
  ArrowRight,
  Trash2,
} from 'lucide-react';

interface InboxTaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
}

export default function InboxPage() {
  const { activeSpaceId } = useWorkspace();
  const [inboxTasks, setInboxTasks] = useState<InboxTaskRow[]>([]);
  const [captureInput, setCaptureInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    setIsLoading(true);
    try {
      const spaceQuery = activeSpaceId !== 'all' ? `&spaceId=${encodeURIComponent(activeSpaceId)}` : '';
      const data = await apiFetch<{ tasks?: InboxTaskRow[] }>(`/api/tasks?status=inbox${spaceQuery}`);
      setInboxTasks(data.tasks ?? []);
      setError(null);
    } catch (err) {
      setError(errorText(err));
      setInboxTasks([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeSpaceId]);

  useEffect(() => {
    void (async () => {
      await loadInbox();
    })();
  }, [loadInbox]);

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captureInput.trim()) return;

    try {
      await apiSend('/api/tasks', 'POST', {
        title: captureInput.trim(),
        status: 'inbox',
        priority: 'normal',
        spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
      });
      setCaptureInput('');
      await loadInbox();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const promoteToNext = async (taskId: string) => {
    try {
      await apiSend('/api/tasks', 'PUT', { id: taskId, status: 'next' });
      setInboxTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      setError(errorText(err));
    }
  };

  const archiveItem = async (taskId: string) => {
    try {
      await apiSend(`/api/tasks?id=${encodeURIComponent(taskId)}`, 'DELETE');
      setInboxTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className="w-full px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <Inbox className="w-5 h-5 text-indigo-400" />
          <span>Inbox & Quick Capture Triage</span>
        </h1>
        <p className="text-xs text-zinc-400">
          Capture raw ideas, thoughts, and requests without friction. Organize and triage when ready.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* Quick Capture Input */}
      <form onSubmit={handleCapture} className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center gap-3 shadow-sm">
        <input
          type="text"
          autoFocus
          aria-label="Capture a new inbox item"
          value={captureInput}
          onChange={e => setCaptureInput(e.target.value)}
          placeholder="Capture an idea, thought, or unorganized to-do and press Enter..."
          className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors shadow-sm"
        >
          Capture
        </button>
      </form>

      {/* Untriaged items */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Untriaged Inbox Items ({inboxTasks.length})
          </span>
          <span className="text-[11px] text-zinc-500">Triage: Move to Next Actions or Project</span>
        </div>

        <div className="divide-y divide-zinc-800/60">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-zinc-500">Loading inbox items...</div>
          ) : inboxTasks.length === 0 ? (
            <div className="p-12 text-center text-xs text-zinc-500">
              Your inbox is clear! All thoughts and ideas have been triaged.
            </div>
          ) : (
            inboxTasks.map(item => (
              <div
                key={item.id}
                className="p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors group"
              >
                <div>
                  <p className="text-xs font-medium text-zinc-200">{item.title}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Captured {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => promoteToNext(item.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-lg text-xs font-medium transition-colors"
                  >
                    <span>Move to Next Actions</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => archiveItem(item.id)}
                    className="p-1.5 text-zinc-600 hover:text-red-400 rounded-lg transition-colors"
                    title="Archive"
                    aria-label={`Archive ${item.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

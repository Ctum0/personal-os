'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../layout/WorkspaceContext';
import { apiFetch, apiSend, errorText } from '@/lib/api/client';
import { CheckCircle2, XCircle, Sparkles, Send, Shield, X, AlertCircle } from 'lucide-react';

interface DraftProposal {
  draftId?: string;
  id?: string;
  actionType?: string;
  action_type?: string;
  reason?: string;
  diffHash?: string;
  proposedPayload?: unknown;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  toolInvoked?: string;
  draftProposal?: DraftProposal;
  timestamp: string;
}

const WELCOME: ChatMessage = {
  id: 'm_welcome',
  sender: 'assistant',
  text: `Hello. I am your Personal OS assistant.
I use permissioned server-side tools and never guess financial numbers.
Ask me:
• "Plan my day" or "Prioritize today"
• "What is my safe to spend?"
• "How are my habit streaks?"
• "Create task: [title]"`,
  timestamp: '',
};

const PROMPT_SUGGESTIONS = [
  { label: 'Plan my day', prompt: 'Plan my day with priorities and calendar blocks' },
  { label: 'Safe to spend', prompt: 'What is my safe to spend?' },
  { label: 'Habit streaks', prompt: 'Show my active habit streaks' },
];

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Assistant drawer.
 *
 * A failed chat request must say so (the previous version swallowed the error
 * into a generic line while the server was returning 500), and an approval
 * decision must only clear the draft card when the server confirmed it.
 */
export function AiAssistantDrawer() {
  const { isAiDrawerOpen, setIsAiDrawerOpen, workspace } = useWorkspace();
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingDrafts, setPendingDrafts] = useState<DraftProposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsAiDrawerOpen(false), [setIsAiDrawerOpen]);

  const loadDrafts = useCallback(async () => {
    try {
      const data = await apiFetch<{ pendingDrafts: DraftProposal[] }>('/api/ai/approvals');
      setPendingDrafts(data.pendingDrafts ?? []);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    if (!isAiDrawerOpen) return;
    void (async () => {
      await loadDrafts();
    })();
  }, [isAiDrawerOpen, loadDrafts]);

  // Escape closes; focus enters the drawer and returns to the trigger after.
  useEffect(() => {
    if (!isAiDrawerOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('input')?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isAiDrawerOpen, close]);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
  }, [messages, isLoading]);

  if (!isAiDrawerOpen) return null;

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const userText = input.trim();
    if (!userText || isLoading) return;

    setInput('');
    setError(null);
    setMessages(previous => [
      ...previous,
      { id: `usr_${Date.now()}`, sender: 'user', text: userText, timestamp: nowLabel() },
    ]);
    setIsLoading(true);

    try {
      const data = await apiSend<{ reply?: string; toolInvoked?: string; draftProposal?: DraftProposal }>(
        '/api/ai/chat',
        'POST',
        { message: userText, contextWorkspace: workspace }
      );
      setMessages(previous => [
        ...previous,
        {
          id: `ai_${Date.now()}`,
          sender: 'assistant',
          text: data.reply || 'Request completed.',
          toolInvoked: data.toolInvoked,
          draftProposal: data.draftProposal,
          timestamp: nowLabel(),
        },
      ]);
      if (data.draftProposal) {
        await loadDrafts();
      }
    } catch (err) {
      const message = errorText(err);
      setError(message);
      setMessages(previous => [
        ...previous,
        {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          text: `I could not complete that request: ${message}`,
          timestamp: nowLabel(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecision = async (draft: DraftProposal, decision: 'approved' | 'rejected') => {
    const draftId = draft.draftId ?? draft.id;
    if (!draftId) return;
    setError(null);
    try {
      const data = await apiSend<{ success?: boolean; message?: string }>('/api/ai/approvals', 'POST', {
        draftId,
        decision,
      });
      setMessages(previous => [
        ...previous,
        {
          id: `dec_${Date.now()}`,
          sender: 'assistant',
          text: data.message || `Proposal ${decision}.`,
          timestamp: nowLabel(),
        },
      ]);
      await loadDrafts();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const draftTitle = (draft: DraftProposal): string => {
    const type = draft.actionType ?? draft.action_type ?? 'action';
    return type.replaceAll('_', ' ');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end"
      onMouseDown={event => {
        if (event.target === event.currentTarget) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Assistant console"
    >
      <div
        ref={panelRef}
        className="w-full max-w-md bg-zinc-950 border-l border-zinc-800 h-full flex flex-col justify-between shadow-2xl"
      >
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-600/20 text-purple-300 flex items-center justify-center" aria-hidden="true">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-zinc-100">Assistant</h2>
              <p className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                <Shield className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                <span>Permissioned policy mode</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-850"
            aria-label="Close assistant console"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div role="alert" className="mx-3 mt-3 p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-[11px] text-rose-200">
            {error}
          </div>
        )}

        {pendingDrafts.length > 0 && (
          <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 space-y-2 max-h-56 overflow-y-auto">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
              <AlertCircle className="w-4 h-4" aria-hidden="true" />
              {pendingDrafts.length} action{pendingDrafts.length > 1 ? 's' : ''} awaiting approval
            </p>
            {pendingDrafts.map(draft => {
              const draftId = draft.draftId ?? draft.id ?? 'draft';
              return (
                <div key={draftId} className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs space-y-2">
                  <p className="font-semibold text-[10px] uppercase tracking-wider text-purple-300">{draftTitle(draft)}</p>
                  {draft.reason && <p className="text-zinc-300 text-[11px]">{draft.reason}</p>}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleDecision(draft, 'rejected')}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/10 rounded transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDecision(draft, 'approved')}
                      className="flex items-center gap-1 px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Approve &amp; Commit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div ref={streamRef} className="flex-1 overflow-y-auto p-4 space-y-4" aria-live="polite">
          {messages.map(message => (
            <div key={message.id} className={`flex flex-col ${message.sender === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs whitespace-pre-wrap leading-relaxed ${
                  message.sender === 'user'
                    ? 'bg-indigo-600 text-white font-medium rounded-br-none'
                    : 'bg-zinc-800 text-zinc-200 rounded-bl-none border border-zinc-700/60'
                }`}
              >
                {message.text}
              </div>
              <div className="flex items-center gap-2 mt-1 px-1">
                {message.toolInvoked && (
                  <span className="text-[9px] font-mono text-purple-300 bg-purple-950/40 px-1 rounded border border-purple-800/40">
                    tool: {message.toolInvoked}
                  </span>
                )}
                {message.timestamp && <span className="text-[10px] text-zinc-500">{message.timestamp}</span>}
              </div>
            </div>
          ))}
          {isLoading && (
            <p className="flex items-center gap-2 text-xs text-zinc-400" role="status">
              <Sparkles className="w-3.5 h-3.5 text-purple-300 animate-spin" aria-hidden="true" />
              Querying verified domain services…
            </p>
          )}
        </div>

        <div className="px-4 py-2 border-t border-zinc-800/60 flex items-center gap-1.5 overflow-x-auto text-[11px]">
          {PROMPT_SUGGESTIONS.map(suggestion => (
            <button
              key={suggestion.label}
              type="button"
              onClick={() => setInput(suggestion.prompt)}
              className="px-2.5 py-1 rounded bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 shrink-0 border border-zinc-800 transition-colors"
            >
              {suggestion.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSend} className="p-3 border-t border-zinc-800 bg-zinc-950/80 flex items-center gap-2">
          <label htmlFor="assistant-input" className="sr-only">
            Message the assistant
          </label>
          <input
            id="assistant-input"
            type="text"
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder="Ask the assistant…"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40 transition-colors"
            aria-label="Send message"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}

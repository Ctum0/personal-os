'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../layout/WorkspaceContext';
import {
  X,
  Sparkles,
  Send,
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Calendar,
  AlertCircle,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  toolInvoked?: string;
  draftProposal?: any;
  timestamp: string;
}

export function AiAssistantDrawer() {
  const { isAiDrawerOpen, setIsAiDrawerOpen, workspace } = useWorkspace();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm_welcome',
      sender: 'assistant',
      text: `Hello Alex. I am your Personal OS Agentic Assistant.
I use permissioned server-side tools and never guess financial numbers.
Ask me:
• "Plan my day" or "Prioritize today"
• "What is my safe to spend?"
• "How are my habit streaks?"
• "Create task: [title]"`,
      timestamp: '12:00 PM',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingDrafts, setPendingDrafts] = useState<any[]>([]);

  // Fetch pending drafts
  useEffect(() => {
    if (isAiDrawerOpen) {
      fetch('/api/ai/approvals')
        .then(res => res.json())
        .then(data => {
          if (data.pendingDrafts) setPendingDrafts(data.pendingDrafts);
        })
        .catch(() => {});
    }
  }, [isAiDrawerOpen]);

  if (!isAiDrawerOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput('');

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, contextWorkspace: workspace }),
      });
      const data = await res.json();

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'assistant',
        text: data.reply || 'Request completed.',
        toolInvoked: data.toolInvoked,
        draftProposal: data.draftProposal,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, aiMsg]);
      if (data.draftProposal) {
        setPendingDrafts(prev => [data.draftProposal, ...prev]);
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          text: 'Encountered an issue communicating with the assistant service.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecision = async (draftId: string, decision: 'approved' | 'rejected') => {
    try {
      const res = await fetch('/api/ai/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, decision }),
      });
      const data = await res.json();

      setPendingDrafts(prev => prev.filter(d => d.draftId !== draftId && d.id !== draftId));

      setMessages(prev => [
        ...prev,
        {
          id: `dec_${Date.now()}`,
          sender: 'assistant',
          text: `Action proposal ${decision}: ${data.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      alert(`Approval error: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 h-full flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-zinc-100">Agentic Assistant</h3>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                <Shield className="w-3 h-3 text-emerald-400" />
                <span>Permissioned Policy Mode</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsAiDrawerOpen(false)}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pending Approvals Banner */}
        {pendingDrafts.length > 0 && (
          <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <AlertCircle className="w-4 h-4" />
              <span>{pendingDrafts.length} Action{pendingDrafts.length > 1 ? 's' : ''} Awaiting Your Approval</span>
            </div>
            {pendingDrafts.map(d => (
              <div key={d.draftId || d.id} className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-200 uppercase text-[10px] tracking-wider text-purple-400">
                    {d.actionType || d.action_type}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">Hash: {d.diffHash?.slice(0, 8)}</span>
                </div>
                <p className="text-zinc-300 text-xs">{d.reason}</p>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => handleDecision(d.draftId || d.id, 'rejected')}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </button>
                  <button
                    onClick={() => handleDecision(d.draftId || d.id, 'approved')}
                    className="flex items-center gap-1 px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium shadow-sm transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approve & Commit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Conversation stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(m => (
            <div
              key={m.id}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs whitespace-pre-wrap leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-indigo-600 text-white font-medium rounded-br-none'
                    : 'bg-zinc-800 text-zinc-200 rounded-bl-none border border-zinc-700/60'
                }`}
              >
                {m.text}
              </div>
              <div className="flex items-center gap-2 mt-1 px-1">
                {m.toolInvoked && (
                  <span className="text-[9px] font-mono text-purple-400 bg-purple-950/40 px-1 rounded border border-purple-800/40">
                    tool: {m.toolInvoked}
                  </span>
                )}
                <span className="text-[10px] text-zinc-500">{m.timestamp}</span>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-spin" />
              <span>Querying verified domain services...</span>
            </div>
          )}
        </div>

        {/* Quick prompt suggestions */}
        <div className="px-4 py-2 border-t border-zinc-800/60 flex items-center gap-1.5 overflow-x-auto text-[11px] text-zinc-400">
          <button
            onClick={() => setInput('Plan my day with priorities and calendar blocks')}
            className="px-2.5 py-1 rounded bg-zinc-800/60 hover:bg-zinc-800 hover:text-zinc-200 shrink-0 border border-zinc-800 transition-colors"
          >
            📅 Plan my day
          </button>
          <button
            onClick={() => setInput('What is my safe to spend?')}
            className="px-2.5 py-1 rounded bg-zinc-800/60 hover:bg-zinc-800 hover:text-zinc-200 shrink-0 border border-zinc-800 transition-colors"
          >
            💰 Safe to spend
          </button>
          <button
            onClick={() => setInput('Show my active habit streaks')}
            className="px-2.5 py-1 rounded bg-zinc-800/60 hover:bg-zinc-800 hover:text-zinc-200 shrink-0 border border-zinc-800 transition-colors"
          >
            🔥 Habit streaks
          </button>
        </div>

        {/* Chat input footer */}
        <form onSubmit={handleSend} className="p-3 border-t border-zinc-800 bg-zinc-950/80 flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask assistant or request planning..."
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40 transition-colors"
            aria-label="Send message"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}

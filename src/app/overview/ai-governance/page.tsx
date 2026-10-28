'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Eye,
  Sliders,
  AlertTriangle,
} from 'lucide-react';

export default function AiGovernancePage() {
  const [tools, setTools] = useState([
    { name: 'get_daily_summary', level: 'read_and_recommend', enabled: true, isConsequential: false, desc: 'Read tasks, schedule, and safe-to-spend pulse' },
    { name: 'list_tasks', level: 'read_and_recommend', enabled: true, isConsequential: false, desc: 'Read open priorities and due dates' },
    { name: 'get_calendar_availability', level: 'read_and_recommend', enabled: true, isConsequential: false, desc: 'Read scheduled calendar slots' },
    { name: 'get_goal_progress', level: 'read_and_recommend', enabled: true, isConsequential: false, desc: 'Inspect goal percentages' },
    { name: 'get_habit_summary', level: 'read_and_recommend', enabled: true, isConsequential: false, desc: 'Inspect streaks and consistency rates' },
    { name: 'get_spending_summary', level: 'read_and_recommend', enabled: true, isConsequential: false, desc: 'Read income vs expenses from ledger' },
    { name: 'get_budget_status', level: 'read_and_recommend', enabled: true, isConsequential: false, desc: 'Read category allocations and remaining funds' },
    { name: 'list_upcoming_obligations', level: 'read_and_recommend', enabled: true, isConsequential: false, desc: 'Read recurring bills due in next 30 days' },
    { name: 'draft_daily_plan', level: 'prepare_and_confirm', enabled: true, isConsequential: true, desc: 'Propose prioritized time blocks (Requires approval)' },
    { name: 'create_task_draft', level: 'prepare_and_confirm', enabled: true, isConsequential: true, desc: 'Propose task creation (Requires approval)' },
    { name: 'propose_budget_changes', level: 'prepare_and_confirm', enabled: true, isConsequential: true, desc: 'Propose envelope reallocation (Requires approval)' },
    { name: 'suggest_transaction_category', level: 'read_and_recommend', enabled: true, isConsequential: false, desc: 'Predict category based on merchant history' },
  ]);

  const toggleTool = (idx: number) => {
    setTools(prev =>
      prev.map((t, i) => (i === idx ? { ...t, enabled: !t.enabled } : t))
    );
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-purple-400" />
          <span>AI Governance & Security Controls</span>
        </h1>
        <p className="text-xs text-zinc-400">
          Enforce strict capability boundaries, permission policies, and audit logs for server-side AI execution.
        </p>
      </div>

      {/* Capability Overview Banner */}
      <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4" />
          <span>Guaranteed Architectural Boundary</span>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed">
          The AI Assistant communicates exclusively through typed server-side tools. It possesses zero direct database access, cannot execute arbitrary code, and cannot modify financial ledger postings without explicit user approval with diff verification.
        </p>
      </div>

      {/* Tools Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Registered AI Tools & Permissions ({tools.length})
          </span>
          <span className="text-[11px] text-zinc-500">Spec Section 10.3 Baseline</span>
        </div>

        <div className="divide-y divide-zinc-800/60">
          {tools.map((tool, idx) => (
            <div key={tool.name} className="p-4 flex items-center justify-between hover:bg-zinc-800/40 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-zinc-200">{tool.name}</span>
                  {tool.isConsequential ? (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-semibold">
                      <Lock className="w-3 h-3" />
                      Consequential (Confirmation Required)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold">
                      <Eye className="w-3 h-3" />
                      Read & Recommend
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400">{tool.desc}</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleTool(idx)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    tool.enabled
                      ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30'
                      : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {tool.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

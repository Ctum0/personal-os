'use client';

import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    fetch('/api/ai/policies')
      .then(r => r.json())
      .then(data => {
        if (data.policies && Array.isArray(data.policies) && data.policies.length > 0) {
          const map = new Map<string, any>(data.policies.map((p: any) => [p.tool_name, p]));
          setTools(prev => prev.map(t => {
            const pol = map.get(t.name);
            if (pol) {
              return {
                ...t,
                level: pol.capability_level || t.level,
                enabled: pol.allow_auto_execution !== undefined ? Boolean(pol.allow_auto_execution || t.enabled) : t.enabled,
              };
            }
            return t;
          }));
        }
      })
      .catch(() => {});
  }, []);

  const toggleTool = async (idx: number) => {
    const target = tools[idx];
    const newEnabled = !target.enabled;
    setTools(prev =>
      prev.map((t, i) => (i === idx ? { ...t, enabled: newEnabled } : t))
    );

    try {
      await fetch('/api/ai/policies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: target.name,
          capabilityLevel: target.level,
          allowAutoExecution: newEnabled,
        }),
      });
    } catch {}
  };

  return (
    <div className="w-full px-8 py-6 space-y-6">
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
      <div className="bg-zinc-950/60 border border-white/[0.06] rounded-lg overflow-hidden">
        <div className="p-3.5 border-b border-white/[0.06] flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Registered AI Tools & Permissions ({tools.length})
          </span>
          <span className="text-[11px] font-mono text-zinc-500">Spec Section 10.3 Baseline</span>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {tools.map((tool, idx) => (
            <div key={tool.name} className="p-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium text-zinc-200">{tool.name}</span>
                  {tool.isConsequential ? (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400/90 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-mono">
                      <Lock className="w-3 h-3" />
                      Consequential (Confirmation Required)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-white/[0.06] font-mono">
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
                  className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                    tool.enabled
                      ? 'bg-zinc-100 text-zinc-950 hover:bg-white'
                      : 'bg-zinc-900 text-zinc-500 border border-white/[0.06] hover:text-zinc-300'
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

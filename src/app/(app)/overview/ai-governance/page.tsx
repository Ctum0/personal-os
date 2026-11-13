'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, Lock, ShieldAlert, ShieldCheck, Sliders } from 'lucide-react';
import { apiFetch, apiSend, errorText } from '@/lib/api/client';

/**
 * AI governance surface.
 *
 * Three behaviours the page must guarantee, because it is the only control plane
 * for what the assistant may do:
 *  1. The table reflects what the database stores (`permission_level`,
 *     `is_enabled`) — the previous version read column names that do not exist,
 *     so saved policies never appeared.
 *  2. A toggle must persist. A failed write reverts the switch and says why.
 *  3. Enabling and disabling are symmetric: `allowAutoExecution` is the enable
 *     flag the API honours.
 */

type PermissionLevel = 'read_and_recommend' | 'prepare_and_confirm' | 'auto_execute';

interface ToolDefinition {
  name: string;
  level: PermissionLevel;
  enabled: boolean;
  isConsequential: boolean;
  desc: string;
}

interface PolicyRow {
  tool_name: string;
  permission_level: PermissionLevel;
  is_enabled: number;
}

const TOOL_CATALOG: ToolDefinition[] = [
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
];

const LEVEL_LABEL: Record<PermissionLevel, string> = {
  read_and_recommend: 'Read & Recommend',
  prepare_and_confirm: 'Prepare & Confirm',
  auto_execute: 'Auto Execute',
};

const LEVEL_BADGE: Record<PermissionLevel, string> = {
  read_and_recommend: 'bg-sky-500/10 text-sky-300 border-sky-500/25',
  prepare_and_confirm: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
  auto_execute: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
};

export default function AiGovernancePage() {
  const [tools, setTools] = useState<ToolDefinition[]>(TOOL_CATALOG);
  const [loading, setLoading] = useState(true);
  // True only after a successful read. Without it a failed GET left the catalog's
  // permissive defaults on screen, asserting that every consequential tool is
  // enabled when the stored policy may disable it.
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const [pendingTool, setPendingTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPolicies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ policies: PolicyRow[] }>('/api/ai/policies');
      const byName = new Map(data.policies.map(policy => [policy.tool_name, policy]));
      setTools(
        TOOL_CATALOG.map(tool => {
          const policy = byName.get(tool.name);
          return policy
            ? { ...tool, level: policy.permission_level, enabled: policy.is_enabled === 1 }
            : tool;
        })
      );
      setPolicyLoaded(true);
    } catch (err) {
      setPolicyLoaded(false);
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadPolicies();
    })();
  }, [loadPolicies]);

  const toggleTool = async (name: string, nextEnabled: boolean) => {
    const previous = tools;
    setTools(current => current.map(tool => (tool.name === name ? { ...tool, enabled: nextEnabled } : tool)));
    setPendingTool(name);
    setError(null);
    try {
      const target = previous.find(tool => tool.name === name);
      if (!target) return;
      await apiSend('/api/ai/policies', 'PUT', {
        toolName: name,
        capabilityLevel: target.level,
        allowAutoExecution: nextEnabled,
      });
      // Re-read rather than trusting the optimistic state: the server decides
      // whether the value it stored matches what the switch now shows.
      await loadPolicies();
    } catch (err) {
      setTools(previous);
      setError(errorText(err));
    } finally {
      setPendingTool(null);
    }
  };

  const summary = useMemo(() => {
    const consequential = tools.filter(tool => tool.isConsequential);
    return {
      total: tools.length,
      enabled: tools.filter(tool => tool.enabled).length,
      consequentialEnabled: consequential.filter(tool => tool.enabled).length,
      consequentialTotal: consequential.length,
    };
  }, [tools]);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-zinc-400" />
          <span>AI Governance &amp; Security Controls</span>
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Every assistant capability is a server-side tool with an explicit permission level. Reads never mutate state;
          consequential tools always produce a draft you approve.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Tools Registered</p>
          <p className="text-2xl font-semibold text-zinc-100 tabular-nums mt-1">{summary.total}</p>
        </div>
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Enabled</p>
          <p className="text-2xl font-semibold text-emerald-300 tabular-nums mt-1">
            {summary.enabled}
            <span className="text-sm text-zinc-500"> / {summary.total}</span>
          </p>
        </div>
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Consequential Enabled</p>
          <p className="text-2xl font-semibold text-amber-300 tabular-nums mt-1">
            {summary.consequentialEnabled}
            <span className="text-sm text-zinc-500"> / {summary.consequentialTotal}</span>
          </p>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2 text-xs text-zinc-400">
          <Sliders className="w-3.5 h-3.5" />
          <span className="font-medium text-zinc-200">Tool Policy Registry</span>
          {loading && <span className="text-zinc-500">• syncing…</span>}
        </div>
        <ul className="divide-y divide-zinc-800/70">
          {loading && (
            <li className="px-4 py-3 text-[11px] text-zinc-400" role="status">
              Loading tool policies…
            </li>
          )}
          {tools.map(tool => (
            <li key={tool.name} className="px-4 py-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-zinc-200">{tool.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${LEVEL_BADGE[tool.level]}`}>
                    {LEVEL_LABEL[tool.level]}
                  </span>
                  {tool.isConsequential && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/25 bg-amber-500/10 text-amber-300 flex items-center gap-1">
                      <ShieldAlert className="w-2.5 h-2.5" />
                      Consequential
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">{tool.desc}</p>
              </div>
              {!policyLoaded ? (
                <span className="shrink-0 text-[10px] font-mono text-amber-300" title="Policy could not be loaded">
                  unknown
                </span>
              ) : (
              <button
                type="button"
                role="switch"
                aria-checked={tool.enabled}
                // A switch keeps a constant name; state lives in aria-checked.
                // Encoding state in the name made the control unaddressable the
                // moment it flipped.
                aria-label={`${tool.name} tool policy`}
                // Until the stored policies arrive every row shows the catalog
                // default, so an early click would write that default back and
                // silently re-enable a disabled tool.
                disabled={loading || !policyLoaded || pendingTool === tool.name}
                onClick={() => void toggleTool(tool.name, !tool.enabled)}
                className={`shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                  tool.enabled ? 'bg-emerald-500/80' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    tool.enabled ? 'translate-x-4.5' : 'translate-x-1'
                  }`}
                />
              </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
          <p className="text-xs font-medium text-zinc-200 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-sky-300" /> Read &amp; Recommend
          </p>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Read-only access to tasks, calendar, goals, habits and the ledger. Never writes.
          </p>
        </div>
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
          <p className="text-xs font-medium text-zinc-200 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-amber-300" /> Prepare &amp; Confirm
          </p>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Produces a draft in the approval queue. Nothing is written until you approve it, and drafts expire after 24 hours.
          </p>
        </div>
      </div>

      <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg flex items-start gap-2 text-[11px] text-zinc-400">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
        <p>
          Disabling a tool removes it from the assistant&apos;s routing immediately — the chat route checks this policy before
          every tool invocation.
        </p>
      </div>
    </div>
  );
}

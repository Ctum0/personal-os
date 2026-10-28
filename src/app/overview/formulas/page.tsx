'use client';

import React, { useState } from 'react';
import {
  Sliders,
  Play,
  CheckCircle2,
  AlertTriangle,
  Code,
  HelpCircle,
} from 'lucide-react';

export default function FormulaStudioPage() {
  const [formula, setFormula] = useState("IF(spent > budget, 'Over Budget', 'On Track')");
  const [variablesJson, setVariablesJson] = useState('{\n  "spent": 450,\n  "budget": 500\n}');
  const [testResult, setTestResult] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleTestFormula = async () => {
    setIsLoading(true);
    setTestResult(null);

    let parsedVars = {};
    try {
      parsedVars = JSON.parse(variablesJson);
    } catch {
      setTestResult({ isValid: false, error: 'Invalid JSON in variables editor' });
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/customization/formula/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formula, variables: parsedVars }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ isValid: false, error: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const sampleFormulas = [
    { label: 'Budget Threshold Warning', expr: "IF(spent > budget, 'Over Budget', 'On Track')" },
    { label: 'Progress Percentage', expr: "ROUND(completed_tasks / total_tasks * 100, 1)" },
    { label: 'Buffer Cushion Check', expr: "liquid_funds - (upcoming_bills + safety_buffer)" },
    { label: 'Priority Escalation', expr: "IF(days_remaining <= 2, 'urgent', 'normal')" },
  ];

  return (
    <div className="w-full px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-amber-400" />
          <span>Constrained Safe Formula Studio</span>
        </h1>
        <p className="text-xs text-zinc-400">
          Define custom metrics and conditional properties evaluated by a secure AST engine without arbitrary code execution risk.
        </p>
      </div>

      {/* Formula Editor */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Formula Expression
          </label>
          <span className="text-[10px] text-zinc-500 font-mono">AST Parser v1.0</span>
        </div>

        <input
          type="text"
          value={formula}
          onChange={e => setFormula(e.target.value)}
          placeholder="e.g. IF(completed / total > 0.8, 'Near Done', 'In Progress')"
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 font-mono text-xs text-amber-300 font-semibold focus:outline-none focus:border-amber-500"
        />

        {/* Sample Templates */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[10px] text-zinc-500 uppercase font-bold">Samples:</span>
          {sampleFormulas.map((s, idx) => (
            <button
              key={idx}
              onClick={() => setFormula(s.expr)}
              className="text-[11px] px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Test Variables Input */}
        <div>
          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">
            Test Context Variables (JSON)
          </label>
          <textarea
            rows={4}
            value={variablesJson}
            onChange={e => setVariablesJson(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Test Action */}
        <div className="flex items-center justify-end pt-2 border-t border-zinc-800">
          <button
            onClick={handleTestFormula}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isLoading ? 'Evaluating AST...' : 'Evaluate Formula'}</span>
          </button>
        </div>

        {/* Evaluation Output */}
        {testResult && (
          <div
            className={`p-4 rounded-xl border text-xs space-y-1 ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400" />
              )}
              <span>{testResult.success ? 'Formula Evaluated Successfully' : 'Syntax / Evaluation Error'}</span>
            </div>

            {testResult.success ? (
              <p className="font-mono text-sm font-bold text-zinc-100 pt-1">
                Output Value: <span className="text-amber-300">{JSON.stringify(testResult.value)}</span>
              </p>
            ) : (
              <p className="text-xs pt-1">{testResult.error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

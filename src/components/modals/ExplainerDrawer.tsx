'use client';

import React, { useRef } from 'react';
import { useWorkspace } from '../layout/WorkspaceContext';
import { X, HelpCircle, CheckCircle, AlertTriangle } from 'lucide-react';

export function ExplainerDrawer() {
  const { selectedExplainer, setSelectedExplainer } = useWorkspace();
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes; focus moves into the panel and returns to the trigger on close.
  React.useEffect(() => {
    if (!selectedExplainer) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedExplainer(null);
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [selectedExplainer, setSelectedExplainer]);

  if (!selectedExplainer) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end"
      onClick={() => setSelectedExplainer(null)}
      role="dialog"
      aria-modal="true"
      aria-label="Calculation transparency explainer"
    >
      <div
        ref={panelRef}
        className="w-full max-w-md bg-zinc-950 border-l border-zinc-800 h-full overflow-y-auto p-6 shadow-2xl flex flex-col justify-between"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                <HelpCircle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-zinc-100">Calculation Transparency</h3>
                <p className="text-[11px] text-zinc-500">Every derived number is deterministic & explainable</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedExplainer(null)}
              className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-850"
              aria-label="Close explainer drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Metric Details */}
          <div className="mt-5 space-y-5">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400">Metric</span>
              <h2 className="text-lg font-bold text-zinc-100 mt-0.5">{selectedExplainer.metricName}</h2>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{selectedExplainer.definition}</p>
            </div>

            {/* Formula Block */}
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <span className="text-[10px] uppercase font-bold text-zinc-500">Mathematical Formula</span>
              <code className="block mt-1 font-mono text-xs text-amber-300 font-semibold break-words">
                {selectedExplainer.formula}
              </code>
            </div>

            {/* Inputs & Variables */}
            {selectedExplainer.inputs && (
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-500">Inputs & Variables</span>
                <div className="mt-2 divide-y divide-zinc-800/60 border border-zinc-800 rounded-lg bg-zinc-950/60 overflow-hidden">
                  {Object.entries(selectedExplainer.inputs).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span className="text-zinc-400 font-mono">{key}</span>
                      <span className="font-semibold text-zinc-200 font-mono">
                        {String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inclusions & Exclusions */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-zinc-950/40 border border-zinc-800/80 rounded-lg">
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold mb-2">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Included</span>
                </div>
                <ul className="space-y-1 text-[11px] text-zinc-400">
                  {selectedExplainer.includedEntities?.map((item: string, i: number) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>

              <div className="p-3 bg-zinc-950/40 border border-zinc-800/80 rounded-lg">
                <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-semibold mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Excluded</span>
                </div>
                <ul className="space-y-1 text-[11px] text-zinc-500">
                  {selectedExplainer.excludedEntities?.map((item: string, i: number) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Assumptions */}
            {selectedExplainer.assumptions && selectedExplainer.assumptions.length > 0 && (
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-500">Model Assumptions</span>
                <ul className="mt-1 space-y-1 text-xs text-zinc-400">
                  {selectedExplainer.assumptions.map((asm: string, i: number) => (
                    <li key={i}>• {asm}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-zinc-800 text-[11px] text-zinc-500 flex items-center justify-between">
          <span>Freshness: {selectedExplainer.lastCalculatedAt ? new Date(selectedExplainer.lastCalculatedAt).toLocaleTimeString() : 'Immediate'}</span>
          <button
            onClick={() => setSelectedExplainer(null)}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-xs font-medium"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

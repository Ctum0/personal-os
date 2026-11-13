'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { apiFetch, apiSend, errorText } from '@/lib/api/client';
import { readableSurface } from '@/lib/ui/contrast';
import {
  Briefcase,
  Plus,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface MilestoneRow {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  is_completed: number;
  sort_order: number;
}

interface ProjectProgressDetails {
  isBlocked: boolean;
  blockersCount: number;
  progressPercentage: number;
}

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  objective: string | null;
  definition_of_done: string | null;
  color: string | null;
  progress_method: string;
  progress: number;
  progressDetails: ProjectProgressDetails | null;
  milestones: MilestoneRow[];
}

export default function ProjectsPage() {
  const { activeSpaceId, setIsQuickAddOpen } = useWorkspace();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const spaceQuery = activeSpaceId !== 'all' ? `?spaceId=${encodeURIComponent(activeSpaceId)}` : '';
      const data = await apiFetch<{ projects?: ProjectRow[] }>(`/api/projects${spaceQuery}`);
      const loaded = data.projects ?? [];
      setProjects(loaded);
      setError(null);
      setExpandedProjectId(current => current ?? loaded[0]?.id ?? null);
    } catch (err) {
      setError(errorText(err));
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeSpaceId]);

  useEffect(() => {
    void (async () => {
      await loadProjects();
    })();
  }, [loadProjects]);

  const toggleMilestone = async (projectId: string, milestoneId: string, currentVal: number) => {
    try {
      await apiSend('/api/projects', 'PUT', {
        id: projectId,
        milestoneId,
        isCompleted: currentVal === 0,
      });
      await loadProjects();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className="w-full px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-blue-400" />
            <span>Projects & Milestones</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Track multi-step objectives, milestone completion, and weighted progress.
          </p>
        </div>

        <button
          onClick={() => setIsQuickAddOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Project</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* Projects List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
            No projects in the selected space. Click &quot;New Project&quot; to create one.
          </div>
        ) : (
          projects.map(proj => {
            const isExpanded = expandedProjectId === proj.id;
            const milestones = proj.milestones ?? [];
            return (
              <div
                key={proj.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm transition-all"
              >
                {/* Project Header Bar */}
                <div
                  onClick={() => setExpandedProjectId(isExpanded ? null : proj.id)}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-zinc-800/40 transition-colors"
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center font-bold shrink-0 text-sm shadow-sm ring-1 ring-black/20"
                      style={(() => {
                        const surface = readableSurface(proj.color || '#3b82f6');
                        return { backgroundColor: surface.background, color: surface.color };
                      })()}
                    >
                      {proj.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-zinc-100">{proj.name}</h2>
                        <span className="text-[10px] px-2 py-0.5 rounded font-semibold uppercase bg-zinc-800 text-zinc-400">
                          {proj.status}
                        </span>
                        {proj.progressDetails?.isBlocked && (
                          <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            Blocked ({proj.progressDetails.blockersCount})
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-1">{proj.description}</p>
                    </div>
                  </div>

                  {/* Progress & Target date */}
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-xs font-semibold text-zinc-300">
                          {proj.progress}%
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          ({proj.progress_method})
                        </span>
                      </div>
                      <div className="w-36 h-2 bg-zinc-800 rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${proj.progress}%` }}
                        />
                      </div>
                    </div>

                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-zinc-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-zinc-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details: Objective, Definition of Done, Milestones */}
                {isExpanded && (
                  <div className="p-5 border-t border-zinc-800 bg-zinc-950/40 space-y-5 animate-in fade-in duration-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                        <span className="text-[10px] uppercase font-bold text-zinc-500">Core Objective</span>
                        <p className="text-xs text-zinc-200 mt-1">{proj.objective || 'Not specified'}</p>
                      </div>
                      <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                        <span className="text-[10px] uppercase font-bold text-zinc-500">Definition of Done</span>
                        <p className="text-xs text-zinc-200 mt-1">{proj.definition_of_done || 'Not specified'}</p>
                      </div>
                    </div>

                    {/* Milestones Checklist */}
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Project Milestones</h3>
                        <span className="text-[11px] text-zinc-500">
                          {milestones.filter(m => m.is_completed).length} of {milestones.length} completed
                        </span>
                      </div>

                      <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg bg-zinc-900 overflow-hidden">
                        {milestones.length === 0 ? (
                          <div className="p-4 text-center text-xs text-zinc-500">No milestones yet.</div>
                        ) : (
                          milestones.map(m => (
                            <div
                              key={m.id}
                              onClick={() => toggleMilestone(proj.id, m.id, m.is_completed)}
                              className="p-3 flex items-center justify-between hover:bg-zinc-800/50 cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                {m.is_completed ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                ) : (
                                  <Circle className="w-4 h-4 text-zinc-600 shrink-0" />
                                )}
                                <span className={`text-xs font-medium ${m.is_completed ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
                                  {m.title}
                                </span>
                              </div>
                              {m.target_date && (
                                <span className="text-[10px] text-zinc-500 font-mono">Due {m.target_date}</span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

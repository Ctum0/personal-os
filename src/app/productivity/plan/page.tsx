'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { todayISO, addDaysISO } from "@/lib/time";
import {
  Sparkles,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Send,
  Plus,
  Trash2,
  Edit2,
  Check,
  ChevronRight,
  RotateCcw,
  Sliders,
  CalendarCheck,
  Lock,
  ListPlus,
  ArrowUpDown,
  CheckSquare,
} from 'lucide-react';
import { ScheduledTimeBlock, DailyPlanProposal, PlanUncertainty, addMinutesToTimeString } from '@/lib/productivity/planner';

export default function PlanMyDayPage() {
  const router = useRouter();
  const [today, setToday] = useState<string>('');
  const [targetDate, setTargetDate] = useState<string>('');
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [conversation, setConversation] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>>([
    {
      role: 'assistant',
      content: "Hello! I am your AI Planning Assistant. Tell me what commitments, appointments, or goals you have upcoming in ordinary language. I'll ask clarifying questions, check your schedule & working hours, detect any overcommitments, and prepare a balanced timeline for your approval.",
      timestamp: 'Just now',
    },
  ]);
  const [currentUncertainties, setCurrentUncertainties] = useState<PlanUncertainty[]>([]);
  const [activeProposal, setActiveProposal] = useState<DailyPlanProposal | null>(null);
  const [commitStatus, setCommitStatus] = useState<'idle' | 'committing' | 'committed' | 'error'>('idle');
  const [commitResult, setCommitResult] = useState<any | null>(null);
  const [planningContext, setPlanningContext] = useState<any | null>(null);

  // State for manual commitment addition
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDuration, setNewItemDuration] = useState(45);
  const [newItemPriority, setNewItemPriority] = useState<'critical' | 'high' | 'normal' | 'optional'>('high');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const tomorrow = today ? addDaysISO(today, 1) : '';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, isProcessing]);

  useEffect(() => {
    const currentToday = todayISO();
    setToday(currentToday);
    setTargetDate(addDaysISO(currentToday, 1));
  }, []);

  // Load existing context and any approved plan for target date
  useEffect(() => {
    if (!targetDate) return;
    fetch(`/api/planning?date=${targetDate}`)
      .then(res => res.json())
      .then(data => {
        if (data.context) setPlanningContext(data.context);
        if (data.approvedPlan) {
          // If a plan already exists, display it
          setActiveProposal({
            targetDate,
            objective: data.approvedPlan.objective || `Plan for ${targetDate}`,
            totalAvailableHours: data.approvedPlan.available_hours || 8,
            estimatedWorkloadHours: data.approvedPlan.estimated_workload_hours || 0,
            isOvercommitted: false,
            overloadHours: 0,
            scheduledItems: (data.approvedPlan.items || []).map((it: any) => ({
              id: it.id,
              title: it.title,
              itemType: it.item_type,
              startTime: it.start_time,
              endTime: it.end_time,
              durationMinutes: it.duration_minutes,
              priority: it.priority,
              isExistingTask: true,
              notes: it.notes,
            })),
            suggestedDeferrals: [],
            identifiedUncertainties: [],
            assumptions: ['Previously committed plan'],
            diffSummary: {
              tasksToCreate: 0,
              calendarBlocksToCreate: 0,
              tasksToReschedule: 0,
            },
          });
        }
      })
      .catch(() => {});
  }, [targetDate]);

  const handleSendMessage = async (
    textToSend?: string,
    answers: Record<string, string> = {},
    customCommitments?: any[]
  ) => {
    const text = textToSend !== undefined ? textToSend : inputMessage;
    if (!text.trim() && Object.keys(answers).length === 0 && !customCommitments) return;

    if (text.trim()) {
      setConversation(prev => [
        ...prev,
        { role: 'user', content: text, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
      ]);
      setInputMessage('');
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/planning/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          targetDate,
          answers,
          existingCommitments: customCommitments || activeProposal?.scheduledItems || [],
        }),
      });

      const data = await res.json();
      if (data.reply) {
        setConversation(prev => [
          ...prev,
          { role: 'assistant', content: data.reply, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
        ]);
      }

      if (data.uncertainties) {
        setCurrentUncertainties(data.uncertainties);
      }

      if (data.proposal) {
        setActiveProposal(data.proposal);
        setCurrentUncertainties([]);
      }
    } catch (err: any) {
      setConversation(prev => [
        ...prev,
        { role: 'assistant', content: `Sorry, I encountered an issue preparing your plan: ${err.message}`, timestamp: 'Just now' },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAnswerUncertainty = (uncertaintyId: string, answerText: string) => {
    let answerPayload: Record<string, string> = {};
    if (uncertaintyId === 'call_time' || uncertaintyId === 'unc_call_time') {
      answerPayload.call_time = answerText;
    } else if (uncertaintyId === 'gym_duration' || uncertaintyId === 'unc_gym_travel') {
      answerPayload.gym_duration = answerText;
    } else if (uncertaintyId === 'assignment_deadline' || uncertaintyId === 'unc_assignment_deadline') {
      answerPayload.assignment_deadline = answerText;
    }

    handleSendMessage(`Clarification: For ${uncertaintyId}, I choose "${answerText}"`, answerPayload);
  };

  const adjustItemDuration = (id: string, deltaMinutes: number) => {
    if (!activeProposal) return;
    const updated = activeProposal.scheduledItems.map(item => {
      if (item.id === id) {
        const newDur = Math.max(15, item.durationMinutes + deltaMinutes);
        return {
          ...item,
          durationMinutes: newDur,
          endTime: addMinutesToTimeString(item.startTime, newDur),
        };
      }
      return item;
    });
    const newWorkload = parseFloat((updated.reduce((sum, i) => sum + i.durationMinutes, 0) / 60).toFixed(1));
    setActiveProposal({
      ...activeProposal,
      scheduledItems: updated,
      scheduleTimeline: updated,
      estimatedWorkloadHours: newWorkload,
    });
  };

  const updateItemPriority = (id: string, priority: 'critical' | 'high' | 'normal' | 'optional') => {
    if (!activeProposal) return;
    const updated = activeProposal.scheduledItems.map(item => item.id === id ? { ...item, priority } : item);
    setActiveProposal({
      ...activeProposal,
      scheduledItems: updated,
      scheduleTimeline: updated,
    });
  };

  const handleManualAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemTitle.trim()) return;

    const baseItems = activeProposal?.scheduledItems || [];
    const lastItem = baseItems[baseItems.length - 1];
    const startTime = lastItem ? addMinutesToTimeString(lastItem.endTime, 15) : '09:00';
    const endTime = addMinutesToTimeString(startTime, newItemDuration);

    const newItem: ScheduledTimeBlock = {
      id: `custom_${Date.now()}`,
      title: newItemTitle.trim(),
      itemType: 'scheduled_task',
      startTime,
      endTime,
      durationMinutes: newItemDuration,
      priority: newItemPriority,
      isExistingTask: false,
    };

    const newItems = [...baseItems, newItem];
    const newWorkload = parseFloat((newItems.reduce((sum, i) => sum + i.durationMinutes, 0) / 60).toFixed(1));

    setActiveProposal({
      targetDate,
      objective: activeProposal?.objective || `Execution Plan for ${targetDate}`,
      totalAvailableHours: activeProposal?.totalAvailableHours || 6.5,
      estimatedWorkloadHours: newWorkload,
      isOvercommitted: newWorkload > (activeProposal?.totalAvailableHours || 6.5),
      overloadHours: Math.max(0, parseFloat((newWorkload - (activeProposal?.totalAvailableHours || 6.5)).toFixed(1))),
      scheduledItems: newItems,
      scheduleTimeline: newItems,
      suggestedDeferrals: activeProposal?.suggestedDeferrals || [],
      identifiedUncertainties: [],
      assumptions: activeProposal?.assumptions || ['User customized schedule'],
      diffSummary: {
        tasksToCreate: (activeProposal?.diffSummary?.tasksToCreate || 0) + 1,
        calendarBlocksToCreate: (activeProposal?.diffSummary?.calendarBlocksToCreate || 0) + 1,
        tasksToReschedule: activeProposal?.diffSummary?.tasksToReschedule || 0,
      },
    });

    setNewItemTitle('');
    setIsAddingItem(false);
  };

  const handleReorganizeTimeline = () => {
    if (!activeProposal) return;
    handleSendMessage('Reorganize timeline to optimize breaks and flow', {}, activeProposal.scheduledItems);
  };

  const handleAutoDraftFromOpenTasks = () => {
    if (!planningContext) return;
    const openTasks = (planningContext.incompleteTasks || []).slice(0, 5).map((t: any) => ({
      id: `task_${t.id}`,
      title: t.title,
      itemType: 'scheduled_task' as const,
      isFixed: false,
      durationMinutes: t.duration || 45,
      priority: t.priority || 'high',
    }));
    handleSendMessage(`Auto-draft day schedule for ${targetDate} using my top priority tasks`, {}, openTasks);
  };

  const handleAddTaskToDraft = (task: any) => {
    const newCommitment = {
      id: `task_${task.id}`,
      title: task.title,
      itemType: 'scheduled_task' as const,
      isFixed: false,
      durationMinutes: task.duration || 45,
      priority: task.priority || 'high',
    };
    const current = activeProposal?.scheduledItems || [];
    handleSendMessage(`Schedule task: "${task.title}"`, {}, [...current, newCommitment]);
  };

  const handleCommitPlan = async () => {
    if (!activeProposal) return;
    setCommitStatus('committing');
    try {
      const res = await fetch('/api/planning/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: activeProposal }),
      });
      const data = await res.json();
      if (data.success) {
        setCommitStatus('committed');
        setCommitResult(data);
      } else {
        setCommitStatus('error');
      }
    } catch {
      setCommitStatus('error');
    }
  };

  const removeItemFromProposal = (id: string) => {
    if (!activeProposal) return;
    const filtered = activeProposal.scheduledItems.filter(i => i.id !== id);
    const newWorkload = (filtered.reduce((sum, i) => sum + i.durationMinutes, 0) / 60).toFixed(1);
    setActiveProposal({
      ...activeProposal,
      scheduledItems: filtered,
      estimatedWorkloadHours: parseFloat(newWorkload),
    });
  };

  const samplePrompt = "I need to finish my university assignment tomorrow. I have work from 9 AM to 5 PM. I also want to study cybersecurity for an hour, go to the gym, buy groceries and spend some time on my personal project. I have a call in the evening.";

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-[1720px] mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-400">
            <span className="text-emerald-400">●</span>
            <span>Productivity OS</span>
            <span className="text-zinc-600">/</span>
            <span>AI-First Planning</span>
          </div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight mt-1 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-zinc-300" />
            <span>Conversational Day Planner</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Describe upcoming commitments in natural language. The AI conducts a clarification interview, resolves conflicts, and drafts a realistic timeline.
          </p>
        </div>

        {/* Planning Horizon Date Selector */}
        <div className="flex items-center gap-2 bg-zinc-950 border border-white/[0.08] rounded-md p-1 text-xs">
          <button
            onClick={() => setTargetDate(today)}
            className={`px-3 py-1 rounded transition-colors ${
              targetDate === today ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setTargetDate(tomorrow)}
            className={`px-3 py-1 rounded transition-colors ${
              targetDate === tomorrow ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Tomorrow
          </button>
          <div className="flex items-center gap-1.5 pl-2 border-l border-white/[0.08]">
            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
            <input
              type="date"
              aria-label="Target Plan Date"
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none font-mono"
            />
          </div>
        </div>
      </div>

      {/* Main Grid: Left Chat & Input / Right Editable Timeline & Diff */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Conversational Interview & Context (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Context Overview Bar */}
          {planningContext && (
            <div className="p-3.5 bg-zinc-950/60 border border-white/[0.06] rounded-lg text-xs space-y-2">
              <div className="flex items-center justify-between text-zinc-400 font-mono text-[11px]">
                <span>Configured Work: {planningContext.operatingRules.workStart} - {planningContext.operatingRules.workEnd}</span>
                <span>Max Focus: {planningContext.operatingRules.maxDailyWorkloadHours}h</span>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-zinc-400">
                <span>Existing Events: <strong className="text-zinc-200 font-mono">{planningContext.existingEvents.length}</strong></span>
                <span>Incomplete Tasks: <strong className="text-zinc-200 font-mono">{planningContext.incompleteTasks.length}</strong></span>
                {planningContext.missedTasks.length > 0 && (
                  <span className="text-amber-400">Missed Overdue: <strong className="font-mono">{planningContext.missedTasks.length}</strong></span>
                )}
              </div>
            </div>
          )}

          {/* Sample Starter Chips */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Fast Templates</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => handleSendMessage(samplePrompt)}
                className="text-[11px] px-2.5 py-1 bg-zinc-950 hover:bg-zinc-900 text-zinc-300 rounded border border-white/[0.06] transition-colors text-left"
              >
                "Work 9-5, assignment, cybersecurity, gym, groceries & call"
              </button>
              <button
                onClick={() => handleSendMessage("Let's plan tomorrow. I have client meetings at 10 AM and 2 PM, need 2 hours for design review, and want to clear my inbox.")}
                className="text-[11px] px-2.5 py-1 bg-zinc-950 hover:bg-zinc-900 text-zinc-300 rounded border border-white/[0.06] transition-colors text-left"
              >
                "Client meetings & design review"
              </button>
            </div>
          </div>

          {/* Chat Stream Box with independent scrolling and pinned composer */}
          <div className="bg-zinc-950/60 border border-white/[0.06] rounded-xl flex flex-col h-[600px] xl:h-[680px] sticky top-4 shadow-sm overflow-hidden">
            {/* Scrollable messages container */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 pr-2">
              {conversation.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[90%] px-3.5 py-2.5 rounded-lg text-xs leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-zinc-800 text-zinc-100 border border-white/[0.08]'
                        : 'bg-zinc-900/80 text-zinc-200 border border-white/[0.06]'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 mt-1 px-1">
                    {msg.role === 'user' ? 'You' : 'AI Assistant'} • {msg.timestamp}
                  </span>
                </div>
              ))}

              {/* Clarification Chips If Uncertainties Exist */}
              {currentUncertainties.length > 0 && (
                <div className="p-3 bg-zinc-900/60 border border-amber-500/20 rounded-lg space-y-2 mt-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Quick Clarification Options:</span>
                  </div>
                  {currentUncertainties.map(unc => (
                    <div key={unc.id} className="space-y-1">
                      <p className="text-[11px] text-zinc-300">{unc.question}</p>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {unc.suggestedAnswers?.map((ans, aIdx) => (
                          <button
                            key={aIdx}
                            onClick={() => handleAnswerUncertainty(unc.id, ans)}
                            className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[10px] font-mono border border-white/[0.06] transition-colors"
                          >
                            {ans}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isProcessing && (
                <div className="flex items-center gap-2 text-xs text-zinc-400 p-2 font-mono">
                  <span className="animate-spin text-zinc-300">⚙</span>
                  <span>Reasoning over availability and building schedule...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Form (Pinned to bottom, never pushed off screen) */}
            <form
              onSubmit={e => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="shrink-0 p-3 bg-zinc-900/80 border-t border-white/[0.06] flex items-center gap-2"
            >
              <input
                type="text"
                aria-label="Describe commitments or response"
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
                placeholder="Describe your commitments or answer questions..."
                disabled={isProcessing}
                className="flex-1 bg-zinc-950 border border-white/[0.08] rounded-md px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition-colors"
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={isProcessing || !inputMessage.trim()}
                className="p-2 bg-zinc-100 hover:bg-white text-zinc-950 rounded-md transition-colors disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Live Structured Planning Workspace & Editable Timeline (7 cols, independently scrollable) */}
        <div className="lg:col-span-7 space-y-4 h-[600px] xl:h-[680px] overflow-y-auto pr-2">
          {!activeProposal ? (
            <div className="space-y-4">
              {/* Live Capacity & Context Bar */}
              <div className="p-4 bg-zinc-950/60 border border-white/[0.06] rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    Live Planning Horizon • {targetDate}
                  </span>
                  <span className="text-xs font-mono text-zinc-300">
                    Target Focus: <strong>{planningContext?.operatingRules?.maxDailyWorkloadHours || 6.5}h</strong>
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/[0.04] text-xs">
                  <div className="p-2.5 bg-zinc-900/40 rounded border border-white/[0.04]">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase block">Existing Events</span>
                    <span className="text-sm font-semibold font-mono text-zinc-200">
                      {planningContext?.existingEvents?.length || 0}
                    </span>
                  </div>
                  <div className="p-2.5 bg-zinc-900/40 rounded border border-white/[0.04]">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase block">Open Backlog</span>
                    <span className="text-sm font-semibold font-mono text-zinc-200">
                      {planningContext?.incompleteTasks?.length || 0} tasks
                    </span>
                  </div>
                  <div className="p-2.5 bg-zinc-900/40 rounded border border-white/[0.04]">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase block">Overdue Missed</span>
                    <span className={`text-sm font-semibold font-mono ${(planningContext?.missedTasks?.length || 0) > 0 ? 'text-amber-400' : 'text-zinc-200'}`}>
                      {planningContext?.missedTasks?.length || 0}
                    </span>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between">
                  <p className="text-[11px] text-zinc-400">
                    Ready to schedule. You can chat on the left or auto-build a schedule from your top open tasks.
                  </p>
                  <button
                    onClick={handleAutoDraftFromOpenTasks}
                    disabled={isProcessing}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 rounded text-xs font-medium transition-colors shadow-xs disabled:opacity-40"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto-Draft Day</span>
                  </button>
                </div>
              </div>

              {/* Existing Calendar Commitments */}
              <div className="p-4 bg-zinc-950/60 border border-white/[0.06] rounded-lg space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Fixed Calendar Commitments ({planningContext?.existingEvents?.length || 0})</span>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">Locked</span>
                </div>

                {(!planningContext?.existingEvents || planningContext.existingEvents.length === 0) ? (
                  <p className="text-xs text-zinc-500 py-2 italic font-mono">
                    No fixed calendar appointments scheduled on {targetDate}. Full focus capacity available.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {planningContext.existingEvents.map((ev: any) => (
                      <div
                        key={ev.id}
                        className="p-2.5 bg-zinc-900/60 rounded border border-white/[0.04] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-zinc-400 text-[11px] w-24">
                            {ev.startTime.includes('T') ? ev.startTime.split('T')[1].slice(0, 5) : ev.startTime.slice(0, 5)} - {ev.endTime.includes('T') ? ev.endTime.split('T')[1].slice(0, 5) : ev.endTime.slice(0, 5)}
                          </span>
                          <span className="font-medium text-zinc-200">{ev.title}</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-white/[0.06]">
                          Fixed Event
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Unallocated Incomplete Tasks */}
              <div className="p-4 bg-zinc-950/60 border border-white/[0.06] rounded-lg space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Unallocated High-Priority Tasks</span>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">Click to Schedule</span>
                </div>

                {(!planningContext?.incompleteTasks || planningContext.incompleteTasks.length === 0) ? (
                  <p className="text-xs text-zinc-500 py-2 italic font-mono">
                    No open tasks in backlog. Describe new tasks in chat.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                    {planningContext.incompleteTasks.map((t: any) => (
                      <div
                        key={t.id}
                        className="p-2.5 bg-zinc-900/40 hover:bg-zinc-900/80 rounded border border-white/[0.04] flex items-center justify-between text-xs transition-colors group"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-medium text-zinc-200 truncate">{t.title}</p>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono mt-0.5">
                            <span>{t.duration || 45} mins</span>
                            {t.dueDate && <span>• Due {t.dueDate}</span>}
                          </div>
                        </div>

                        <button
                          onClick={() => handleAddTaskToDraft(t)}
                          disabled={isProcessing}
                          className="shrink-0 flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px] font-medium border border-white/[0.06] transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Schedule</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Proposal Header & Capacity Card */}
              <div className="p-4 bg-zinc-950/60 border border-white/[0.06] rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    Draft Daily Plan • {activeProposal.targetDate}
                  </span>
                  <span className="text-xs font-mono text-zinc-300">
                    Workload: <strong>{activeProposal.estimatedWorkloadHours}h</strong> / Available: <strong>{activeProposal.totalAvailableHours}h</strong>
                  </span>
                </div>

                {/* Visual Workload Capacity Meter */}
                <div className="space-y-1">
                  <div className="w-full bg-zinc-900 border border-white/[0.04] h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        activeProposal.isOvercommitted
                          ? 'bg-amber-400'
                          : activeProposal.estimatedWorkloadHours > activeProposal.totalAvailableHours * 0.8
                          ? 'bg-indigo-400'
                          : 'bg-emerald-400'
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((activeProposal.estimatedWorkloadHours / Math.max(1, activeProposal.totalAvailableHours)) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                    <span>0h</span>
                    <span>Max {activeProposal.totalAvailableHours}h Focus</span>
                  </div>
                </div>

                <h2 className="text-sm font-semibold text-zinc-100">{activeProposal.objective}</h2>

                {/* Overcommitment Alert if applicable */}
                {activeProposal.isOvercommitted && (
                  <div className="p-3 bg-zinc-900 border border-amber-500/30 rounded-md text-xs text-amber-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Capacity Limit Exceeded ({activeProposal.overloadHours}h overload)</span>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                      {activeProposal.conflictSummary}
                    </p>
                  </div>
                )}
              </div>

              {/* Visual Chronological Timeline */}
              <div className="bg-zinc-950/60 border border-white/[0.06] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                    Chronological Timeline ({activeProposal.scheduledItems.length} Blocks)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsAddingItem(!isAddingItem)}
                      className="text-[11px] font-mono text-zinc-300 hover:text-white flex items-center gap-1 px-2 py-0.5 bg-zinc-900 rounded border border-white/[0.06]"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Block</span>
                    </button>
                    <button
                      onClick={handleReorganizeTimeline}
                      disabled={isProcessing}
                      className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 flex items-center gap-1 px-2 py-0.5 bg-zinc-900 rounded border border-white/[0.06]"
                      title="Reorganize timeline to optimize breaks and flow"
                    >
                      <ArrowUpDown className="w-3 h-3" />
                      <span>Rebalance</span>
                    </button>
                  </div>
                </div>

                {/* Inline Add Item Form */}
                {isAddingItem && (
                  <form onSubmit={handleManualAddItem} className="p-3 bg-zinc-900/80 rounded border border-white/[0.08] space-y-2 text-xs">
                    <span className="font-mono text-[10px] uppercase text-zinc-400 block">Add Commitment to Timeline</span>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <input
                        type="text"
                        placeholder="Commitment title (e.g. Code Review)"
                        value={newItemTitle}
                        onChange={e => setNewItemTitle(e.target.value)}
                        className="sm:col-span-6 bg-zinc-950 border border-white/[0.08] rounded px-2.5 py-1 text-xs text-zinc-100 focus:outline-none"
                        required
                      />
                      <select
                        aria-label="New Commitment Duration"
                        value={newItemDuration}
                        onChange={e => setNewItemDuration(Number(e.target.value))}
                        className="sm:col-span-3 bg-zinc-950 border border-white/[0.08] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none font-mono"
                      >
                        <option value={15}>15 mins</option>
                        <option value={30}>30 mins</option>
                        <option value={45}>45 mins</option>
                        <option value={60}>60 mins</option>
                        <option value={90}>90 mins</option>
                        <option value={120}>2 hours</option>
                      </select>
                      <select
                        aria-label="New Commitment Priority"
                        value={newItemPriority}
                        onChange={e => setNewItemPriority(e.target.value as any)}
                        className="sm:col-span-3 bg-zinc-950 border border-white/[0.08] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none font-mono"
                      >
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="normal">Normal</option>
                        <option value="optional">Optional</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddingItem(false)}
                        className="px-2.5 py-1 text-zinc-400 hover:text-zinc-200 text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 bg-zinc-100 hover:bg-white text-zinc-950 rounded text-xs font-medium"
                      >
                        Add to Schedule
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-2">
                  {activeProposal.scheduledItems.map(block => (
                    <div
                      key={block.id}
                      className="p-3 bg-zinc-900/60 border border-white/[0.04] rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-white/[0.08] transition-colors text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Time slot */}
                        <div className="w-24 shrink-0 font-mono text-zinc-400 text-[11px]">
                          {block.startTime} - {block.endTime}
                        </div>

                        {/* Title and Badge */}
                        <div className="min-w-0">
                          <p className="font-medium text-zinc-200 truncate">{block.title}</p>
                          {block.notes && <p className="text-[10px] text-zinc-500 truncate">{block.notes}</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                        {/* Duration adjustment buttons */}
                        <div className="flex items-center bg-zinc-950 border border-white/[0.06] rounded font-mono text-[10px]">
                          <button
                            onClick={() => adjustItemDuration(block.id, -15)}
                            className="px-1.5 py-0.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                            title="Decrease 15 mins"
                            aria-label="Decrease 15 mins"
                          >
                            -15
                          </button>
                          <span className="px-2 py-0.5 text-zinc-200 border-x border-white/[0.04]">
                            {block.durationMinutes}m
                          </span>
                          <button
                            onClick={() => adjustItemDuration(block.id, 15)}
                            className="px-1.5 py-0.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                            title="Increase 15 mins"
                            aria-label="Increase 15 mins"
                          >
                            +15
                          </button>
                        </div>

                        {/* Priority selector */}
                        {block.itemType === 'fixed_event' ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-white/[0.08] uppercase">
                            Fixed
                          </span>
                        ) : (
                          <select
                            aria-label="Block Priority"
                            value={block.priority}
                            onChange={e => updateItemPriority(block.id, e.target.value as any)}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-950 border border-white/[0.06] text-zinc-300 uppercase focus:outline-none"
                          >
                            <option value="critical">Critical</option>
                            <option value="high">High</option>
                            <option value="normal">Normal</option>
                            <option value="optional">Optional</option>
                          </select>
                        )}

                        <button
                          onClick={() => removeItemFromProposal(block.id)}
                          className="text-zinc-500 hover:text-rose-400 p-1 transition-colors"
                          title="Remove from plan"
                          aria-label="Remove from plan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Deferrals Section If Any */}
              {activeProposal.suggestedDeferrals.length > 0 && (
                <div className="p-3.5 bg-zinc-950/60 border border-white/[0.06] rounded-lg text-xs space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block">
                    Recommended Deferrals ({activeProposal.suggestedDeferrals.length})
                  </span>
                  <div className="space-y-1.5">
                    {activeProposal.suggestedDeferrals.map((def, dIdx) => (
                      <div key={dIdx} className="p-2 bg-zinc-900/40 rounded border border-white/[0.04] flex items-center justify-between text-xs">
                        <div>
                          <p className="font-medium text-zinc-300">{def.title}</p>
                          <p className="text-[10px] text-zinc-500">{def.reason}</p>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-400">
                          → Move to {def.suggestedDate || 'Backlog'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Prepare-and-Confirm Diff Summary & Commit Button */}
              <div className="p-4 bg-zinc-950/80 border border-white/[0.08] rounded-lg space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                  <span>Prepare-and-Confirm Diff</span>
                  <span>
                    +{activeProposal.diffSummary.calendarBlocksToCreate} Calendar Blocks • +{activeProposal.diffSummary.tasksToCreate} Tasks
                  </span>
                </div>

                {commitStatus === 'committed' ? (
                  <div className="p-3 bg-zinc-900 border border-emerald-500/30 rounded-md text-xs text-emerald-400 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Daily plan committed successfully! All time blocks scheduled.</span>
                    </div>
                    <Link
                      href="/"
                      className="px-3 py-1 bg-zinc-100 hover:bg-white text-zinc-950 rounded text-xs font-medium transition-colors"
                    >
                      Open Today Cockpit →
                    </Link>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[11px] text-zinc-500">
                      Atomic commitment: Writes daily plan, creates calendar events, and enqueues tasks.
                    </p>
                    <button
                      onClick={handleCommitPlan}
                      disabled={commitStatus === 'committing'}
                      className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 rounded-md text-xs font-medium shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{commitStatus === 'committing' ? 'Committing Schedule...' : 'Approve & Commit Plan'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

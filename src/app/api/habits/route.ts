import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateHabitStreak } from '@/lib/productivity/engine';
import { todayISO } from "@/lib/time";

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get('spaceId');
    const today = todayISO();

    let query = 'SELECT * FROM habits WHERE tenant_id = ?';
    const params: any[] = [session.tenantId];

    if (spaceId && spaceId !== 'all') {
      query += ' AND space_id = ?';
      params.push(spaceId);
    }
    query += ' ORDER BY is_paused ASC, created_at ASC';

    const rawHabits = db.prepare(query).all(...params) as any[];

    const habits = rawHabits.map(h => {
      const streakInfo = calculateHabitStreak(db, session.tenantId, h.id, today);
      
      // Get past 7 days logs for weekly heatmap / dots
      const recentLogs = db.prepare(`
        SELECT log_date, value, status 
        FROM habit_logs 
        WHERE tenant_id = ? AND habit_id = ? 
        ORDER BY log_date DESC LIMIT 14
      `).all(session.tenantId, h.id);

      return {
        ...h,
        streak: streakInfo?.currentStreak || 0,
        bestStreak: streakInfo?.bestStreak || 0,
        completionRate: streakInfo?.completionRatePercent || 0,
        isCompletedToday: streakInfo?.isCompletedToday || false,
        todayValue: streakInfo?.todayLogValue,
        recentLogs,
      };
    });

    return NextResponse.json({ habits });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    if (!body.title || !body.title.trim()) {
      return NextResponse.json({ error: 'Habit title is required' }, { status: 400 });
    }

    const habitId = `habit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const trackingType = body.trackingType || 'boolean';
    const targetValue = body.targetValue !== undefined ? body.targetValue : 1;
    const minimumThreshold = body.minimumThreshold !== undefined ? body.minimumThreshold : 1;
    const idealTarget = body.idealTarget !== undefined ? body.idealTarget : targetValue;
    const unit = body.unit || (trackingType === 'duration' ? 'mins' : 'times');
    const color = body.color || '#8b5cf6';
    const icon = body.icon || 'CheckCircle2';

    db.prepare(`
      INSERT INTO habits (
        id, tenant_id, space_id, title, description, tracking_type, unit, target_value, minimum_threshold, ideal_target, schedule_type, schedule_days, color, icon
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      habitId,
      session.tenantId,
      body.spaceId || 'space_personal',
      body.title.trim(),
      body.description || '',
      trackingType,
      unit,
      targetValue,
      minimumThreshold,
      idealTarget,
      body.scheduleType || 'daily',
      body.scheduleDays ? JSON.stringify(body.scheduleDays) : '[1,2,3,4,5,6,7]',
      color,
      icon
    );

    const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(habitId);
    return NextResponse.json({ habit }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

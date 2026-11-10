export type OfflineMutationType =
  | 'create_task'
  | 'quick_capture'
  | 'complete_task'
  | 'log_habit'
  | 'create_calendar_event'
  | 'create_transaction';

export interface OfflineMutation {
  id: string;
  idempotencyKey: string;
  type: OfflineMutationType;
  payload: any;
  createdAt: string;
  status: 'queued' | 'syncing' | 'synced' | 'conflict' | 'failed';
  retryCount: number;
  errorMessage?: string;
}

const STORAGE_KEY = 'personal_os_offline_queue_v1';

export function getOfflineQueue(): OfflineMutation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(queue: OfflineMutation[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Failed to save offline queue', e);
  }
}

export function enqueueOfflineMutation(type: OfflineMutationType, payload: any): OfflineMutation {
  const mutation: OfflineMutation = {
    id: `mut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    idempotencyKey: `idem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    status: 'queued',
    retryCount: 0,
  };

  const queue = getOfflineQueue();
  queue.push(mutation);
  saveOfflineQueue(queue);
  return mutation;
}

export function markMutationStatus(id: string, status: OfflineMutation['status'], errorMessage?: string): void {
  const queue = getOfflineQueue();
  const item = queue.find(m => m.id === id);
  if (item) {
    item.status = status;
    if (errorMessage) item.errorMessage = errorMessage;
    if (status === 'syncing') item.retryCount += 1;
    saveOfflineQueue(queue);
  }
}

export function removeSyncedMutations(): void {
  const queue = getOfflineQueue();
  const pending = queue.filter(m => m.status !== 'synced');
  saveOfflineQueue(pending);
}

/** Endpoint + method per mutation type (all idempotency-keyed POST/PUT). */
function routeFor(type: OfflineMutationType): { url: string; method: 'POST' | 'PUT' } {
  switch (type) {
    case 'complete_task':
      return { url: '/api/tasks', method: 'PUT' };
    case 'log_habit':
      return { url: '/api/habits/log', method: 'POST' };
    case 'create_calendar_event':
      return { url: '/api/calendar', method: 'POST' };
    case 'create_transaction':
      return { url: '/api/finance/transactions', method: 'POST' };
    case 'create_task':
    case 'quick_capture':
    default:
      return { url: '/api/tasks', method: 'POST' };
  }
}

export interface GuardOfflineResult {
  /** true when the mutation was queued locally instead of delivered live */
  queuedOffline: boolean;
  /** server response when the mutation was delivered immediately */
  response?: Response;
  /** the queued mutation when queuedOffline */
  mutation?: OfflineMutation;
}

/**
 * Offline-first submit guard for UI mutation surfaces.
 *
 * Try the live request; if the network is down (browser offline OR the fetch
 * itself throws — the local-first app is reachable without the localhost dev
 * server in exotic setups), park the mutation in the localStorage queue with
 * an idempotency key so replay (syncOfflineQueue) never double-posts.
 * Callers show their own feedback based on `queuedOffline`.
 */
export async function guardOffline(
  type: OfflineMutationType,
  payload: any,
  fetchImpl: typeof fetch = fetch
): Promise<GuardOfflineResult> {
  if (typeof window === 'undefined') {
    // SSR safety: never queue during render — deliver responsibility to the client.
    return { queuedOffline: false };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const mutation = enqueueOfflineMutation(type, payload);
    return { queuedOffline: true, mutation };
  }

  try {
    const { url, method } = routeFor(type);
    const response = await fetchImpl(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `idem_${type}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok && response.status >= 500) {
      // Server is there but failing: park for replay instead of losing input.
      const mutation = enqueueOfflineMutation(type, payload);
      return { queuedOffline: true, mutation };
    }
    return { queuedOffline: false, response };
  } catch {
    const mutation = enqueueOfflineMutation(type, payload);
    return { queuedOffline: true, mutation };
  }
}

export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return { synced: 0, failed: 0 };
  }
  const queue = getOfflineQueue();
  const pending = queue.filter(m => m.status === 'queued' || m.status === 'failed');
  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      markMutationStatus(item.id, 'syncing');
      const { url, method } = routeFor(item.type);

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': item.idempotencyKey,
        },
        body: JSON.stringify(item.payload),
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      markMutationStatus(item.id, 'synced');
      synced++;
    } catch (err: any) {
      markMutationStatus(item.id, 'failed', err.message);
      failed++;
    }
  }

  removeSyncedMutations();
  return { synced, failed };
}


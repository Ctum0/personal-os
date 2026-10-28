export type OfflineMutationType = 'create_task' | 'log_habit' | 'quick_capture';

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

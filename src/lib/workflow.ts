export type WorkflowStage = 0 | 1 | 2 | 3 | 4 | 5;
export type OperationStatus = 'READY' | 'RUNNING' | 'STOPPED';

export interface WorkflowState {
  stage: WorkflowStage;
  poweredOn: boolean;
  machineChecks: boolean[];
  tools: boolean[];
  workpiece: boolean[];
  operationStatus: OperationStatus;
  operationProgress: number;
  updatedAt: string;
}

export interface ApiResponse {
  state: WorkflowState;
  restored?: boolean;
  message?: string;
}

export const defaultState: WorkflowState = {
  stage: 0,
  poweredOn: false,
  machineChecks: Array(6).fill(false),
  tools: Array(5).fill(false),
  workpiece: Array(8).fill(false),
  operationStatus: 'READY',
  operationProgress: 0,
  updatedAt: new Date().toISOString(),
};

const STORAGE_KEY = 'vmc-operator-hmi-state';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const API_BASE = supabaseUrl ? `${supabaseUrl}/functions/v1/vmc-api` : '';

async function apiCall(path: string, options: RequestInit = {}): Promise<ApiResponse> {
  if (!API_BASE) throw new Error('Backend is not configured.');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (supabaseKey) headers['Authorization'] = `Bearer ${supabaseKey}`;

  const response = await fetch(`${API_BASE}/${path}`, { ...options, headers });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }
  if (!data || !data.state) {
    throw new Error('The server returned an unexpected response.');
  }
  return data as ApiResponse;
}

function cacheLocal(state: WorkflowState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore quota errors */ }
}

function readLocal(): WorkflowState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorkflowState;
  } catch {
    return null;
  }
}

export async function loadWorkflow(): Promise<{ state: WorkflowState; restored: boolean; source: 'api' | 'local' | 'default' }> {
  try {
    const result = await apiCall('workflow/state');
    cacheLocal(result.state);
    return { state: result.state, restored: !!result.restored, source: 'api' };
  } catch {
    const local = readLocal();
    if (local) return { state: local, restored: true, source: 'local' };
    return { state: defaultState, restored: false, source: 'default' };
  }
}

export async function powerOn(): Promise<ApiResponse> {
  const result = await apiCall('workflow/power', { method: 'POST' });
  cacheLocal(result.state);
  return result;
}

export async function confirmCheck(stage: number, index: number): Promise<ApiResponse> {
  const result = await apiCall('workflow/check', {
    method: 'POST',
    body: JSON.stringify({ stage, index }),
  });
  cacheLocal(result.state);
  return result;
}

export async function nextStage(): Promise<ApiResponse> {
  const result = await apiCall('workflow/next', { method: 'POST' });
  cacheLocal(result.state);
  return result;
}

export async function startOperation(): Promise<ApiResponse> {
  const result = await apiCall('operation/start', { method: 'POST' });
  cacheLocal(result.state);
  return result;
}

export async function stopOperation(): Promise<ApiResponse> {
  const result = await apiCall('operation/stop', { method: 'POST' });
  cacheLocal(result.state);
  return result;
}

export async function advanceProgress(): Promise<ApiResponse> {
  const result = await apiCall('operation/progress', { method: 'POST' });
  cacheLocal(result.state);
  return result;
}

export async function resetWorkflow(): Promise<ApiResponse> {
  const result = await apiCall('workflow/reset', { method: 'POST' });
  localStorage.removeItem(STORAGE_KEY);
  return result;
}

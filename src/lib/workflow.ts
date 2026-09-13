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
  source?: 'api' | 'local';
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

function readLocal(): WorkflowState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as WorkflowState;
    return parsed.stage !== undefined ? parsed : defaultState;
  } catch {
    return defaultState;
  }
}

export async function loadWorkflow(): Promise<{ state: WorkflowState; restored: boolean; source: 'api' | 'local' | 'default' }> {
  try {
    const result = await apiCall('workflow/state');
    cacheLocal(result.state);
    return { state: result.state, restored: !!result.restored, source: 'api' };
  } catch {
    const local = readLocal();
    if (local && local.poweredOn) return { state: local, restored: true, source: 'local' };
    return { state: defaultState, restored: false, source: 'default' };
  }
}

export async function powerOn(): Promise<ApiResponse> {
  try {
    const result = await apiCall('workflow/power', { method: 'POST' });
    cacheLocal(result.state);
    return { ...result, source: 'api' };
  } catch {
    const current = readLocal();
    const nextState: WorkflowState = {
      ...current,
      poweredOn: true,
      stage: 1,
      updatedAt: new Date().toISOString(),
    };
    cacheLocal(nextState);
    return { state: nextState, message: 'Control online (offline mode). Machine checks are ready.', source: 'local' };
  }
}

export async function confirmCheck(stage: number, index: number): Promise<ApiResponse> {
  try {
    const result = await apiCall('workflow/check', {
      method: 'POST',
      body: JSON.stringify({ stage, index }),
    });
    cacheLocal(result.state);
    return { ...result, source: 'api' };
  } catch {
    const current = readLocal();
    const field = stage === 1 ? 'machineChecks' : stage === 2 ? 'tools' : 'workpiece';
    const flags = [...current[field]];
    flags[index] = true;
    const nextState: WorkflowState = {
      ...current,
      [field]: flags,
      updatedAt: new Date().toISOString(),
    };
    cacheLocal(nextState);
    return { state: nextState, message: 'Confirmation recorded (offline mode).', source: 'local' };
  }
}

export async function nextStage(): Promise<ApiResponse> {
  try {
    const result = await apiCall('workflow/next', { method: 'POST' });
    cacheLocal(result.state);
    return { ...result, source: 'api' };
  } catch {
    const current = readLocal();
    const nextStageVal = Math.min(5, current.stage + 1) as WorkflowStage;
    const nextState: WorkflowState = {
      ...current,
      stage: nextStageVal,
      updatedAt: new Date().toISOString(),
    };
    cacheLocal(nextState);
    return { state: nextState, message: 'Stage complete (offline mode).', source: 'local' };
  }
}

export async function startOperation(): Promise<ApiResponse> {
  try {
    const result = await apiCall('operation/start', { method: 'POST' });
    cacheLocal(result.state);
    return { ...result, source: 'api' };
  } catch {
    const current = readLocal();
    const progress = current.operationProgress >= 100 ? 0 : current.operationProgress;
    const nextState: WorkflowState = {
      ...current,
      operationStatus: 'RUNNING',
      operationProgress: progress,
      updatedAt: new Date().toISOString(),
    };
    cacheLocal(nextState);
    return { state: nextState, message: 'Operation started (offline mode).', source: 'local' };
  }
}

export async function stopOperation(): Promise<ApiResponse> {
  try {
    const result = await apiCall('operation/stop', { method: 'POST' });
    cacheLocal(result.state);
    return { ...result, source: 'api' };
  } catch {
    const current = readLocal();
    const nextState: WorkflowState = {
      ...current,
      operationStatus: 'STOPPED',
      updatedAt: new Date().toISOString(),
    };
    cacheLocal(nextState);
    return { state: nextState, message: 'Operation stopped by operator (offline mode).', source: 'local' };
  }
}

export async function advanceProgress(): Promise<ApiResponse> {
  try {
    const result = await apiCall('operation/progress', { method: 'POST' });
    cacheLocal(result.state);
    return { ...result, source: 'api' };
  } catch {
    const current = readLocal();
    const progress = Math.min(100, current.operationProgress + 1);
    const nextState: WorkflowState = {
      ...current,
      operationProgress: progress,
      operationStatus: progress >= 100 ? 'STOPPED' : 'RUNNING',
      updatedAt: new Date().toISOString(),
    };
    cacheLocal(nextState);
    return { state: nextState, source: 'local' };
  }
}

export async function resetWorkflow(): Promise<ApiResponse> {
  try {
    await apiCall('workflow/reset', { method: 'POST' });
  } catch {
    /* ignore network failure on reset */
  }
  localStorage.removeItem(STORAGE_KEY);
  const resetState = { ...defaultState, updatedAt: new Date().toISOString() };
  return { state: resetState, message: 'Workflow reset.' };
}

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface WorkflowState {
  stage: number;
  poweredOn: boolean;
  machineChecks: boolean[];
  tools: boolean[];
  workpiece: boolean[];
  operationStatus: "READY" | "RUNNING" | "STOPPED";
  operationProgress: number;
  updatedAt: string;
}

const ROW_ID = "PF-VMC-042";
const MACHINE_CHECKS_COUNT = 6;
const TOOLS_COUNT = 5;
const WORKPIECE_COUNT = 8;

const defaultState: WorkflowState = {
  stage: 0,
  poweredOn: false,
  machineChecks: Array(MACHINE_CHECKS_COUNT).fill(false),
  tools: Array(TOOLS_COUNT).fill(false),
  workpiece: Array(WORKPIECE_COUNT).fill(false),
  operationStatus: "READY",
  operationProgress: 0,
  updatedAt: new Date().toISOString(),
};

const scenario = {
  job: {
    jobId: "PF-VMC-042",
    quantity: 12,
    operation: "Precision pocket milling",
    material: "Aluminium 6061-T6",
    drawingRevision: "REV C",
    cncProgram: "PF042_POCKET_REV_C.nc",
    programRevision: "REV C",
    fixture: "4-jaw precision vise with soft jaws",
    workOffset: "G54",
    machine: "VMC-850 CNC Vertical Machining Center",
  },
  machineChecks: [
    "Power and CNC control are available.",
    "Emergency stop is released.",
    "Guard and machine door are closed.",
    "No active machine alarm is present.",
    "Lubrication and coolant are ready.",
    "Machine reference return is complete.",
  ],
  tools: [
    { number: "01", type: "Ø10 mm carbide flat end mill", purpose: "Roughing and pocket floor finishing" },
    { number: "02", type: "Ø6 mm carbide flat end mill", purpose: "Small-radius pocket detail work" },
    { number: "03", type: "Ø5 mm carbide center drill", purpose: "Spotting and locating drilled features" },
    { number: "04", type: "Ø8 mm carbide drill", purpose: "Machining through holes" },
    { number: "05", type: "90-degree chamfer mill", purpose: "Edge break and finishing pass" },
  ],
  workpieceItems: [
    "Install the 4-jaw precision vise with soft jaws on the machine table.",
    "Place the Aluminium 6061-T6 workpiece against the fixed jaw.",
    "Orient the workpiece with the datum face upward and the marked reference edge toward the operator.",
    "Clamp the workpiece firmly using the soft jaws.",
    "Verify the workpiece material is Aluminium 6061-T6.",
    "Verify drawing revision is REV C.",
    "Set and verify work offset G54.",
    "Confirm the workpiece is secure and clear of the toolpath.",
  ],
  workpieceDetails: {
    material: "Aluminium 6061-T6",
    drawingRevision: "REV C",
    fixture: "4-jaw precision vise with soft jaws",
    orientation: "Datum face upward, reference edge toward operator",
    workOffset: "G54",
  },
  stages: ["Power On", "Machine Checks", "Tools", "Workpiece", "Ready", "Operation"],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function isValidState(value: unknown): value is WorkflowState {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<WorkflowState>;
  return (
    typeof s.stage === "number" && s.stage >= 0 && s.stage <= 5 &&
    typeof s.poweredOn === "boolean" &&
    Array.isArray(s.machineChecks) && s.machineChecks.length === MACHINE_CHECKS_COUNT && s.machineChecks.every((v: unknown) => typeof v === "boolean") &&
    Array.isArray(s.tools) && s.tools.length === TOOLS_COUNT && s.tools.every((v: unknown) => typeof v === "boolean") &&
    Array.isArray(s.workpiece) && s.workpiece.length === WORKPIECE_COUNT && s.workpiece.every((v: unknown) => typeof v === "boolean") &&
    (s.operationStatus === "READY" || s.operationStatus === "RUNNING" || s.operationStatus === "STOPPED") &&
    typeof s.operationProgress === "number" && s.operationProgress >= 0 && s.operationProgress <= 100 &&
    typeof s.updatedAt === "string"
  );
}

function completion(state: WorkflowState) {
  return {
    machine: state.machineChecks.filter(Boolean).length,
    tools: state.tools.filter(Boolean).length,
    workpiece: state.workpiece.filter(Boolean).length,
  };
}

function allStageItemsComplete(state: WorkflowState, stage: number): boolean {
  if (stage === 0) return state.poweredOn;
  if (stage === 1) return state.machineChecks.every(Boolean);
  if (stage === 2) return state.tools.every(Boolean);
  if (stage === 3) return state.workpiece.every(Boolean);
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/vmc-api/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  const method = req.method;

  try {
    // GET /workflow — full scenario + current state
    if ((path === "workflow" || path === "workflow/state") && method === "GET") {
      const { data, error } = await supabase
        .from("vmc_workflow_state")
        .select("state, updated_at")
        .eq("id", ROW_ID)
        .maybeSingle();

      if (error) return errorResponse("Failed to read workflow state from database.", 500);

      const state = data?.state && isValidState(data.state) ? (data.state as WorkflowState) : defaultState;
      const restored = !!data?.state && isValidState(data.state);

      if (path === "workflow/state") {
        return json({ state, restored });
      }
      return json({ scenario, state, restored, completion: completion(state) });
    }

    // POST /workflow/power — power on the machine
    if (path === "workflow/power" && method === "POST") {
      const { data } = await supabase
        .from("vmc_workflow_state")
        .select("state")
        .eq("id", ROW_ID)
        .maybeSingle();

      const current = data?.state && isValidState(data.state) ? (data.state as WorkflowState) : defaultState;
      if (current.poweredOn) {
        return errorResponse("Machine is already powered on.", 409);
      }

      const nextState: WorkflowState = {
        ...current,
        poweredOn: true,
        stage: 1,
        updatedAt: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("vmc_workflow_state")
        .upsert({ id: ROW_ID, state: nextState, updated_at: nextState.updatedAt });

      if (error) return errorResponse("Failed to persist power-on state.", 500);
      return json({ state: nextState, message: "Control online. Machine checks are ready." });
    }

    // POST /workflow/check — confirm a checklist item
    if (path === "workflow/check" && method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body.stage !== "number" || typeof body.index !== "number") {
        return errorResponse("Request must include numeric 'stage' and 'index' fields.", 400);
      }

      const { stage, index } = body as { stage: number; index: number };
      if (stage < 1 || stage > 3) return errorResponse("Invalid stage for check confirmation.", 400);

      const maxIndex = stage === 1 ? MACHINE_CHECKS_COUNT : stage === 2 ? TOOLS_COUNT : WORKPIECE_COUNT;
      if (index < 0 || index >= maxIndex) return errorResponse("Invalid check index for this stage.", 400);

      const { data } = await supabase
        .from("vmc_workflow_state")
        .select("state")
        .eq("id", ROW_ID)
        .maybeSingle();

      const current = data?.state && isValidState(data.state) ? (data.state as WorkflowState) : defaultState;
      if (!current.poweredOn) return errorResponse("Machine must be powered on before confirming checklist items.", 409);
      if (current.stage !== stage) return errorResponse("This check does not belong to the current workflow stage.", 409);

      const field = stage === 1 ? "machineChecks" : stage === 2 ? "tools" : "workpiece";
      const flags = [...current[field]];
      if (flags[index]) return errorResponse("This item is already confirmed.", 409);
      flags[index] = true;

      const nextState: WorkflowState = {
        ...current,
        [field]: flags,
        updatedAt: new Date().toISOString(),
      } as WorkflowState;

      const { error } = await supabase
        .from("vmc_workflow_state")
        .upsert({ id: ROW_ID, state: nextState, updated_at: nextState.updatedAt });

      if (error) return errorResponse("Failed to persist check confirmation.", 500);
      return json({ state: nextState, message: "Confirmation recorded." });
    }

    // POST /workflow/next — advance to next stage
    if (path === "workflow/next" && method === "POST") {
      const { data } = await supabase
        .from("vmc_workflow_state")
        .select("state")
        .eq("id", ROW_ID)
        .maybeSingle();

      const current = data?.state && isValidState(data.state) ? (data.state as WorkflowState) : defaultState;
      if (current.stage >= 5) return errorResponse("Already at the final stage.", 409);

      if (!allStageItemsComplete(current, current.stage)) {
        return errorResponse("Complete every item in this stage before continuing.", 409);
      }

      const nextState: WorkflowState = {
        ...current,
        stage: current.stage + 1,
        updatedAt: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("vmc_workflow_state")
        .upsert({ id: ROW_ID, state: nextState, updated_at: nextState.updatedAt });

      if (error) return errorResponse("Failed to advance workflow stage.", 500);
      return json({ state: nextState, message: "Stage complete." });
    }

    // POST /operation/start — start or resume the operation
    if (path === "operation/start" && method === "POST") {
      const { data } = await supabase
        .from("vmc_workflow_state")
        .select("state")
        .eq("id", ROW_ID)
        .maybeSingle();

      const current = data?.state && isValidState(data.state) ? (data.state as WorkflowState) : defaultState;
      if (!current.poweredOn) return errorResponse("Machine must be powered on to start operation.", 409);
      if (current.stage !== 5) return errorResponse("Operation is not available until all setup stages are complete.", 409);

      const c = completion(current);
      if (c.machine !== MACHINE_CHECKS_COUNT || c.tools !== TOOLS_COUNT || c.workpiece !== WORKPIECE_COUNT) {
        return errorResponse("Complete all machine, tool, and workpiece checks before starting.", 409);
      }

      if (current.operationStatus === "RUNNING") {
        return errorResponse("Operation is already running.", 409);
      }

      const nextState: WorkflowState = {
        ...current,
        operationStatus: "RUNNING",
        operationProgress: current.operationProgress >= 100 ? 0 : current.operationProgress,
        updatedAt: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("vmc_workflow_state")
        .upsert({ id: ROW_ID, state: nextState, updated_at: nextState.updatedAt });

      if (error) return errorResponse("Failed to start operation.", 500);
      return json({ state: nextState, message: "Operation started." });
    }

    // POST /operation/stop — stop the running operation
    if (path === "operation/stop" && method === "POST") {
      const { data } = await supabase
        .from("vmc_workflow_state")
        .select("state")
        .eq("id", ROW_ID)
        .maybeSingle();

      const current = data?.state && isValidState(data.state) ? (data.state as WorkflowState) : defaultState;
      if (current.operationStatus !== "RUNNING") {
        return errorResponse("Operation is not currently running.", 409);
      }

      const nextState: WorkflowState = {
        ...current,
        operationStatus: "STOPPED",
        updatedAt: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("vmc_workflow_state")
        .upsert({ id: ROW_ID, state: nextState, updated_at: nextState.updatedAt });

      if (error) return errorResponse("Failed to stop operation.", 500);
      return json({ state: nextState, message: "Operation stopped by operator." });
    }

    // POST /operation/progress — update simulated progress
    if (path === "operation/progress" && method === "POST") {
      const { data } = await supabase
        .from("vmc_workflow_state")
        .select("state")
        .eq("id", ROW_ID)
        .maybeSingle();

      const current = data?.state && isValidState(data.state) ? (data.state as WorkflowState) : defaultState;
      if (current.operationStatus !== "RUNNING") {
        return errorResponse("Operation is not running; progress cannot advance.", 409);
      }

      const progress = Math.min(100, current.operationProgress + 1);
      const nextState: WorkflowState = {
        ...current,
        operationProgress: progress,
        operationStatus: progress >= 100 ? "STOPPED" : "RUNNING",
        updatedAt: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("vmc_workflow_state")
        .upsert({ id: ROW_ID, state: nextState, updated_at: nextState.updatedAt });

      if (error) return errorResponse("Failed to update operation progress.", 500);
      return json({ state: nextState });
    }

    // POST /workflow/reset — reset everything
    if (path === "workflow/reset" && method === "POST") {
      const { error } = await supabase
        .from("vmc_workflow_state")
        .delete()
        .eq("id", ROW_ID);

      if (error) return errorResponse("Failed to reset workflow.", 500);
      return json({ state: { ...defaultState, updatedAt: new Date().toISOString() }, message: "Workflow reset." });
    }

    return errorResponse(`No route handler for ${method} /${path}`, 404);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal server error.", 500);
  }
});

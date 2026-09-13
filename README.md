# VMC Operator HMI

A full-stack simulation of the Primeform Labs VMC-850 operator startup and machining workflow.

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Supabase Edge Function (`vmc-api`) running on Deno
- **Database**: PostgreSQL table `vmc_workflow_state` storing the workflow snapshot as JSONB
- **Persistence**: Primary store is the Supabase database via the API; localStorage mirrors state as a fallback for offline resilience

## How it works

The operator moves through six locked stages: Power On, Machine Checks, Tools, Workpiece, Ready Review, and Operation. Each checklist item must be confirmed before the next stage becomes available. The backend enforces all validation rules — the frontend cannot skip stages or bypass checks.

## API Endpoints

The edge function at `/functions/v1/vmc-api` exposes:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/workflow` | Returns the full scenario data and current workflow state |
| GET | `/workflow/state` | Returns just the current workflow state |
| POST | `/workflow/power` | Powers on the machine and advances to Machine Checks |
| POST | `/workflow/check` | Confirms a checklist item (body: `{ stage, index }`) |
| POST | `/workflow/next` | Advances to the next stage after validation |
| POST | `/operation/start` | Starts or resumes the simulated operation |
| POST | `/operation/stop` | Stops a running operation |
| POST | `/operation/progress` | Advances simulated cycle progress by 1% |
| POST | `/workflow/reset` | Resets all state and returns to Power On |

## Backend Validation

The edge function enforces:
- Stage progression requires all items in the current stage to be confirmed
- Operation start requires all 6 machine checks, 5 tools, and 8 workpiece items complete
- Stop is only allowed when the operation is RUNNING
- Double-confirm of an already-confirmed item returns an error
- All state transitions are persisted to the database before returning

## Persistence

The workflow snapshot is saved to the `vmc_workflow_state` table in Supabase on every API call. The frontend also mirrors state in localStorage. On refresh, the app calls `GET /workflow/state` to restore from the backend; if the backend is unreachable, it falls back to localStorage.

## Demo assumptions

This is simulation mode only. There is no connection to CNC hardware, no authentication, and one shared operator station represents the assignment scenario for PF-VMC-042.

## How to run

The dev server runs automatically. The edge function is deployed to Supabase and called by the frontend service layer in `src/lib/workflow.ts`.

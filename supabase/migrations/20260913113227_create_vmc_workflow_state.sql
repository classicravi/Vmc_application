/*
# Create VMC operator workflow state

1. New Tables
- `vmc_workflow_state` stores the single shared simulated machine workflow.
- `id` identifies the singleton state row.
- `state` stores the typed workflow snapshot as JSON.
- `updated_at` records the most recent state change.

2. Security
- Row level security is enabled.
- The app has no sign-in screen and represents one simulated operator station, so anon and authenticated roles may read, insert, update, and delete the shared singleton row.

3. Important Notes
- This table is intentionally single-tenant for the assignment demo.
- The application enforces the workflow transition rules before writing state.
*/

CREATE TABLE IF NOT EXISTS vmc_workflow_state (
  id text PRIMARY KEY,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vmc_workflow_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shared HMI state can be read" ON vmc_workflow_state;
CREATE POLICY "Shared HMI state can be read"
  ON vmc_workflow_state FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Shared HMI state can be inserted" ON vmc_workflow_state;
CREATE POLICY "Shared HMI state can be inserted"
  ON vmc_workflow_state FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Shared HMI state can be updated" ON vmc_workflow_state;
CREATE POLICY "Shared HMI state can be updated"
  ON vmc_workflow_state FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Shared HMI state can be deleted" ON vmc_workflow_state;
CREATE POLICY "Shared HMI state can be deleted"
  ON vmc_workflow_state FOR DELETE
  TO anon, authenticated
  USING (true);

import { useEffect, useMemo, useState } from 'react';
import {
  Check, CheckCircle2, ChevronRight, Circle, ClipboardCheck,
  Cog, Factory, FileText, Gauge, Hammer, LockKeyhole, Pause, Play, Power, RotateCcw,
  ShieldCheck, Square, TriangleAlert, Wrench, XCircle,
} from 'lucide-react';
import {
  defaultState, loadWorkflow, resetWorkflow, powerOn, confirmCheck, nextStage,
  startOperation, stopOperation, advanceProgress,
  type WorkflowStage, type WorkflowState,
} from '@/lib/workflow';

const stages = ['Power On', 'Machine Checks', 'Tools', 'Workpiece', 'Ready', 'Operation'];
const machineChecks = [
  'Power and CNC control are available.',
  'Emergency stop is released.',
  'Guard and machine door are closed.',
  'No active machine alarm is present.',
  'Lubrication and coolant are ready.',
  'Machine reference return is complete.',
];
const tools = [
  { number: '01', type: 'Ø10 mm carbide flat end mill', purpose: 'Roughing and pocket floor finishing' },
  { number: '02', type: 'Ø6 mm carbide flat end mill', purpose: 'Small-radius pocket detail work' },
  { number: '03', type: 'Ø5 mm carbide center drill', purpose: 'Spotting and locating drilled features' },
  { number: '04', type: 'Ø8 mm carbide drill', purpose: 'Machining through holes' },
  { number: '05', type: '90-degree chamfer mill', purpose: 'Edge break and finishing pass' },
];
const workpieceItems = [
  'Install the 4-jaw precision vise with soft jaws on the machine table.',
  'Place the Aluminium 6061-T6 workpiece against the fixed jaw.',
  'Orient the workpiece with the datum face upward and the marked reference edge toward the operator.',
  'Clamp the workpiece firmly using the soft jaws.',
  'Verify the workpiece material is Aluminium 6061-T6.',
  'Verify drawing revision is REV C.',
  'Set and verify work offset G54.',
  'Confirm the workpiece is secure and clear of the toolpath.',
];

function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }) {
  return (
    <span className={`status-badge status-${tone}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

function ProgressStepper({ stage }: { stage: WorkflowStage }) {
  return (
    <nav className="stepper" aria-label="Workflow progress">
      {stages.map((label, index) => (
        <div className={`step ${index < stage ? 'step-done' : ''} ${index === stage ? 'step-current' : ''}`} key={label}>
          <div className="step-marker">
            {index < stage ? <Check size={16} strokeWidth={3} /> : index === stage ? <span>{index + 1}</span> : <LockKeyhole size={14} />}
          </div>
          <span>{label}</span>
          {index < stages.length - 1 && <div className={`step-line ${index < stage ? 'line-done' : ''}`} />}
        </div>
      ))}
    </nav>
  );
}

function ConfirmationButton({ label, onClick, disabled = false, tone = 'primary', icon }: { label: string; onClick: () => void; disabled?: boolean; tone?: 'primary' | 'success' | 'danger' | 'warning'; icon?: React.ReactNode }) {
  return (
    <button className={`action-button action-${tone}`} disabled={disabled} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function SectionTitle({ icon, eyebrow, title }: { icon: React.ReactNode; eyebrow: string; title: string }) {
  return (
    <div className="section-title">
      <div className="section-icon">{icon}</div>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
    </div>
  );
}

function JobPanel() {
  return (
    <aside className="job-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Production brief</span>
          <h2>Job information</h2>
        </div>
        <FileText size={21} />
      </div>
      <div className="job-identity">
        <span>JOB ID</span>
        <strong>PF-VMC-042</strong>
      </div>
      <dl className="job-details">
        <div><dt>Quantity</dt><dd>12 parts</dd></div>
        <div><dt>Operation</dt><dd>Precision pocket milling</dd></div>
        <div><dt>Material</dt><dd>Aluminium 6061-T6</dd></div>
        <div><dt>Drawing revision</dt><dd>REV C</dd></div>
        <div><dt>CNC program</dt><dd className="mono">PF042_POCKET_REV_C.nc</dd></div>
        <div><dt>Fixture</dt><dd>4-jaw precision vise with soft jaws</dd></div>
        <div><dt>Work offset</dt><dd className="mono">G54</dd></div>
      </dl>
      <div className="panel-divider" />
      <div className="machine-card">
        <div className="machine-icon"><Factory size={20} /></div>
        <div>
          <span className="eyebrow">Machine</span>
          <strong>VMC-850</strong>
          <span>Vertical Machining Center</span>
        </div>
      </div>
    </aside>
  );
}

function App() {
  const [state, setState] = useState<WorkflowState>(defaultState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const callApi = async (fn: () => Promise<{ state: WorkflowState; message?: string; source?: 'api' | 'local' }>) => {
    setSaving(true);
    setError('');
    try {
      const result = await fn();
      setState(result.state);
      setConnected(result.source !== 'local');
      if (result.message) setNotice(result.message);
    } catch (caught) {
      setConnected(false);
      setError(caught instanceof Error ? caught.message : 'Unable to complete the requested action.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadWorkflow()
      .then(({ state: loaded, restored, source }) => {
        setState(loaded);
        setLoading(false);
        setConnected(source === 'api');
        if (restored) setNotice('State restored from the last operator session.');
      })
      .catch(() => {
        setError('The workflow could not be loaded. Starting with a new simulation.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (state.operationStatus !== 'RUNNING' || loading) return;
    const interval = window.setInterval(() => {
      advanceProgress()
        .then(result => {
          setState(result.state);
          if (result.source === 'local') setConnected(false);
        })
        .catch(() => { setConnected(false); });
    }, 1500);
    return () => window.clearInterval(interval);
  }, [state.operationStatus, loading]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const completion = useMemo(() => ({
    machine: state.machineChecks.filter(Boolean).length,
    tools: state.tools.filter(Boolean).length,
    workpiece: state.workpiece.filter(Boolean).length,
  }), [state]);

  const currentFlags = state.stage === 1 ? state.machineChecks : state.stage === 2 ? state.tools : state.workpiece;
  const currentItems = state.stage === 1 ? machineChecks : state.stage === 2 ? tools : workpieceItems;

  const firstUnconfirmedIndex = currentFlags.findIndex(item => !item);
  const activeIndex = selectedIndex !== null && selectedIndex >= 0 && selectedIndex < currentFlags.length
    ? selectedIndex
    : (firstUnconfirmedIndex !== -1 ? firstUnconfirmedIndex : 0);

  const allCurrentComplete = currentFlags.every(Boolean);

  const handleConfirmIndex = (indexToConfirm: number) => {
    if (state.stage < 1 || state.stage > 3 || indexToConfirm < 0 || currentFlags[indexToConfirm]) return;
    callApi(async () => {
      const res = await confirmCheck(state.stage, indexToConfirm);
      const nextFlags = [...currentFlags];
      nextFlags[indexToConfirm] = true;
      const nextUnconfirmed = nextFlags.findIndex(f => !f);
      setSelectedIndex(nextUnconfirmed !== -1 ? nextUnconfirmed : 0);
      return res;
    });
  };

  const handleNext = () => {
    setSelectedIndex(null);
    callApi(nextStage);
  };
  const handlePowerOn = () => callApi(powerOn);
  const handleStart = () => callApi(startOperation);
  const handleStop = () => callApi(stopOperation);

  const handleReset = async () => {
    if (!window.confirm('Reset all checks and return to POWER ON?')) return;
    setSaving(true);
    setError('');
    setSelectedIndex(null);
    try {
      const result = await resetWorkflow();
      setState(result.state);
      setConnected(true);
      setNotice(result.message || 'Workflow reset.');
    } catch (caught) {
      setConnected(false);
      setError(caught instanceof Error ? caught.message : 'Unable to reset the workflow.');
    } finally {
      setSaving(false);
    }
  };

  const stageIcon = state.stage === 1 ? <ShieldCheck size={22} /> : state.stage === 2 ? <Wrench size={22} /> : <Hammer size={22} />;
  const stageTitle = state.stage === 1 ? 'Machine checks' : state.stage === 2 ? 'Required tools' : 'Workpiece setup';

  const renderStage = () => {
    if (state.stage === 0) {
      return (
        <section className="instruction-card startup-card">
          <div className="stage-kicker"><span className="stage-number">01</span><span>STARTUP SEQUENCE</span></div>
          <div className="hero-icon power-icon"><Power size={52} /></div>
          <h1>Power on the machine</h1>
          <p className="instruction-lead">Verify the VMC-850 control is ready to begin the guided setup sequence.</p>
          <div className="startup-status">
            <StatusBadge label="POWER ON REQUIRED" tone="warning" />
            <span>Simulation control is waiting for operator input</span>
          </div>
          <ConfirmationButton label="POWER ON MACHINE" onClick={handlePowerOn} disabled={saving} icon={<Power size={22} />} />
        </section>
      );
    }
    if (state.stage === 4) return <ReadyReview completion={completion} onProceed={handleNext} />;
    if (state.stage === 5) return <Operation state={state} onStart={handleStart} onStop={handleStop} saving={saving} />;

    if (allCurrentComplete) {
      return (
        <section className="instruction-card">
          <div className="stage-kicker">
            <span className="stage-number">0{state.stage + 1}</span>
            <span>GUIDED CONFIRMATION</span>
            <span className="item-counter">ALL ITEMS CONFIRMED</span>
          </div>
          <SectionTitle icon={stageIcon} eyebrow={`STEP ${state.stage + 1} OF 6`} title={stageTitle} />
          <div className="current-item item-confirmed">
            <div className="item-status-icon"><CheckCircle2 size={34} /></div>
            <div className="item-copy">
              <span className="item-label">STAGE COMPLETE</span>
              <h1>All {currentFlags.length} items confirmed</h1>
              <StatusBadge label="READY TO PROCEED" tone="success" />
            </div>
          </div>
          <div className="checklist-drawer">
            <span className="eyebrow">CONFIRMED STAGE CHECKLIST</span>
            <div className="checklist-grid">
              {currentItems.map((it, idx) => (
                <div key={idx} className="checklist-row row-confirmed">
                  <CheckCircle2 size={18} className="row-icon-confirmed" />
                  <span className="row-text">{state.stage === 2 ? `${(it as typeof tools[number]).number}. ${(it as typeof tools[number]).type}` : (it as string)}</span>
                  <StatusBadge label="CONFIRMED" tone="success" />
                </div>
              ))}
            </div>
          </div>
          <div className="card-actions">
            <ConfirmationButton label={state.stage === 3 ? 'CONTINUE TO READY REVIEW' : 'NEXT STAGE'} onClick={handleNext} disabled={saving} tone="success" icon={<ChevronRight size={21} />} />
          </div>
          <div className="progress-detail">
            <div className="mini-progress"><span style={{ width: '100%' }} /></div>
            <span>{currentFlags.length} of {currentFlags.length} confirmed</span>
          </div>
        </section>
      );
    }

    const item = currentItems[activeIndex];
    const confirmed = currentFlags[activeIndex];
    const isTool = state.stage === 2;

    return (
      <section className="instruction-card">
        <div className="stage-kicker">
          <span className="stage-number">0{state.stage + 1}</span>
          <span>GUIDED CONFIRMATION</span>
          <span className="item-counter">ITEM {activeIndex + 1} / {currentFlags.length}</span>
        </div>
        <SectionTitle icon={stageIcon} eyebrow={`STEP ${state.stage + 1} OF 6`} title={stageTitle} />
        <div className={`current-item ${confirmed ? 'item-confirmed' : ''}`}>
          <div className="item-status-icon">
            {confirmed ? <CheckCircle2 size={34} /> : state.stage === 1 ? <ClipboardCheck size={34} /> : state.stage === 2 ? <Wrench size={34} /> : <Hammer size={34} />}
          </div>
          <div className="item-copy">
            {isTool ? (
              <>
                <span className="item-label">TOOL {(item as typeof tools[number]).number}</span>
                <h1>{(item as typeof tools[number]).type}</h1>
                <p>{(item as typeof tools[number]).purpose}</p>
              </>
            ) : (
              <>
                <span className="item-label">{state.stage === 1 ? 'MACHINE CHECK' : 'SETUP INSTRUCTION'}</span>
                <h1>{item as string}</h1>
              </>
            )}
            <StatusBadge label={confirmed ? (isTool ? 'TOOL CONFIRMED' : 'CONFIRMED') : (isTool ? 'TOOL NOT CONFIRMED' : 'AWAITING CONFIRMATION')} tone={confirmed ? 'success' : 'warning'} />
          </div>
        </div>
        {isTool && (
          <div className="tool-meta">
            <span><strong>PROGRAM</strong> PF042_POCKET_REV_C.nc</span>
            <span><strong>REVISION</strong> REV C</span>
          </div>
        )}
        {state.stage === 3 && (
          <div className="workpiece-strip">
            <span>Material <strong>Aluminium 6061-T6</strong></span>
            <span>Offset <strong>G54</strong></span>
            <span>Fixture <strong>Soft jaws</strong></span>
          </div>
        )}
        <div className="card-actions">
          <ConfirmationButton
            label={confirmed ? 'CONFIRMED' : isTool ? 'CONFIRM TOOL INSERTED' : state.stage === 1 ? 'CONFIRM CHECK' : 'CONFIRM SETUP'}
            onClick={() => handleConfirmIndex(activeIndex)}
            disabled={confirmed || saving}
            tone={confirmed ? 'success' : 'primary'}
            icon={confirmed ? <Check size={21} /> : <CheckCircle2 size={21} />}
          />
          {allCurrentComplete && (
            <ConfirmationButton label="NEXT STAGE" onClick={handleNext} disabled={saving} tone="success" icon={<ChevronRight size={21} />} />
          )}
        </div>
        <div className="checklist-drawer">
          <span className="eyebrow">STAGE CHECKLIST — SELECT ITEM TO VIEW / CONFIRM</span>
          <div className="checklist-grid">
            {currentItems.map((it, idx) => {
              const isConf = currentFlags[idx];
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={idx}
                  type="button"
                  className={`checklist-row ${isConf ? 'row-confirmed' : isSelected ? 'row-active' : 'row-pending'}`}
                  onClick={() => setSelectedIndex(idx)}
                >
                  {isConf ? <CheckCircle2 size={18} className="row-icon-confirmed" /> : isSelected ? <ChevronRight size={18} className="row-icon-active" /> : <Circle size={18} className="row-icon-pending" />}
                  <span className="row-text">{state.stage === 2 ? `T${(it as typeof tools[number]).number}: ${(it as typeof tools[number]).type}` : (it as string)}</span>
                  <StatusBadge label={isConf ? 'CONFIRMED' : isSelected ? 'ACTIVE' : 'PENDING'} tone={isConf ? 'success' : isSelected ? 'info' : 'neutral'} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="progress-detail">
          <div className="mini-progress"><span style={{ width: `${(currentFlags.filter(Boolean).length / currentFlags.length) * 100}%` }} /></div>
          <span>{currentFlags.filter(Boolean).length} of {currentFlags.length} confirmed</span>
        </div>
      </section>
    );
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-mark"><Gauge size={28} /></div>
        <strong>INITIALIZING CONTROL</strong>
        <span>Loading workflow state…</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Cog size={21} /></div>
          <div>
            <strong>PRIMEFORM LABS</strong>
            <span>VMC OPERATOR HMI</span>
          </div>
        </div>
        <div className="header-meta">
          <div className="machine-name"><span className="eyebrow">MACHINE</span><strong>VMC-850</strong></div>
          <div className="job-chip"><span className="eyebrow">JOB</span><strong>PF-VMC-042</strong></div>
          <StatusBadge label={connected ? 'CONTROL ONLINE' : 'OFFLINE MODE'} tone={connected ? 'success' : 'warning'} />
          <button className="reset-button" onClick={handleReset} disabled={saving}><RotateCcw size={16} /> Reset workflow</button>
        </div>
      </header>
      <main>
        <div className="control-bar">
          <div><span className="eyebrow">STARTUP & OPERATION WORKFLOW</span><h1>Operator sequence</h1></div>
          <div className="step-count">Step <strong>{state.stage + 1}</strong> of 6</div>
        </div>
        <ProgressStepper stage={state.stage} />
        {(notice || error) && (
          <div className={`feedback ${error ? 'feedback-error' : 'feedback-success'}`} role="status">
            {error ? <TriangleAlert size={18} /> : <CheckCircle2 size={18} />}
            <span>{error || notice}</span>
            <button onClick={() => { setNotice(''); setError(''); }} aria-label="Dismiss message"><XCircle size={17} /></button>
          </div>
        )}
        <div className="content-grid">
          <div className="main-column">{renderStage()}</div>
          <JobPanel />
        </div>
      </main>
      <footer>
        <span>Simulation mode — no machine hardware connected</span>
        <span>Last updated: {new Date(state.updatedAt).toLocaleString()}</span>
      </footer>
    </div>
  );
}

function ReadyReview({ completion, onProceed }: { completion: { machine: number; tools: number; workpiece: number }; onProceed: () => void }) {
  return (
    <section className="instruction-card review-card">
      <div className="stage-kicker"><span className="stage-number">05</span><span>FINAL VERIFICATION</span></div>
      <SectionTitle icon={<ShieldCheck size={22} />} eyebrow="STEP 5 OF 6" title="Ready review" />
      <div className="ready-panel">
        <CheckCircle2 size={30} />
        <div>
          <strong>SYSTEM READY</strong>
          <span>All machine, tooling, and workpiece checks are complete.</span>
        </div>
      </div>
      <div className="review-grid">
        <div><span>Machine checks</span><strong>{completion.machine} of 6 completed</strong></div>
        <div><span>Required tools</span><strong>{completion.tools} of 5 completed</strong></div>
        <div><span>Workpiece setup</span><strong>{completion.workpiece} of 8 completed</strong></div>
      </div>
      <div className="review-summary">
        <span className="eyebrow">JOB SUMMARY</span>
        <div>
          <span>Job ID <strong>PF-VMC-042</strong></span>
          <span>Operation <strong>Precision pocket milling</strong></span>
          <span>Quantity <strong>12 parts</strong></span>
          <span>Program <strong className="mono">PF042_POCKET_REV_C.nc</strong></span>
          <span>Revision <strong>REV C</strong></span>
          <span>Offset <strong className="mono">G54</strong></span>
        </div>
      </div>
      <ConfirmationButton label="PROCEED TO OPERATION" onClick={onProceed} tone="success" icon={<ChevronRight size={22} />} />
    </section>
  );
}

function Operation({ state, onStart, onStop, saving }: { state: WorkflowState; onStart: () => void; onStop: () => void; saving: boolean }) {
  const running = state.operationStatus === 'RUNNING';
  const stopped = state.operationStatus === 'STOPPED';
  const cycleComplete = state.operationProgress >= 100;

  return (
    <section className="instruction-card operation-card">
      <div className="stage-kicker"><span className="stage-number">06</span><span>SIMULATION CONTROL</span></div>
      <SectionTitle icon={<Gauge size={22} />} eyebrow="STEP 6 OF 6" title="Operation" />
      <div className={`operation-status status-${running ? 'running' : cycleComplete ? 'ready' : stopped ? 'stopped' : 'ready'}`}>
        <div className="operation-orb">
          {running ? <Play size={28} fill="currentColor" /> : cycleComplete ? <CheckCircle2 size={28} /> : stopped ? <Pause size={28} /> : <Circle size={28} />}
        </div>
        <div>
          <span className="eyebrow">OPERATION STATUS</span>
          <strong>{running ? 'RUNNING' : cycleComplete ? 'CYCLE COMPLETE' : stopped ? 'STOPPED' : 'READY'}</strong>
          <span>
            {running
              ? 'Simulation is active. Monitor progress before stopping.'
              : cycleComplete
              ? 'Machining cycle finished successfully at 100%. Ready for next part.'
              : stopped
              ? 'Operation is paused for operator review.'
              : 'All setup requirements are satisfied.'}
          </span>
        </div>
      </div>
      <div className="operation-facts">
        <div><span>Operation</span><strong>Precision pocket milling</strong></div>
        <div><span>Machine</span><strong>VMC-850</strong></div>
        <div><span>Job / quantity</span><strong>PF-VMC-042 / 12 parts</strong></div>
        <div><span>CNC program</span><strong className="mono">PF042_POCKET_REV_C.nc</strong></div>
      </div>
      <div className="run-progress">
        <div><span>SIMULATED CYCLE PROGRESS</span><strong>{state.operationProgress}%</strong></div>
        <div className="progress-track"><span style={{ width: `${state.operationProgress}%` }} /></div>
        <span className="progress-caption">
          {running ? 'Cycle in progress' : cycleComplete ? 'Cycle complete (100%)' : stopped ? 'Cycle stopped by operator' : 'Ready to begin cycle'}
        </span>
      </div>
      {running ? (
        <ConfirmationButton label="STOP OPERATION" onClick={onStop} disabled={saving} tone="danger" icon={<Square size={20} fill="currentColor" />} />
      ) : (
        <ConfirmationButton
          label={cycleComplete ? 'RESTART CYCLE' : stopped ? 'RESUME OPERATION' : 'START OPERATION'}
          onClick={onStart}
          disabled={saving}
          tone={cycleComplete ? 'primary' : stopped ? 'warning' : 'success'}
          icon={<Play size={21} fill="currentColor" />}
        />
      )}
    </section>
  );
}

export default App;

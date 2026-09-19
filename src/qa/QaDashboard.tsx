import { useEffect, useMemo, useState } from "react";
import { approveQaRun, createQaRun, loadQaDashboard, loadQaRun, platformLabel, updateQaResult } from "./testManagement";
import type { QaResultStatus, QaRunGroup, QaTestCase, QaTestResult, QaTestRun } from "./types";

const completeStatuses: QaResultStatus[] = ["passed", "skipped"];

function resultLabel(status: QaResultStatus) {
  return status === "not_run" ? "Not run" : status.charAt(0).toUpperCase() + status.slice(1);
}

export function QaDashboard() {
  const [cases, setCases] = useState<QaTestCase[]>([]);
  const [runs, setRuns] = useState<QaTestRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<QaTestRun | null>(null);
  const [groups, setGroups] = useState<QaRunGroup[]>([]);
  const [results, setResults] = useState<QaTestResult[]>([]);
  const [name, setName] = useState("");
  const [stagingUrl, setStagingUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const next = await loadQaDashboard();
    setCases(next.cases);
    setRuns(next.runs);
  };

  const selectRun = async (run: QaTestRun) => {
    setBusy(true);
    setError(null);
    try {
      const details = await loadQaRun(run.id);
      setSelectedRun(details.run);
      setGroups(details.groups);
      setResults(details.results);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this test run");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void refresh().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load QA data")); }, []);

  const casesById = useMemo(() => new Map(cases.map((testCase) => [testCase.id, testCase])), [cases]);
  const readyForApproval = results.length > 0 && results.every((result) => completeStatuses.includes(result.status));

  const createRun = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const run = await createQaRun({ name: name.trim() || `Staging QA ${new Date().toLocaleDateString()}`, stagingUrl: stagingUrl.trim() }, cases);
      await refresh();
      await selectRun(run);
      setName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the test run");
    } finally {
      setBusy(false);
    }
  };

  const setResultStatus = async (result: QaTestResult, status: QaResultStatus) => {
    setBusy(true);
    setError(null);
    try {
      await updateQaResult(result.id, status);
      if (selectedRun) await selectRun(selectedRun);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the result");
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!selectedRun || !readyForApproval) return;
    setBusy(true);
    try {
      await approveQaRun(selectedRun.id);
      await refresh();
      await selectRun(selectedRun);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve this run");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="qa">
      <header className="qa__header">
        <div>
          <p className="qa__eyebrow">Admin only</p>
          <h1>QA test management</h1>
          <p>Run versioned Desktop and iPad checks against staging, then record a release sign-off.</p>
        </div>
      </header>

      {error && <p className="charts__error">{error}</p>}

      <section className="qa__card">
        <h2>Create a staging run</h2>
        <form className="qa__create" onSubmit={(event) => void createRun(event)}>
          <label>Run name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Staging release" /></label>
          <label>Staging URL<input type="url" value={stagingUrl} onChange={(event) => setStagingUrl(event.target.value)} placeholder="https://staging.example.com" /></label>
          <button className="btn btn--primary" disabled={busy || cases.length === 0}>Create Desktop + iPad run</button>
        </form>
        {!cases.length && <p className="qa__hint">No active test cases are synced yet. Add Markdown cases under <code>manual-tests/</code> and run the sync workflow.</p>}
      </section>

      <section className="qa__grid">
        <section className="qa__card">
          <h2>Recent runs</h2>
          <div className="qa__runList">
            {runs.map((run) => (
              <button key={run.id} type="button" className="qa__run" data-selected={selectedRun?.id === run.id} onClick={() => void selectRun(run)}>
                <span><strong>{run.name}</strong><small>{new Date(run.created_at).toLocaleString()}</small></span>
                <span className="qa__status" data-status={run.status}>{run.status}</span>
              </button>
            ))}
            {!runs.length && <p className="qa__hint">No staging runs yet.</p>}
          </div>
        </section>

        <section className="qa__card qa__execution">
          {!selectedRun && <p className="qa__hint">Choose a run to execute its test matrix.</p>}
          {selectedRun && (
            <>
              <div className="qa__executionHead">
                <div><h2>{selectedRun.name}</h2><p>{selectedRun.staging_url || "No staging URL recorded"}</p></div>
                <button type="button" className="btn btn--primary" disabled={busy || !readyForApproval || selectedRun.status === "approved"} onClick={() => void approve()}>
                  {selectedRun.status === "approved" ? "Approved" : "Approve sign-off"}
                </button>
              </div>
              {!readyForApproval && <p className="qa__hint">Every required case must be Passed or Skipped before sign-off.</p>}
              {groups.map((group) => <RunGroup key={group.id} group={group} results={results} casesById={casesById} busy={busy} onStatus={setResultStatus} />)}
            </>
          )}
        </section>
      </section>
    </main>
  );
}

function RunGroup({ group, results, casesById, busy, onStatus }: { group: QaRunGroup; results: QaTestResult[]; casesById: Map<string, QaTestCase>; busy: boolean; onStatus: (result: QaTestResult, status: QaResultStatus) => Promise<void> }) {
  const groupResults = results.filter((result) => result.test_run_group_id === group.id);
  return (
    <section className="qa__group">
      <h3>{group.name} <span>{platformLabel[group.platform]}</span></h3>
      {groupResults.map((result) => {
        const testCase = casesById.get(result.test_case_id);
        if (!testCase) return null;
        return <div className="qa__case" key={result.id}>
          <div><strong>{testCase.id} · {testCase.title}</strong><small>{testCase.priority} · {testCase.component}</small></div>
          <div className="qa__resultActions">
            {(["passed", "failed", "blocked", "skipped"] as QaResultStatus[]).map((status) => <button key={status} type="button" disabled={busy} data-active={result.status === status} data-status={status} onClick={() => void onStatus(result, status)}>{resultLabel(status)}</button>)}
          </div>
        </div>;
      })}
      {!groupResults.length && <p className="qa__hint">No cases apply to this platform.</p>}
    </section>
  );
}

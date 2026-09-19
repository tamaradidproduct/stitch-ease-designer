import { useEffect, useMemo, useState } from "react";
import { addResultAttachment, addResultComment, approveQaRun, createQaIssue, createQaRun, getResultAttachmentUrl, loadQaDashboard, loadQaRun, loadResultFinding, platformLabel, syncQaIssueComment, updateQaResult } from "./testManagement";
import type { QaRequirement, QaResultAttachment, QaResultComment, QaResultStatus, QaRunGroup, QaTestCase, QaTestCaseRequirement, QaTestResult, QaTestRun } from "./types";

const completeStatuses: QaResultStatus[] = ["passed", "skipped"];

function resultLabel(status: QaResultStatus) {
  return status === "not_run" ? "Not run" : status.charAt(0).toUpperCase() + status.slice(1);
}

export function QaDashboard() {
  const [cases, setCases] = useState<QaTestCase[]>([]);
  const [requirements, setRequirements] = useState<QaRequirement[]>([]);
  const [links, setLinks] = useState<QaTestCaseRequirement[]>([]);
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
    setRequirements(next.requirements);
    setLinks(next.links);
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
  const requirementsByCase = useMemo(() => links.reduce<Map<string, string[]>>((map, link) => {
    map.set(link.test_case_id, [...(map.get(link.test_case_id) ?? []), link.requirement_id]);
    return map;
  }, new Map()), [links]);
  const readyForApproval = results.length > 0 && results.every((result) => !casesById.has(result.test_case_id) || completeStatuses.includes(result.status));

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

      <section className="qa__card qa__traceability">
        <h2>Requirements</h2>
        <p className="qa__hint">Synced from <code>docs/PRD.md</code>. Each FR/DNT item is a requirement row.</p>
        <div className="qa__tableWrap"><table><thead><tr><th>ID</th><th>Feature</th><th>Requirement</th></tr></thead><tbody>
          {requirements.map((requirement) => <tr key={requirement.id}><td>{requirement.id}</td><td>{requirement.feature}</td><td>{requirement.requirement_text}</td></tr>)}
        </tbody></table></div>
      </section>

      <section className="qa__card qa__traceability">
        <h2>Test cases</h2>
        <div className="qa__tableWrap"><table><thead><tr><th>Feature</th><th>Preconditions</th><th>Steps</th><th>Expected Result</th><th>Modifier / Input</th></tr></thead><tbody>
          {cases.map((testCase) => <tr key={testCase.id}><td>{testCase.component}<small>{testCase.id} · {testCase.title}</small><small>Requirements: {requirementsByCase.get(testCase.id)?.join(", ") || "Unlinked"}</small></td><td>{testCase.preconditions}</td><td>{testCase.steps}</td><td>{testCase.expected_result}</td><td>{testCase.modifier_input || "—"}</td></tr>)}
        </tbody></table></div>
      </section>

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
              <button key={run.id} type="button" className="qa__run" disabled={busy} data-selected={selectedRun?.id === run.id} onClick={() => void selectRun(run)}>
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
              {groups.map((group) => <RunGroup key={group.id} group={group} results={results} casesById={casesById} busy={busy || selectedRun.status === "approved"} onStatus={setResultStatus} />)}
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
        return <div className="qa__case qa__case--result" key={result.id}>
          <div><strong>{testCase.id} · {testCase.title}</strong><small>{testCase.priority} · {testCase.component}</small><ResultFinding result={result} disabled={busy} /></div>
          <div className="qa__resultActions">
            {(["passed", "failed", "blocked", "skipped"] as QaResultStatus[]).map((status) => <button key={status} type="button" disabled={busy} data-active={result.status === status} data-status={status} onClick={() => void onStatus(result, status)}>{resultLabel(status)}</button>)}
          </div>
        </div>;
      })}
      {!groupResults.length && <p className="qa__hint">No cases apply to this platform.</p>}
    </section>
  );
}

function ResultFinding({ result, disabled }: { result: QaTestResult; disabled: boolean }) {
  const [comments, setComments] = useState<QaResultComment[]>([]);
  const [attachments, setAttachments] = useState<QaResultAttachment[]>([]);
  const [comment, setComment] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const finding = await loadResultFinding(result.id);
    setComments(finding.comments);
    setAttachments(finding.attachments);
  };

  const toggle = async () => {
    setExpanded((value) => !value);
    if (!expanded) {
      try { await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load feedback"); }
    }
  };

  const saveComment = async () => {
    if (!comment.trim()) return;
    setBusy(true); setError(null);
    try {
      const savedComment = comment.trim();
      await addResultComment(result.id, savedComment);
      if (result.github_issue_url) await syncQaIssueComment(result.id, savedComment);
      setComment(""); await refresh();
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save comment"); }
    finally { setBusy(false); }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError(null);
    try { await addResultAttachment(result.id, file); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not attach file"); }
    finally { setBusy(false); }
  };

  const openAttachment = async (attachment: QaResultAttachment) => {
    try { window.open(await getResultAttachmentUrl(attachment.storage_path), "_blank", "noopener,noreferrer"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not open attachment"); }
  };

  const createIssue = async () => {
    setBusy(true); setError(null);
    try { window.open((await createQaIssue(result.id)).url, "_blank", "noopener,noreferrer"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create GitHub issue"); }
    finally { setBusy(false); }
  };

  return <div className="qa__finding">
    <button type="button" className="qa__feedbackToggle" onClick={() => void toggle()}>{expanded ? "Hide feedback" : "Add feedback"}</button>
    {expanded && <div className="qa__feedback">
      {error && <small className="qa__feedbackError">{error}</small>}
      {comments.map((item) => <p key={item.id} className="qa__comment">{item.body}</p>)}
      <div className="qa__feedbackInput"><input value={comment} disabled={disabled || busy} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment" /><button type="button" disabled={disabled || busy || !comment.trim()} onClick={() => void saveComment()}>Save</button></div>
      <label className="qa__attachment">Attach file<input type="file" disabled={disabled || busy} accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => void upload(event.target.files?.[0])} /></label>
      {attachments.map((attachment) => <button key={attachment.id} type="button" className="qa__attachmentLink" onClick={() => void openAttachment(attachment)}>{attachment.file_name}</button>)}
      {(result.status === "failed" || result.status === "blocked") && !result.github_issue_url && <button type="button" className="qa__issue" disabled={disabled || busy} onClick={() => void createIssue()}>Create GitHub issue</button>}
      {result.github_issue_url && <a href={result.github_issue_url} target="_blank" rel="noreferrer">GitHub issue #{result.github_issue_number}</a>}
    </div>}
  </div>;
}

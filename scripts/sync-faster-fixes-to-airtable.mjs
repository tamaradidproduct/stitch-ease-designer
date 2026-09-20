const FASTER_FIXES_API = "https://www.faster-fixes.com/api/v1/agent";
const AIRTABLE_API = "https://api.airtable.com/v0";

export const FINDINGS_FIELDS = {
  summary: "fldU8zm0HWOfPi2II",
  status: "fldxtq8EJNyJPd7Kq",
  observedBehavior: "fldl9xyDRDPl39HLP",
  reproductionNotes: "fldWiFh70faNsu8Sk",
  evidence: "fldtPuSroKpM8ObCV",
  fasterFixesId: "fldpnTEPYheW6hBBa",
  pageUrl: "fld5I0aTFBFwtQGbf",
  reviewer: "fldYeI2d7Vu1tzIhT",
  reportedAt: "fldLzZ03wlurcmA5V",
};

const STATUS_MAP = {
  new: "New",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Archived",
};

function requireValue(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function compactText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function summarize(comment) {
  const normalized = compactText(comment).replace(/\s+/g, " ");
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 117)}…`;
}

function buildReproductionNotes(feedback) {
  const browser = [feedback.browserName, feedback.browserVersion].filter(Boolean).join(" ");
  const viewport =
    feedback.viewportWidth && feedback.viewportHeight
      ? `${feedback.viewportWidth} × ${feedback.viewportHeight}`
      : "";
  const click =
    typeof feedback.clickX === "number" && typeof feedback.clickY === "number"
      ? `${feedback.clickX}, ${feedback.clickY}`
      : "";

  return [
    ["Selector", feedback.selector],
    ["Browser", browser],
    ["OS", feedback.os],
    ["Viewport", viewport],
    ["Click coordinates", click],
  ]
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

export function feedbackToFields(feedback) {
  const id = requireValue(compactText(feedback.id), "feedback.id");
  const comment = compactText(feedback.comment) || "Faster Fixes feedback";
  const fields = {
    [FINDINGS_FIELDS.summary]: summarize(comment),
    [FINDINGS_FIELDS.status]: STATUS_MAP[feedback.status] ?? "New",
    [FINDINGS_FIELDS.observedBehavior]: comment,
    [FINDINGS_FIELDS.fasterFixesId]: id,
  };

  const reproductionNotes = buildReproductionNotes(feedback);
  if (reproductionNotes) fields[FINDINGS_FIELDS.reproductionNotes] = reproductionNotes;
  if (feedback.pageUrl) fields[FINDINGS_FIELDS.pageUrl] = feedback.pageUrl;
  if (feedback.reviewerName) fields[FINDINGS_FIELDS.reviewer] = feedback.reviewerName;
  if (feedback.createdAt) fields[FINDINGS_FIELDS.reportedAt] = feedback.createdAt;
  if (feedback.screenshotUrl) {
    fields[FINDINGS_FIELDS.evidence] = [
      { url: feedback.screenshotUrl, filename: `faster-fixes-${id}.png` },
    ];
  }

  return fields;
}

export async function fetchFeedback({ token, projectId, fetchImpl = fetch }) {
  const url = new URL(`${FASTER_FIXES_API}/feedbacks`);
  url.searchParams.set("project", projectId);

  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Faster Fixes request failed (${response.status}): ${await response.text()}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload.feedbacks)) {
    throw new Error("Faster Fixes returned an unexpected response");
  }
  return payload.feedbacks;
}

export async function upsertFindings({
  token,
  baseId,
  tableId,
  feedback,
  fetchImpl = fetch,
}) {
  let synced = 0;
  for (let index = 0; index < feedback.length; index += 10) {
    const batch = feedback.slice(index, index + 10);
    const response = await fetchImpl(`${AIRTABLE_API}/${baseId}/${tableId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: [FINDINGS_FIELDS.fasterFixesId] },
        typecast: true,
        records: batch.map((item) => ({ fields: feedbackToFields(item) })),
      }),
    });
    if (!response.ok) {
      throw new Error(`Airtable request failed (${response.status}): ${await response.text()}`);
    }
    synced += batch.length;
  }
  return synced;
}

export async function runSync({ env = process.env, fetchImpl = fetch } = {}) {
  const fasterFixesToken = requireValue(
    env.FASTER_FIXES_AGENT_TOKEN,
    "FASTER_FIXES_AGENT_TOKEN",
  );
  const projectId = requireValue(env.FASTER_FIXES_PROJECT_ID, "FASTER_FIXES_PROJECT_ID");
  const airtableToken = requireValue(env.AIRTABLE_TOKEN, "AIRTABLE_TOKEN");
  const baseId = requireValue(env.AIRTABLE_BASE_ID, "AIRTABLE_BASE_ID");
  const tableId = requireValue(env.AIRTABLE_TABLE_ID, "AIRTABLE_TABLE_ID");

  const feedback = await fetchFeedback({
    token: fasterFixesToken,
    projectId,
    fetchImpl,
  });
  const synced = await upsertFindings({
    token: airtableToken,
    baseId,
    tableId,
    feedback,
    fetchImpl,
  });
  return { fetched: feedback.length, synced };
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  runSync()
    .then(({ fetched, synced }) => {
      console.log(`Faster Fixes sync complete: fetched ${fetched}, synced ${synced}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

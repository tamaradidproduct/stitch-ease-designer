import assert from "node:assert/strict";
import test from "node:test";
import {
  FINDINGS_FIELDS,
  feedbackToFields,
  runSync,
  upsertFindings,
} from "./sync-faster-fixes-to-airtable.mjs";

test("maps Faster Fixes feedback into the Findings schema", () => {
  const fields = feedbackToFields({
    id: "feedback-123",
    status: "in_progress",
    comment: "The save button overlaps the toolbar on a narrow screen.",
    pageUrl: "https://staging.designer.stitch-ease.com/#/c/chart-1",
    selector: "button.save",
    clickX: 420,
    clickY: 700,
    browserName: "Safari",
    browserVersion: "19",
    os: "iOS",
    viewportWidth: 430,
    viewportHeight: 932,
    screenshotUrl: "https://example.com/screenshot.png",
    reviewerName: "Tamara",
    createdAt: "2026-09-20T04:00:00.000Z",
  });

  assert.equal(fields[FINDINGS_FIELDS.fasterFixesId], "feedback-123");
  assert.equal(fields[FINDINGS_FIELDS.status], "In progress");
  assert.equal(fields[FINDINGS_FIELDS.reviewer], "Tamara");
  assert.equal(fields[FINDINGS_FIELDS.pageUrl], "https://staging.designer.stitch-ease.com/#/c/chart-1");
  assert.deepEqual(fields[FINDINGS_FIELDS.evidence], [
    { url: "https://example.com/screenshot.png", filename: "faster-fixes-feedback-123.png" },
  ]);
  assert.match(fields[FINDINGS_FIELDS.reproductionNotes], /Viewport: 430 × 932/);
});

test("upserts in Airtable batches of ten", async () => {
  const requests = [];
  const feedback = Array.from({ length: 11 }, (_, index) => ({
    id: `feedback-${index}`,
    status: "new",
    comment: `Feedback ${index}`,
  }));

  const synced = await upsertFindings({
    token: "airtable-token",
    baseId: "appBase",
    tableId: "tblFindings",
    feedback,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ records: [] }), { status: 200 });
    },
  });

  assert.equal(synced, 11);
  assert.equal(requests.length, 2);
  assert.equal(JSON.parse(requests[0].init.body).records.length, 10);
  assert.deepEqual(JSON.parse(requests[0].init.body).performUpsert, {
    fieldsToMergeOn: [FINDINGS_FIELDS.fasterFixesId],
  });
});

test("runs the complete fetch and upsert flow", async () => {
  const requests = [];
  const result = await runSync({
    env: {
      FASTER_FIXES_AGENT_TOKEN: "ff-agent-token",
      FASTER_FIXES_PROJECT_ID: "proj-test",
      AIRTABLE_TOKEN: "airtable-token",
      AIRTABLE_BASE_ID: "appBase",
      AIRTABLE_TABLE_ID: "tblFindings",
    },
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).includes("faster-fixes.com")) {
        return new Response(
          JSON.stringify({ feedbacks: [{ id: "feedback-1", status: "new", comment: "Test" }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ records: [] }), { status: 200 });
    },
  });

  assert.deepEqual(result, { fetched: 1, synced: 1 });
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /project=proj-test/);
  assert.equal(requests[0].init.headers.Authorization, "Bearer ff-agent-token");
  assert.equal(requests[1].init.headers.Authorization, "Bearer airtable-token");
});

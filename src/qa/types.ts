export type QaPlatform = "desktop" | "ipad";
export type QaResultStatus = "not_run" | "passed" | "failed" | "blocked" | "skipped";
export type QaRunStatus = "draft" | "active" | "passed" | "failed" | "blocked" | "approved";

export type QaTestCase = {
  id: string;
  title: string;
  priority: "P0" | "P1" | "P2" | "P3";
  component: string;
  platforms: QaPlatform[];
  tags: string[];
  source_path: string;
  active: boolean;
  preconditions: string;
  steps: string;
  expected_result: string;
  modifier_input: string;
};

export type QaRequirement = { id: string; feature: string; requirement_text: string; active: boolean };
export type QaTestCaseRequirement = { test_case_id: string; requirement_id: string };
export type QaResultComment = { id: string; test_result_id: string; body: string; created_at: string };
export type QaResultAttachment = { id: string; test_result_id: string; storage_path: string; file_name: string; mime_type: string; created_at: string };

export type QaTestRun = {
  id: string;
  name: string;
  environment: string;
  build_sha: string | null;
  staging_url: string | null;
  status: QaRunStatus;
  created_at: string;
  approved_at: string | null;
};

export type QaRunGroup = {
  id: string;
  test_run_id: string;
  name: string;
  platform: QaPlatform;
  sort_order: number;
};

export type QaTestResult = {
  id: string;
  test_run_id: string;
  test_run_group_id: string;
  test_case_id: string;
  status: QaResultStatus;
  notes: string;
  evidence_url: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  updated_at: string;
};

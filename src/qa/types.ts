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
};

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
  updated_at: string;
};

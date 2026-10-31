/**
 * Mobile approval policy switches (M8 E9-5).
 *
 * Two product questions are still open. The phone ships with the
 * conservative answer for both; flip a switch here to change behaviour.
 * Each switch is covered by unit tests in __tests__/services/approvalPolicy.test.ts.
 */
export const approvalPolicy = {
  /**
   * After a Plan is approved on the phone, start execution right away?
   *
   * `false` (default): the phone only records the approval and tells the user
   * to start execution from CSBU WorkMate on the desktop.
   *
   * `true`: the phone also calls `POST /api/task-sessions/{id}/execute`.
   * NOTE: Core's device-token scope currently denies `/execute`, so turning
   * this on also needs a Core scope change; until then the call fails with
   * 403 and the phone falls back to the desktop hint.
   */
  autoExecutePlanAfterApproval: false,

  /**
   * Allow approving an agent action whose summary Core had to truncate
   * (~4000 chars)?
   *
   * `false` (default): the phone shows the truncated summary read-only, hides
   * "Approve" (deny stays available) and asks the user to approve on desktop,
   * where the full request is visible.
   *
   * `true`: approve is allowed even when the summary is truncated.
   */
  allowApproveTruncatedAgentSummary: false,
};

export type ApprovalPolicy = typeof approvalPolicy;

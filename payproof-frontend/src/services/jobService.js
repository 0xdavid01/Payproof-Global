import { request } from "./api.js";

/**
 * Create a job (client).
 * payload: { title, description, budget, currency, deadline, participantEmail }
 * currency: "NEAR" | "USDT" (PaymentCurrency enum)
 * deadline format: "2026-12-20T18:00:00"
 */
export const createJob = (payload) =>
  request("/api/jobs", { method: "POST", body: payload });

/**
 * Upload the PRD (client). PDF only.
 * The backend stores it, extracts the text, generates the checklist with DeepSeek
 * and returns the updated job. Do NOT call a separate checklist endpoint.
 */
export const uploadPrd = (jobId, file) => {
  const form = new FormData();
  form.append("file", file);
  return request(`/api/jobs/${jobId}/prd`, {
    method: "POST",
    body: form,
    isForm: true,
  });
};

export const getClientJobs = () => request("/api/jobs/client");

export const getFreelancerJobs = () => request("/api/jobs/freelancer");

export const reconcileEscrowRelease = (jobId) =>
  request(`/api/escrows/jobs/${encodeURIComponent(jobId)}/reconcile-release`, {
    method: "POST",
  });

// Returns the job, including its requirements and contract info.
export const getJob = (jobId) => request(`/api/jobs/${jobId}`);

/**
 * Approve the (optionally edited) checklist (client).
 * requirements: [{ isDone: false, condition: "..." }]
 */
export const approveChecklist = (jobId, requirements) =>
  request(`/api/jobs/${jobId}/checklist/approve`, {
    method: "PUT",
    body: { requirements },
  });

/**
 * Update checklist completion states (client only).
 * requirements: [{ isDone: true, condition: "..." }]
 *
 * This does not approve the agreement.
 */
export const updateChecklistProgress = (jobId, requirements) =>
  request(`/api/jobs/${jobId}/checklist/progress`, {
    method: "PUT",
    body: { requirements },
  });

// Freelancer invitation. No request body.
export const acceptInvitation = (jobId) =>
  request(`/api/jobs/${jobId}/invitation/accept`, { method: "POST" });

export const declineInvitation = (jobId) =>
  request(`/api/jobs/${jobId}/invitation/decline`, { method: "POST" });

/**
 * Change the job's budget and currency (client only).
 * Allowed until both parties approve the contract. Clears existing approvals and
 * returns the job to PENDING_AGREEMENT. Resolves to the updated job.
 */
export const updateFinancialTerms = (jobId, { budget, currency }) =>
  request(`/api/jobs/${jobId}/financial-terms`, {
    method: "PUT",
    body: { budget, currency },
  });
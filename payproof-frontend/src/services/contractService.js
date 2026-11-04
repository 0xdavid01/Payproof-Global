import { request } from "./api.js";

export const getContractDownloadUrl = (jobId) =>
  request(`/api/jobs/${encodeURIComponent(jobId)}/contract/download-url`);

// Freelancer uploads their own agreement. PDF only.
export const uploadContract = (jobId, file) => {
  const form = new FormData();
  form.append("file", file);
  return request(`/api/jobs/${jobId}/contract`, {
    method: "POST",
    body: form,
    isForm: true,
  });
};

// Client asks for changes.
export const requestContractChanges = (jobId, reason) =>
  request(`/api/jobs/${jobId}/contract/request-changes`, {
    method: "POST",
    body: { reason },
  });

// Client or freelancer approves the current version. No request body.
// Both parties must approve the same version before it becomes approved.
export const approveContract = (jobId) =>
  request(`/api/jobs/${jobId}/contract/approve`, { method: "POST" });
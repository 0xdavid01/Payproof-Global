import { request } from "./api.js";

/**
 * Freelancer submits work.
 * multipart/form-data with an optional file, externalUrl and notes.
 * At least one of file or externalUrl is required: the backend answers 400 otherwise.
 * Resolves to the created submission version.
 */
export const submitWork = (jobId, { file, externalUrl, notes }) => {
  const form = new FormData();

  if (file) form.append("file", file);
  if (externalUrl) form.append("externalUrl", externalUrl);
  if (notes) form.append("notes", notes);

  return request(`/api/jobs/${encodeURIComponent(jobId)}/submissions`, {
    method: "POST",
    body: form,
    isForm: true,
  });
};

export const getSubmissions = (jobId) =>
  request(`/api/jobs/${encodeURIComponent(jobId)}/submissions`);

/**
 * Client saves itemized review progress or reviews one submission version.
 * payload: {
 *   status,                       // "PENDING" saves progress; final decisions include "ACCEPTED"
 *   feedback,
 *   requirements: [{ requirementPosition, status, feedback }]
 * }
 */
export const reviewSubmission = (jobId, versionId, payload) =>
  request(
    `/api/jobs/${encodeURIComponent(jobId)}/submissions/${encodeURIComponent(versionId)}/review`,
    { method: "POST", body: payload }
  );
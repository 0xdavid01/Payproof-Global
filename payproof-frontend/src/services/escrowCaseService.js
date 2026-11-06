import { request } from "./api.js";

const jobPath = (jobId) => `/api/escrows/jobs/${encodeURIComponent(jobId)}`;

export const raiseEscrowDispute = (jobId, { reason, transactionHash }) =>
  request(`${jobPath(jobId)}/disputes`, {
    method: "POST",
    body: { reason, transactionHash },
  });

export const requestEscrowRefund = (jobId, { reason, transactionHash }) =>
  request(`${jobPath(jobId)}/refund-requests`, {
    method: "POST",
    body: { reason, transactionHash },
  });

export const getEscrowDisputeCase = (jobId) =>
  request(`${jobPath(jobId)}/dispute-case`);

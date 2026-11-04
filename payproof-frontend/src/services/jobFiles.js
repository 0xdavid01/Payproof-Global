// Private storage addresses can't be opened by a browser. Files are served through
// authenticated backend routes instead, unless the job already carries a usable link.

const STORAGE_HOST = /(\.r2\.cloudflarestorage\.com|\.amazonaws\.com)/i;
const SIGNED = /[?&](X-Amz-Signature|Signature)=/i;

export const contractFileRoute = (jobId) =>
  `/api/jobs/${encodeURIComponent(jobId)}/contract/file`;

export const prdFileRoute = (jobId) => `/api/jobs/${encodeURIComponent(jobId)}/prd/file`;

// A link is usable directly when it isn't a storage address, or when it is a signed one.
function isUsableDirect(url) {
  if (!url || typeof url !== "string") return false;
  if (!STORAGE_HOST.test(url)) return true;
  return SIGNED.test(url);
}

// kind: "contract" | "prd"
export function resolveFileUrl(kind, jobId, rawUrl) {
  if (isUsableDirect(rawUrl)) return rawUrl;
  return kind === "prd" ? prdFileRoute(jobId) : contractFileRoute(jobId);
}

function unwrapJob(data) {
  let value = data;

  for (let i = 0; i < 4 && value && !Array.isArray(value); i++) {
    if (value.job && typeof value.job === "object") {
      value = value.job;
    } else if (
      value.data &&
      typeof value.data === "object" &&
      !Array.isArray(value.data)
    ) {
      value = value.data;
    } else {
      break;
    }
  }

  return value || {};
}

export function getJobId(job) {
  const value = unwrapJob(job);

  return (
    value.jobId ??
    value.id ??
    value.job_id ??
    value.uuid ??
    null
  );
}

export function toList(data) {
  let value = data;

  for (let i = 0; i < 4 && value && !Array.isArray(value); i++) {
    if (Array.isArray(value.jobs)) return value.jobs;
    if (Array.isArray(value.content)) return value.content;
    if (
      Array.isArray(value.data) &&
      value.data.every(item => item && typeof item === "object")
    ) {
      return value.data;
    }

    if (value.data && typeof value.data === "object") {
      value = value.data;
    } else {
      break;
    }
  }

  return Array.isArray(value) ? value : [];
}

export function getRequirements(job) {
  const value = unwrapJob(job);
  let requirements = value.requirements;

  if (typeof requirements === "string") {
    try {
      requirements = JSON.parse(requirements);
    } catch {
      requirements = [];
    }
  }

  if (!Array.isArray(requirements)) return [];

  return requirements.map((item, index) => {
    if (typeof item === "string") {
      return {
        id: null,
        requirementIndex: index,
        isDone: false,
        condition: item,
      };
    }

    const completionValue = item.isDone ?? item.done ?? false;

    return {
      id: item.id ?? item.requirementId ?? null,
      requirementIndex: index,
      isDone:
        completionValue === true ||
        completionValue === 1 ||
        completionValue === "true",
      condition: item.condition ?? "",
    };
  });
}

function nameFromUrl(url) {
  if (!url || typeof url !== "string") return null;

  try {
    return decodeURIComponent(url.split("?")[0].split("/").pop());
  } catch {
    return null;
  }
}

function personName(person) {
  if (!person) return "";

  if (typeof person === "string") return person;

  const fullName = [
    person.firstName,
    person.lastName,
  ].filter(Boolean).join(" ");

  return (
    fullName ||
    person.fullName ||
    person.name ||
    person.email ||
    ""
  );
}

const bool = value =>
  value === true || value === "true" || value === 1;

function stageFromStatus(status) {
  const text = String(status || "").toUpperCase();

  if (/RELEASE|COMPLETED|PAID|CLOSED/.test(text)) return 4;
  if (/IN_PROGRESS|SUBMITTED|WORK|DELIVERED|FUNDED/.test(text)) return 3;
  if (/AGREEMENT_APPROVED|ESCROW/.test(text)) return 2;
  if (/PENDING_AGREEMENT|ACCEPTED|CONTRACT/.test(text)) return 1;

  return 0;
}

const URL_KEY = /(url|link|href|file|path|document|download)/i;
const LOOKS_LIKE_URL = /^(https?:\/\/|\/)/i;

function findUrl(source) {
  if (!source || typeof source !== "object") return null;

  for (const [key, value] of Object.entries(source)) {
    if (
      typeof value === "string" &&
      URL_KEY.test(key) &&
      LOOKS_LIKE_URL.test(value)
    ) {
      return value;
    }
  }

  return null;
}

function findJobContractUrl(job) {
  for (const [key, value] of Object.entries(job)) {
    if (
      typeof value === "string" &&
      /contract|agreement/i.test(key) &&
      URL_KEY.test(key) &&
      LOOKS_LIKE_URL.test(value)
    ) {
      return value;
    }
  }

  return null;
}

function normalizeContract(job) {
  const contract = job.contract ?? job.contractInfo ?? {};

  const fileUrl =
    contract.url ??
    contract.fileUrl ??
    contract.documentUrl ??
    job.contractUrl ??
    findUrl(contract) ??
    findJobContractUrl(job) ??
    null;

  const fileName =
    contract.fileName ??
    contract.name ??
    job.contractFileName ??
    nameFromUrl(fileUrl);

  const version =
    contract.version ??
    contract.currentVersion ??
    job.contractVersion ??
    null;

  const status = String(
    contract.status ?? job.contractStatus ?? ""
  ).toUpperCase();

  const clientApproved = bool(
    contract.clientApproved ?? job.clientApproved
  );

  const freelancerApproved = bool(
    contract.freelancerApproved ?? job.freelancerApproved
  );

  return {
    exists: Boolean(
      fileName || fileUrl || version ||
      Object.keys(contract).length
    ),
    version,
    fileName,
    fileUrl,
    status,
    clientApproved,
    freelancerApproved,
    approved:
      bool(contract.approved ?? contract.fullyApproved) ||
      status === "APPROVED" ||
      (clientApproved && freelancerApproved),
    changeRequest:
      contract.changeReason ??
      contract.changeRequest ??
      contract.reason ??
      job.changeRequestReason ??
      null,
  };
}

export function normalizeJob(input) {
  const job = unwrapJob(input);

  const invitationStatus = String(
    job.invitationStatus ?? ""
  ).toUpperCase();

  const projectStatus = String(
    job.status ?? ""
  ).toUpperCase();

  const escrowCreationStatus = String(
    job.escrowCreationStatus ?? ""
  ).toUpperCase();

  const escrowId =
    job.escrowId ??
    job.escrow_id ??
    null;

  const escrowConfirmed =
    escrowCreationStatus === "CONFIRMED" ||
    Boolean(escrowId);

  const contract = normalizeContract(job);

  let stage = Math.max(
    stageFromStatus(invitationStatus),
    stageFromStatus(projectStatus)
  );

  if (contract.approved) {
    stage = Math.max(stage, 2);
  }

  // A verified, persisted escrow means the project has reached the funded stage.
  if (escrowConfirmed) {
    stage = Math.max(stage, 3);
  }

  const prdUrl =
    job.prdUrl ??
    job.prdLink ??
    job.prd?.url ??
    null;

  const combinedStatus = `${invitationStatus} ${projectStatus}`;

  const invitation = /DECLIN/.test(combinedStatus)
    ? "declined"
    : /ACCEPTED|PENDING_AGREEMENT|AGREEMENT_APPROVED|FUNDED|ESCROW|IN_PROGRESS|SUBMITTED|COMPLETED|RELEASE|PAID/.test(combinedStatus)
      ? "accepted"
      : "pending";

  return {
    raw: job,
    id: getJobId(job),
    title: job.title ?? job.name ?? "Untitled project",
    description: job.description ?? "",
    amount: Number(job.budget ?? job.amount ?? 0),
    currency: job.currency ?? "NEAR",
    deadline: job.deadline ?? null,
    createdAt: job.createdAt ?? job.created_at ?? null,

    // Display funding confirmation independently of the general job status.
    statusText: escrowConfirmed
      ? "FUNDED"
      : projectStatus || invitationStatus,

    stage,
    invitation,
    escrowId,
    escrowCreationStatus,
    escrowConfirmed,

    termsLocked: stage >= 2,

    client: personName(
      job.client ?? job.clientName ?? job.clientEmail
    ),

    freelancer: personName(
      job.freelancer ??
      job.freelancerName ??
      job.participant ??
      job.participantEmail
    ),

    prdUrl,
    prdName:
      job.prdFileName ??
      job.prdName ??
      job.prd?.fileName ??
      nameFromUrl(prdUrl),

    requirements: getRequirements(job),
    contract,
  };
}

export function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatAmount(amount, currency = "NEAR") {
  const number = Number(amount);

  const formatted = Number.isFinite(number)
    ? number.toLocaleString("en-US", {
        maximumFractionDigits: 4,
      })
    : "0";

  return `${formatted} ${currency}`;
}

export function prettyStatus(status) {
  if (!status) return "Active";

  const formatted = String(status)
    .replace(/_/g, " ")
    .toLowerCase();

  return formatted.charAt(0).toUpperCase() +
    formatted.slice(1);
}

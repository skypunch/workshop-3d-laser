// ┌──────────────────────────────────────────────────────────────────────────┐
// │  EDIT THIS FILE for your institution.                                      │
// │  (You must ALSO mirror SCHOOL_DOMAIN + ADMIN_EMAILS in the two .rules      │
// │   files at the project root — Security Rules can't import this file.)      │
// └──────────────────────────────────────────────────────────────────────────┘

// Only Google accounts ending in this domain may use the app.
// e.g. "students.myschool.edu" or "myschool.edu"
export const SCHOOL_DOMAIN = "etonhouse.edu.sg";

// Staff who can see every job, download files, and change statuses.
// Add your own school email here (lowercase).
export const ADMIN_EMAILS = ["marcus.wetherell@etonhouse.edu.sg"];

// ── Things you probably don't need to change ────────────────────────────────
// Which queue a file goes into is decided by its extension.
export const TYPE_BY_EXTENSION = {
  ".stl": "3D Printing",
  ".svg": "Laser Cutting",
};

// Short labels used when auto-renaming uploaded files.
export const TYPE_FILE_LABEL = {
  "3D Printing": "3D print",
  "Laser Cutting": "Laser cut",
};

// Field name in each student's counters/{uid} doc holding their lifetime job
// count per machine type (used to number uploaded filenames).
export const TYPE_COUNTER_FIELD = {
  "3D Printing": "printCount",
  "Laser Cutting": "laserCount",
};

// Display order of the two queues.
export const JOB_TYPES = ["3D Printing", "Laser Cutting"];
export const ACCEPTED_EXTENSIONS = Object.keys(TYPE_BY_EXTENSION);
export const MAX_FILE_MB = 50;

// Returns the queue name for a filename, or null if the extension isn't allowed.
export function typeForFile(name) {
  const lower = (name || "").toLowerCase();
  const ext = ACCEPTED_EXTENSIONS.find((e) => lower.endsWith(e));
  return ext ? TYPE_BY_EXTENSION[ext] : null;
}

// "rejected"/Problem retired as a selectable status — issues are flagged with
// the per-job teacher (hazard) note instead.
export const STATUSES = ["queued", "in_progress", "done"];
export const STATUS_LABELS = {
  queued: "Queued",
  in_progress: "In progress",
  done: "Completed",
  rejected: "Problem",
};

// "SUFI" → "Sufi", "anne-marie" → "Anne-Marie".
function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Best-effort preferred/first name from a display name (or email if no name).
export function firstName(name) {
  let s = (name || "").trim();
  if (!s) return "Someone";
  // Preferred name in () or [] wins and is title-cased, e.g.
  // "Chun Hei (Kasper) LAU" → "Kasper", "Aisha [SUFI] Dutt" → "Sufi".
  const preferred = s.match(/\(([^)]+)\)/) || s.match(/\[([^\]]+)\]/);
  if (preferred) return toTitleCase(preferred[1].trim());
  if (s.includes("@")) {
    s = s.split("@")[0].split(/[._-]/)[0]; // e.g. "marcus.wetherell@…" → "marcus"
  } else {
    s = s.split(/\s+/)[0];
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Given jobs ordered oldest-first, returns { [jobId]: label } where each
// person's first job is "Marcus", their second "Marcus 2", and so on.
export function labelJobs(rows) {
  const countByOwner = {};
  const labels = {};
  for (const j of rows) {
    countByOwner[j.ownerUid] = (countByOwner[j.ownerUid] || 0) + 1;
    const n = countByOwner[j.ownerUid];
    labels[j.id] = n === 1 ? firstName(j.ownerName) : `${firstName(j.ownerName)} ${n}`;
  }
  return labels;
}

export function isSchoolEmail(email) {
  return typeof email === "string" && email.toLowerCase().endsWith("@" + SCHOOL_DOMAIN.toLowerCase());
}

export function isAdminEmail(email) {
  return typeof email === "string" && ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email.toLowerCase());
}

// Staff have "firstname.lastname@<SCHOOL_DOMAIN>" emails (letters only, one dot).
// Returns "Firstname Lastname" (derived from the email) if it looks like a staff
// address, else null. Note: the admin address also matches this shape.
export function staffName(email) {
  const [local, domain] = (email || "").toLowerCase().split("@");
  if (!domain || domain !== SCHOOL_DOMAIN.toLowerCase()) return null;
  const parts = local.split(".");
  if (parts.length !== 2 || !/^[a-z]+$/.test(parts[0]) || !/^[a-z]+$/.test(parts[1])) return null;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap(parts[0])} ${cap(parts[1])}`;
}

export function isStaffEmail(email) {
  return staffName(email) !== null;
}

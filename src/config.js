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

export const STATUSES = ["queued", "in_progress", "done", "rejected"];
export const STATUS_LABELS = {
  queued: "Queued",
  in_progress: "In progress",
  done: "Completed",
  rejected: "Problem",
};

// Best-effort preferred/first name from a display name (or email if no name).
export function firstName(name) {
  let s = (name || "").trim();
  if (!s) return "Someone";
  // Preferred name in parentheses wins, e.g. "Chun Hei (Kasper) LAU" → "Kasper".
  const preferred = s.match(/\(([^)]+)\)/);
  if (preferred) return preferred[1].trim();
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

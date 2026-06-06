// ┌──────────────────────────────────────────────────────────────────────────┐
// │  EDIT THIS FILE for your institution.                                      │
// │  (You must ALSO mirror SCHOOL_DOMAIN + ADMIN_EMAILS in the two .rules      │
// │   files at the project root — Security Rules can't import this file.)      │
// └──────────────────────────────────────────────────────────────────────────┘

// Only Google accounts ending in this domain may use the app.
// e.g. "students.myschool.edu" or "myschool.edu"
export const SCHOOL_DOMAIN = "yourschool.edu";

// Staff who can see every job, download files, and change statuses.
// Add your own school email here (lowercase).
export const ADMIN_EMAILS = ["you@yourschool.edu"];

// ── Things you probably don't need to change ────────────────────────────────
export const JOB_TYPES = ["3D Print", "Laser Cut"];
export const ACCEPTED_EXTENSIONS = [".stl", ".svg"];
export const MAX_FILE_MB = 50;

export const STATUSES = ["queued", "in_progress", "done", "rejected"];
export const STATUS_LABELS = {
  queued: "Queued",
  in_progress: "In progress",
  done: "Done",
  rejected: "Rejected",
};

export function isSchoolEmail(email) {
  return typeof email === "string" && email.toLowerCase().endsWith("@" + SCHOOL_DOMAIN.toLowerCase());
}

export function isAdminEmail(email) {
  return typeof email === "string" && ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email.toLowerCase());
}

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";

// Stored as Firebase Functions secrets (not in the repo). Set with:
//   firebase functions:secrets:set PUSHOVER_TOKEN
//   firebase functions:secrets:set PUSHOVER_USER
const PUSHOVER_TOKEN = defineSecret("PUSHOVER_TOKEN");
const PUSHOVER_USER = defineSecret("PUSHOVER_USER");

// Same preferred-name logic as the web app (e.g. "Chun Hei (Kasper) LAU" → "Kasper").
function preferredName(name) {
  const s = (name || "").trim();
  if (!s) return "Someone";
  const paren = s.match(/\(([^)]+)\)/);
  if (paren) return paren[1].trim();
  return s.split(/\s+/)[0];
}

export const notifyOnNewJob = onDocumentCreated(
  {
    document: "jobs/{jobId}",
    region: "asia-southeast1", // must match the Firestore database location
    secrets: [PUSHOVER_TOKEN, PUSHOVER_USER],
  },
  async (event) => {
    const job = event.data?.data();
    if (!job) return;

    const name = preferredName(job.ownerName);
    const machine = job.type || "job";
    const title = `New ${machine} job`;
    const lines = [`${name} — ${job.fileName || "file"}`];
    if (job.notes) lines.push(`Notes: ${job.notes}`);

    const body = new URLSearchParams({
      token: PUSHOVER_TOKEN.value(),
      user: PUSHOVER_USER.value(),
      title,
      message: lines.join("\n"),
    });

    try {
      const res = await fetch("https://api.pushover.net/1/messages.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) {
        logger.error("Pushover request failed", { status: res.status, body: await res.text() });
      }
    } catch (err) {
      logger.error("Pushover request threw", err);
    }
  }
);

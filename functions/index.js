import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import nodemailer from "nodemailer";

initializeApp();

// Stored as Firebase Functions secrets (not in the repo). Set with:
//   firebase functions:secrets:set PUSHOVER_TOKEN
//   firebase functions:secrets:set PUSHOVER_USER
const PUSHOVER_TOKEN = defineSecret("PUSHOVER_TOKEN");
const PUSHOVER_USER = defineSecret("PUSHOVER_USER");

// Gmail/Workspace address + app password used to send completion emails.
const EMAIL_USER = defineSecret("EMAIL_USER");
const EMAIL_PASS = defineSecret("EMAIL_PASS");

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Same preferred-name logic as the web app: prefer a name in () or [], title-cased
// (e.g. "Chun Hei (Kasper) LAU" → "Kasper", "Aisha [SUFI] Dutt" → "Sufi").
function preferredName(name) {
  const s = (name || "").trim();
  if (!s) return "Someone";
  const m = s.match(/\(([^)]+)\)/) || s.match(/\[([^\]]+)\]/);
  if (m) return toTitleCase(m[1].trim());
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

// Nightly cleanup: delete Completed/Problem jobs (and their uploaded files)
// once they're more than 30 days old. Active (queued/in-progress) jobs are
// never touched.
export const cleanupOldJobs = onSchedule(
  {
    schedule: "every day 03:00",
    timeZone: "Asia/Singapore",
    region: "asia-southeast1",
  },
  async () => {
    const db = getFirestore();
    const bucket = getStorage().bucket();
    const cutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const snap = await db
      .collection("jobs")
      .where("status", "in", ["done", "rejected"])
      .where("updatedAt", "<", cutoff)
      .get();

    if (snap.empty) {
      logger.info("cleanupOldJobs: nothing to delete");
      return;
    }

    let deleted = 0;
    for (const docSnap of snap.docs) {
      const { filePath, fileName } = docSnap.data();
      if (filePath) {
        await bucket.file(filePath).delete().catch((e) => {
          // File may already be gone — log and keep going.
          logger.warn(`cleanupOldJobs: could not delete file ${filePath}`, e?.message);
        });
      }
      await docSnap.ref.delete();
      deleted++;
      logger.info(`cleanupOldJobs: deleted ${docSnap.id} (${fileName || "no file"})`);
    }
    logger.info(`cleanupOldJobs: removed ${deleted} job(s) older than 30 days`);
  }
);

// Email the requester when their job is marked Completed (status → "done").
export const notifyOnComplete = onDocumentUpdated(
  {
    document: "jobs/{jobId}",
    region: "asia-southeast1",
    secrets: [EMAIL_USER, EMAIL_PASS],
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    // Only fire on the transition INTO "done" (not edits of an already-done job).
    if (before.status === "done" || after.status !== "done") return;

    const to = after.ownerEmail;
    if (!to) return;

    const is3D = after.type === "3D Printing";
    const subject = is3D
      ? "Your 3D print has been completed"
      : "Your laser cut has been completed";
    const text = is3D
      ? "Good news! Your 3D print job has finished and is ready for collection."
      : "Good news! Your laser cutting job has finished and is ready for collection.";

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: EMAIL_USER.value(), pass: EMAIL_PASS.value() },
    });

    try {
      await transporter.sendMail({
        from: `Workshop Queue <${EMAIL_USER.value()}>`,
        to,
        subject,
        text,
      });
      logger.info(`notifyOnComplete: emailed ${to} (${after.type})`);
    } catch (err) {
      logger.error("notifyOnComplete: email failed", err);
    }
  }
);

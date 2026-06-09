import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { JOB_TYPES, STATUS_LABELS, labelJobs } from "../config";
import { TrashIcon } from "./icons.jsx";
import FinishedGroup from "./FinishedGroup.jsx";

export default function QueueList({ user }) {
  const [jobs, setJobs] = useState([]);
  const [finished, setFinished] = useState([]);

  useEffect(() => {
    // Active jobs (queued or being worked on), oldest first.
    const qActive = query(
      collection(db, "jobs"),
      where("status", "in", ["queued", "in_progress"]),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(qActive, (snap) =>
      setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  useEffect(() => {
    // Recently finished jobs (completed or problem), most recent first.
    const qFinished = query(
      collection(db, "jobs"),
      where("status", "in", ["done", "rejected"]),
      orderBy("updatedAt", "desc"),
      limit(100)
    );
    return onSnapshot(qFinished, (snap) =>
      setFinished(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  return (
    <div className="queues-grid">
      {JOB_TYPES.map((type) => {
        const ofType = jobs.filter((j) => j.type === type);
        const labels = labelJobs(ofType);
        // Position counts only "queued" jobs of this type.
        let queuedSoFar = 0;
        const rows = ofType.map((j) => ({
          ...j,
          position: j.status === "queued" ? ++queuedSoFar : null,
        }));

        const finishedOfType = finished.filter((j) => j.type === type);
        const completed = finishedOfType.filter((j) => j.status === "done").slice(0, 10);
        const problems = finishedOfType.filter((j) => j.status === "rejected").slice(0, 10);

        return (
          <div className="queue-col" key={type}>
            <section className="card">
              <header className="queue-head">
                <h2>{type}</h2>
                {rows.length > 0 && <span className="queue-count">{rows.length} in queue</span>}
              </header>
              {rows.length === 0 ? (
                <p className="muted">This queue is empty.</p>
              ) : (
                <ul className="queue">
                  {rows.map((j) => (
                    <QueueRow
                      key={j.id}
                      job={j}
                      label={labels[j.id]}
                      position={j.position}
                      mine={j.ownerUid === user.uid}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="card">
              <FinishedGroup statusKey="done" jobs={completed} />
              <FinishedGroup statusKey="rejected" jobs={problems} />
            </section>
          </div>
        );
      })}
    </div>
  );
}

function QueueRow({ job, label, position, mine }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(job.notes || "");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const dirty = draft.trim() !== (job.notes || "");

  // Auto-save ~0.7s after the user stops typing — no Save button needed.
  useEffect(() => {
    if (!touched || !dirty) return;
    const t = setTimeout(async () => {
      setSaving(true);
      try {
        await updateDoc(doc(db, "jobs", job.id), { notes: draft.trim() });
      } catch (e) {
        console.error("Could not save notes:", e);
      } finally {
        setSaving(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [draft, touched]);

  async function cancel() {
    if (!confirm(`Delete "${label}" (${job.fileName}) and remove it from the queue?`)) return;
    try {
      await deleteDoc(doc(db, "jobs", job.id));
      if (job.filePath) await deleteObject(ref(storage, job.filePath)).catch(() => {});
    } catch (e) {
      alert(e?.message || "Could not cancel this job.");
    }
  }

  return (
    <li className={`queue-row ${mine ? "mine" : ""}`}>
      <div className="row-main">
        <span className="pos">{position ? `#${position}` : "▶"}</span>
        <div className="grow">
          <div className="line1">
            <strong>{label}</strong>
            <span className="muted small filename">{job.fileName}</span>
            {job.status !== "queued" && (
              <span className={`status status-${job.status}`}>{STATUS_LABELS[job.status]}</span>
            )}
          </div>
          <div className="muted small">{mine ? "You" : job.ownerName}</div>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className={`notes-toggle ${job.notes ? "has-notes" : ""} ${open ? "open" : ""}`}
            onClick={() => setOpen((o) => !o)}
            title={mine ? "Add or edit notes for Mr Wetherell" : "View notes"}
          >
            NOTES
          </button>
          {mine && job.status === "queued" && (
            <button
              type="button"
              className="btn ghost small danger icon-btn"
              onClick={cancel}
              aria-label="Delete job"
              title="Delete"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="notes-panel">
          {mine ? (
            <>
              <textarea
                value={draft}
                onChange={(e) => {
                  setTouched(true);
                  setDraft(e.target.value);
                }}
                rows={3}
                maxLength={240}
                placeholder="Notes for Mr Wetherell — material, color, quantity, anything to know…"
              />
              <div className="notes-actions">
                <span className="muted small">
                  {saving || dirty ? "Saving…" : touched ? "Saved ✓" : "Auto-saves as you type"}
                </span>
              </div>
            </>
          ) : (
            <p className="muted small">{job.notes ? job.notes : "No notes added."}</p>
          )}
        </div>
      )}
    </li>
  );
}

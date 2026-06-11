import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { ref, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { JOB_TYPES, STATUSES, STATUS_LABELS, labelJobs } from "../config";
import { TrashIcon, WarningIcon } from "./icons.jsx";
import FinishedGroup from "./FinishedGroup.jsx";
import ColoursBox from "./ColoursBox.jsx";

// Most recent first, by when the status was last changed (falls back to created).
function finishedMs(j) {
  const t = j.updatedAt || j.createdAt;
  return t?.toMillis ? t.toMillis() : 0;
}

export default function AdminDashboard() {
  const [activeJobs, setActiveJobs] = useState([]);
  const [finishedJobs, setFinishedJobs] = useState([]);
  const [filter, setFilter] = useState("active"); // active | all | queued | in_progress | done | rejected

  // Two capped listeners instead of the whole collection: the active queue is
  // naturally small, and finished history is limited to the most recent 100
  // (older entries are auto-deleted after 30 days by the cleanup function).
  // The queue keeps queued, in-progress AND problem jobs (problem jobs stay
  // visible in place rather than moving out). Only completed jobs leave.
  useEffect(() => {
    const qActive = query(
      collection(db, "jobs"),
      where("status", "in", ["queued", "in_progress", "rejected"]),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(qActive, (snap) => {
      setActiveJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    const qFinished = query(
      collection(db, "jobs"),
      where("status", "==", "done"),
      orderBy("updatedAt", "desc"),
      limit(100)
    );
    return onSnapshot(qFinished, (snap) => {
      setFinishedJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // Active first (oldest-first), then finished (most recent first).
  const jobs = useMemo(() => [...activeJobs, ...finishedJobs], [activeJobs, finishedJobs]);

  const visible = useMemo(() => {
    if (filter === "all") return jobs;
    if (filter === "active") {
      return jobs.filter(
        (j) => j.status === "queued" || j.status === "in_progress" || j.status === "rejected"
      );
    }
    return jobs.filter((j) => j.status === filter);
  }, [jobs, filter]);

  async function setStatus(job, status) {
    await updateDoc(doc(db, "jobs", job.id), { status, updatedAt: serverTimestamp() });
  }

  async function download(job) {
    try {
      const url = await getDownloadURL(ref(storage, job.filePath));
      window.open(url, "_blank", "noopener");
    } catch (e) {
      alert(e?.message || "Could not get the file.");
    }
  }

  async function remove(job) {
    if (!confirm(`Delete "${job.fileName}" by ${job.ownerName}? This also deletes the file.`)) return;
    try {
      await deleteDoc(doc(db, "jobs", job.id));
      if (job.filePath) await deleteObject(ref(storage, job.filePath)).catch(() => {});
    } catch (e) {
      alert(e?.message || "Could not delete this job.");
    }
  }

  return (
    <main className="stack">
      <section className="card">
        <h2>Admin dashboard</h2>
        <div className="filters">
          {["active", "all", ...STATUSES].map((f) => (
            <button key={f} className={`chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
              {f === "active" ? "Active" : f === "all" ? "All" : STATUS_LABELS[f]}
            </button>
          ))}
        </div>
      </section>

      <div className="queues-grid">
        {JOB_TYPES.map((type) => {
          const rows = visible.filter((j) => j.type === type);
          const labels = labelJobs(rows);
          // Everything in the queue (queued + in-progress + problem).
          const activeCount = activeJobs.filter((j) => j.type === type).length;
          // Queue positions counted across ALL jobs of this type (not the filtered
          // view), so a job's number matches what students see.
          let q = 0;
          const positions = {};
          jobs
            .filter((j) => j.type === type)
            .forEach((j) => {
              positions[j.id] = j.status === "queued" ? ++q : null;
            });
          // Recently completed (most recent first), independent of the status filter.
          const completed = jobs
            .filter((j) => j.type === type && j.status === "done")
            .sort((a, b) => finishedMs(b) - finishedMs(a))
            .slice(0, 10);

          return (
            <div className="queue-col" key={type}>
              <section className="card">
                <header className="queue-head">
                  <h2>{type}</h2>
                  {activeCount > 0 && <span className="queue-count">{activeCount} in queue</span>}
                  {type === "3D Printing" && <ColoursBox editable={true} />}
                </header>
                {rows.length === 0 ? (
                  <p className="muted">Nothing here.</p>
                ) : (
                  <ul className="queue">
                    {rows.map((j) => (
                      <AdminRow
                        key={j.id}
                        job={j}
                        label={labels[j.id]}
                        position={positions[j.id]}
                        onDownload={download}
                        onStatus={setStatus}
                        onRemove={remove}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section className="card">
                <FinishedGroup statusKey="done" jobs={completed} />
              </section>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function AdminRow({ job, label, position, onDownload, onStatus, onRemove }) {
  const [open, setOpen] = useState(false);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [tDraft, setTDraft] = useState(job.teacherNote || "");
  const [tSaving, setTSaving] = useState(false);
  const [tTouched, setTTouched] = useState(false);
  const tDirty = tDraft.trim() !== (job.teacherNote || "");

  // Auto-save the teacher note ~0.7s after typing stops (same feel as Notes).
  useEffect(() => {
    if (!tTouched || !tDirty) return;
    const tmr = setTimeout(async () => {
      setTSaving(true);
      try {
        await updateDoc(doc(db, "jobs", job.id), { teacherNote: tDraft.trim() });
      } catch (e) {
        console.error("Could not save teacher note:", e);
      } finally {
        setTSaving(false);
      }
    }, 700);
    return () => clearTimeout(tmr);
  }, [tDraft, tTouched]);

  return (
    <li className="queue-row">
      <div className="row-main">
        <span className="pos">
          {position ? `#${position}` : job.status === "in_progress" ? "▶" : "—"}
        </span>
        <div className="grow">
          <div className="line1">
            <strong>{label}</strong>
            <button className="btn ghost small file-link" onClick={() => onDownload(job)} title="Download file">
              ⬇ {job.fileName}
            </button>
            {job.status !== "queued" && (
              <span className={`status status-${job.status}`}>{STATUS_LABELS[job.status]}</span>
            )}
          </div>
          <div className="muted small">{job.ownerName}</div>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className={`teacher-toggle ${job.teacherNote ? "has-note" : ""}`}
            onClick={() => setTeacherOpen((o) => !o)}
            title="Add or edit a note for the student"
          >
            <WarningIcon /> Teacher
          </button>
          {job.notes && (
            <button
              type="button"
              className={`notes-toggle has-notes ${open ? "open" : ""}`}
              onClick={() => setOpen((o) => !o)}
            >
              NOTES
            </button>
          )}
          <select className="status-select" value={job.status} onChange={(e) => onStatus(job, e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            className="btn ghost small danger icon-btn"
            onClick={() => onRemove(job)}
            aria-label="Delete job"
            title="Delete"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {teacherOpen && (
        <div className="teacher-panel">
          <textarea
            value={tDraft}
            onChange={(e) => {
              setTTouched(true);
              setTDraft(e.target.value);
            }}
            rows={2}
            maxLength={300}
            placeholder="Note to the student (e.g. why this was rejected, or what to fix)…"
          />
          <div className="notes-actions">
            <span className="muted small">
              {tSaving || tDirty ? "Saving…" : tTouched ? "Saved ✓" : ""}
            </span>
          </div>
        </div>
      )}

      {open && job.notes && (
        <div className="notes-panel">
          <p className="muted small">{job.notes}</p>
        </div>
      )}
    </li>
  );
}

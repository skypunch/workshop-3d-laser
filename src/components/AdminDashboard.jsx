import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { ref, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { JOB_TYPES, STATUSES, STATUS_LABELS, labelJobs, isStaffEmail, isAdminEmail } from "../config";
import { TrashIcon, WarningIcon, NukeIcon, CheckIcon } from "./icons.jsx";
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
  const [filter, setFilter] = useState("active"); // active | all | queued | in_progress | done | batch
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const isBatch = filter === "batch";

  // Two capped listeners instead of the whole collection: the active queue is
  // naturally small, and finished history is limited to the most recent 100
  // (older entries are auto-deleted after 30 days by the cleanup function).
  // The queue keeps queued, in-progress AND problem jobs; only completed leave.
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

  // Clear any selection when switching tabs.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filter]);

  const jobs = useMemo(() => [...activeJobs, ...finishedJobs], [activeJobs, finishedJobs]);

  const visible = useMemo(() => {
    if (filter === "all") return jobs;
    if (filter === "active" || filter === "batch") {
      return jobs.filter(
        (j) => j.status === "queued" || j.status === "in_progress" || j.status === "rejected"
      );
    }
    return jobs.filter((j) => j.status === filter);
  }, [jobs, filter]);

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function setStatus(job, status) {
    await updateDoc(doc(db, "jobs", job.id), { status, updatedAt: serverTimestamp() });
  }

  // Batch: apply a status to every selected job of this machine.
  async function applyStatusToSelected(type, status) {
    const ids = activeJobs.filter((j) => j.type === type && selectedIds.has(j.id)).map((j) => j.id);
    if (ids.length === 0) {
      alert("Select one or more jobs first (tick the checkboxes).");
      return;
    }
    try {
      await Promise.all(
        ids.map((id) => updateDoc(doc(db, "jobs", id), { status, updatedAt: serverTimestamp() }))
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } catch (e) {
      alert(e?.message || "Could not update the selected jobs.");
    }
  }

  // Batch: delete every selected job of this machine (and its file).
  async function deleteSelected(type) {
    const toDelete = activeJobs.filter((j) => j.type === type && selectedIds.has(j.id));
    if (toDelete.length === 0) {
      alert("Select one or more jobs first (tick the checkboxes).");
      return;
    }
    if (!confirm(`Delete ${toDelete.length} selected ${type} job(s) and their files? This cannot be undone.`)) {
      return;
    }
    try {
      await Promise.all(
        toDelete.map(async (j) => {
          if (j.filePath) await deleteObject(ref(storage, j.filePath)).catch(() => {});
          await deleteDoc(doc(db, "jobs", j.id));
        })
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        toDelete.forEach((j) => next.delete(j.id));
        return next;
      });
    } catch (e) {
      alert(e?.message || "Could not delete the selected jobs.");
    }
  }

  async function download(job) {
    try {
      const url = await getDownloadURL(ref(storage, job.filePath));
      // Anchor-click (not window.open) so there's no popup: the file is stored
      // with Content-Disposition: attachment, so this downloads in place.
      const a = document.createElement("a");
      a.href = url;
      a.download = job.fileName || "";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
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

  // NUKE: permanently delete EVERY job of this machine (active + completed) and
  // their uploaded files. Irreversible — requires typing NUKE.
  async function nuke(type) {
    const typed = prompt(
      `☢️  NUKE the entire ${type} queue?\n\n` +
        `This permanently deletes ALL ${type} jobs — both the active queue AND the ` +
        `completed history — and their uploaded files. This cannot be undone.\n\n` +
        `Type NUKE to confirm:`
    );
    if (typed === null) return; // cancelled
    if (typed.trim().toUpperCase() !== "NUKE") {
      alert('Cancelled — you didn\'t type "NUKE".');
      return;
    }
    try {
      const snap = await getDocs(query(collection(db, "jobs"), where("type", "==", type)));
      await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data();
          if (data.filePath) await deleteObject(ref(storage, data.filePath)).catch(() => {});
          await deleteDoc(d.ref);
        })
      );
      setSelectedIds(new Set());
    } catch (e) {
      alert(e?.message || "Could not clear the queue.");
    }
  }

  return (
    <main className="stack">
      <section className="card">
        <h2>Admin dashboard</h2>
        <div className="filters">
          {["active", "all", ...STATUSES.filter((s) => s !== "queued"), "batch"].map((f) => (
            <button key={f} className={`chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
              {f === "active" ? "Active" : f === "all" ? "All" : f === "batch" ? "Batch" : STATUS_LABELS[f]}
            </button>
          ))}
        </div>
      </section>

      <div className="queues-grid">
        {JOB_TYPES.map((type) => {
          const rows = visible.filter((j) => j.type === type);
          const labels = labelJobs(rows);
          const activeCount = activeJobs.filter((j) => j.type === type).length;
          // Queue positions counted across ALL jobs of this type.
          let q = 0;
          const positions = {};
          jobs
            .filter((j) => j.type === type)
            .forEach((j) => {
              positions[j.id] = j.status === "queued" ? ++q : null;
            });
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

                {isBatch && (
                  <div className="batch-toolbar">
                    <select
                      className="status-select"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) applyStatusToSelected(type, e.target.value);
                      }}
                    >
                      <option value="" disabled>
                        Set selected to…
                      </option>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn ghost small danger icon-btn"
                      onClick={() => deleteSelected(type)}
                      aria-label="Delete selected jobs"
                      title="Delete selected jobs"
                    >
                      <TrashIcon />
                    </button>
                    <button
                      type="button"
                      className="btn ghost small danger icon-btn"
                      onClick={() => nuke(type)}
                      aria-label={`Nuke the ${type} queue`}
                      title={`Delete ALL ${type} jobs (active + completed)`}
                    >
                      <NukeIcon />
                    </button>
                  </div>
                )}

                {rows.length === 0 ? (
                  <p className="muted">{isBatch ? "Queue is empty." : "Nothing here."}</p>
                ) : (
                  <ul className="queue">
                    {rows.map((j) => (
                      <AdminRow
                        key={j.id}
                        job={j}
                        label={labels[j.id]}
                        position={positions[j.id]}
                        batchMode={isBatch}
                        selected={selectedIds.has(j.id)}
                        onToggleSelect={toggleSelect}
                        onDownload={download}
                        onStatus={setStatus}
                        onRemove={remove}
                      />
                    ))}
                  </ul>
                )}
              </section>

              {!isBatch && (
                <section className="card">
                  <FinishedGroup statusKey="done" jobs={completed} />
                </section>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}

function AdminRow({ job, label, position, batchMode, selected, onToggleSelect, onDownload, onStatus, onRemove }) {
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
          {batchMode ? (
            <input
              type="checkbox"
              className="batch-check"
              checked={selected}
              onChange={() => onToggleSelect(job.id)}
              aria-label="Select job"
            />
          ) : position ? (
            `#${position}`
          ) : job.status === "in_progress" ? (
            "▶"
          ) : job.status === "done" ? (
            <span className="done-check" aria-label="Completed">
              <CheckIcon />
            </span>
          ) : (
            "—"
          )}
        </span>
        <div className="grow">
          <div className="line1">
            <button className="file-link" onClick={() => onDownload(job)} title="Download file">
              <span className="fname">{job.fileName}</span>
              <span className="dl-arrow" aria-hidden="true">⬇</span>
            </button>
          </div>
        </div>
        <div className="row-actions">
          {job.notes && (
            <button
              type="button"
              className={`notes-toggle has-notes ${open ? "open" : ""}`}
              onClick={() => setOpen((o) => !o)}
            >
              NOTES
            </button>
          )}
          {!batchMode && (
            <select className="status-select" value={job.status} onChange={(e) => onStatus(job, e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          )}
          {!batchMode && (
            <button
              className="btn ghost small danger icon-btn"
              onClick={() => onRemove(job)}
              aria-label="Delete job"
              title="Delete"
            >
              <TrashIcon />
            </button>
          )}
          <button
            type="button"
            className={`btn ghost small icon-btn teacher-icon ${job.teacherNote ? "has-note" : ""}`}
            onClick={() => setTeacherOpen((o) => !o)}
            aria-label="Teacher note"
            title="Add or edit a note for the student"
          >
            <WarningIcon />
          </button>
        </div>
      </div>

      <div className={`owner-name muted${isStaffEmail(job.ownerEmail) ? " staff-name" : ""}`}>
        {isAdminEmail(job.ownerEmail) ? "Mr Wetherell" : job.ownerName}
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

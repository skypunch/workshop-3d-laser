import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { ref, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { JOB_TYPES, STATUSES, STATUS_LABELS, labelJobs } from "../config";

export default function AdminDashboard() {
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState("active"); // active | all | queued | in_progress | done | rejected

  useEffect(() => {
    const q = query(collection(db, "jobs"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const visible = useMemo(() => {
    if (filter === "all") return jobs;
    if (filter === "active") return jobs.filter((j) => j.status === "queued" || j.status === "in_progress");
    return jobs.filter((j) => j.status === filter);
  }, [jobs, filter]);

  async function setStatus(job, status) {
    await updateDoc(doc(db, "jobs", job.id), { status });
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
    if (!confirm(`Delete "${job.title || job.fileName}" by ${job.ownerName}? This also deletes the file.`)) return;
    try {
      await deleteDoc(doc(db, "jobs", job.id));
      if (job.filePath) await deleteObject(ref(storage, job.filePath)).catch(() => {});
    } catch (e) {
      alert(e?.message || "Could not delete this job.");
    }
  }

  // Live counts per queue (always reflect the whole queue, ignoring the filter).
  const counts = useMemo(() => {
    const c = {};
    JOB_TYPES.forEach((t) => (c[t] = { queued: 0, in_progress: 0 }));
    jobs.forEach((j) => {
      if (c[j.type] && (j.status === "queued" || j.status === "in_progress")) {
        c[j.type][j.status] += 1;
      }
    });
    return c;
  }, [jobs]);

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

      {JOB_TYPES.map((type) => {
        const rows = visible.filter((j) => j.type === type);
        const labels = labelJobs(rows);
        const activeCount = counts[type].queued + counts[type].in_progress;
        // Queue positions counted across ALL jobs of this type (not the filtered
        // view), so a job's number matches what students see.
        let q = 0;
        const positions = {};
        jobs
          .filter((j) => j.type === type)
          .forEach((j) => {
            positions[j.id] = j.status === "queued" ? ++q : null;
          });
        return (
          <section className="card" key={type}>
            <header className="queue-head">
              <h2>{type}</h2>
              {activeCount > 0 && <span className="queue-count">{activeCount} in queue</span>}
            </header>
            {rows.length === 0 ? (
              <p className="muted">Nothing here.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Job</th>
                    <th>Requester</th>
                    <th>File</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
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
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </main>
  );
}

function AdminRow({ job, label, position, onDownload, onStatus, onRemove }) {
  const [open, setOpen] = useState(false);

  return (
    <tr className={`status-row-${job.status}`}>
      <td className="pos-cell">
        {position ? `#${position}` : job.status === "in_progress" ? "▶" : "—"}
      </td>
      <td>
        <strong>{label}</strong>
      </td>
      <td className="small">
        {job.ownerName}
        <br />
        <span className="muted">{job.ownerEmail}</span>
      </td>
      <td>
        <button className="btn ghost small" onClick={() => onDownload(job)}>
          ⬇ {job.fileName}
        </button>
        {job.notes && (
          <div className="admin-notes">
            <button
              type="button"
              className={`notes-toggle has-notes ${open ? "open" : ""}`}
              onClick={() => setOpen((o) => !o)}
            >
              NOTES
            </button>
            {open && <p className="notes-reveal">{job.notes}</p>}
          </div>
        )}
      </td>
      <td>
        <select value={job.status} onChange={(e) => onStatus(job, e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </td>
      <td>
        <button className="btn ghost small danger" onClick={() => onRemove(job)}>
          Delete
        </button>
      </td>
    </tr>
  );
}

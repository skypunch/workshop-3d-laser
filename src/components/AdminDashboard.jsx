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
        <div className="muted small">
          {JOB_TYPES.map((t) => (
            <span key={t} style={{ marginRight: 16 }}>
              <strong>{t}:</strong> {counts[t].queued} queued · {counts[t].in_progress} in progress
            </span>
          ))}
        </div>
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
        return (
          <section className="card" key={type}>
            <h2>
              {type} {rows.length > 0 && <span className="muted">· {rows.length}</span>}
            </h2>
            {rows.length === 0 ? (
              <p className="muted">Nothing here.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Requester</th>
                    <th>Notes</th>
                    <th>File</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((j) => (
                    <tr key={j.id} className={`status-row-${j.status}`}>
                      <td><strong>{labels[j.id]}</strong></td>
                      <td className="small">
                        {j.ownerName}
                        <br />
                        <span className="muted">{j.ownerEmail}</span>
                      </td>
                      <td className="small notes">{j.notes || <span className="muted">—</span>}</td>
                      <td>
                        <button className="btn ghost small" onClick={() => download(j)}>
                          ⬇ {j.fileName}
                        </button>
                      </td>
                      <td>
                        <select value={j.status} onChange={(e) => setStatus(j, e.target.value)}>
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button className="btn ghost small danger" onClick={() => remove(j)}>
                          Delete
                        </button>
                      </td>
                    </tr>
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

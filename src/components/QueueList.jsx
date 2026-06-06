import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { JOB_TYPES, STATUS_LABELS } from "../config";

export default function QueueList({ user }) {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    // Show everything that's still active (queued or being worked on), oldest first.
    const q = query(
      collection(db, "jobs"),
      where("status", "in", ["queued", "in_progress"]),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(q, (snap) => {
      setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  async function cancel(job) {
    if (!confirm(`Cancel "${job.title}" and remove it from the queue?`)) return;
    try {
      await deleteDoc(doc(db, "jobs", job.id));
      if (job.filePath) await deleteObject(ref(storage, job.filePath)).catch(() => {});
    } catch (e) {
      alert(e?.message || "Could not cancel this job.");
    }
  }

  return (
    <>
      {JOB_TYPES.map((type) => {
        const ofType = jobs.filter((j) => j.type === type);
        // Position is counted only among "queued" jobs of this type.
        let queuedSoFar = 0;
        const rows = ofType.map((j) => ({
          ...j,
          position: j.status === "queued" ? ++queuedSoFar : null,
        }));

        return (
          <section className="card" key={type}>
            <h2>
              {type} {rows.length > 0 && <span className="muted">· {rows.length}</span>}
            </h2>
            {rows.length === 0 ? (
              <p className="muted">This queue is empty.</p>
            ) : (
              <ul className="queue">
                {rows.map((j) => {
                  const mine = j.ownerUid === user.uid;
                  return (
                    <li key={j.id} className={`queue-row ${mine ? "mine" : ""}`}>
                      <span className="pos">{j.position ? `#${j.position}` : "▶"}</span>
                      <div className="grow">
                        <div className="line1">
                          <strong>{j.title}</strong>
                          <span className={`status status-${j.status}`}>
                            {STATUS_LABELS[j.status]}
                          </span>
                        </div>
                        <div className="muted small">{mine ? "You" : j.ownerName}</div>
                      </div>
                      {mine && j.status === "queued" && (
                        <button className="btn ghost small" onClick={() => cancel(j)}>
                          Cancel
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { STATUS_LABELS } from "../config";

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

  // Position number is counted only among "queued" jobs (in-progress ones are being made now).
  let queuedSoFar = 0;
  const rows = jobs.map((j) => {
    const position = j.status === "queued" ? ++queuedSoFar : null;
    return { ...j, position };
  });

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
    <section className="card">
      <h2>The queue {rows.length > 0 && <span className="muted">· {rows.length}</span>}</h2>
      {rows.length === 0 ? (
        <p className="muted">The queue is empty. Be the first!</p>
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
                    <span className="tag">{j.type}</span>
                    <span className={`status status-${j.status}`}>{STATUS_LABELS[j.status]}</span>
                  </div>
                  <div className="muted small">
                    {mine ? "You" : j.ownerName}
                  </div>
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
}

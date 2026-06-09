import { STATUS_LABELS, firstName } from "../config";

// Renders one labelled list of finished jobs (Completed or Problem).
export default function FinishedGroup({ statusKey, jobs }) {
  return (
    <div className="finished-group">
      <span className={`status status-${statusKey}`}>{STATUS_LABELS[statusKey]}</span>
      {jobs.length === 0 ? (
        <p className="muted small finished-empty">None yet.</p>
      ) : (
        <ul className="finished-list">
          {jobs.map((j) => (
            <li key={j.id}>
              <span className="finished-name">{firstName(j.ownerName)}</span>
              <span className="muted small filename">{j.fileName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

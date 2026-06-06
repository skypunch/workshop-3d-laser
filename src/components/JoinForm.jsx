import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";
import { JOB_TYPES, ACCEPTED_EXTENSIONS, MAX_FILE_MB } from "../config";

function fileExtOk(name) {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export default function JoinForm({ user }) {
  const [type, setType] = useState(JOB_TYPES[0]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!file) return setError("Please choose a file to upload.");
    if (!fileExtOk(file.name)) return setError(`File must be one of: ${ACCEPTED_EXTENSIONS.join(", ")}`);
    if (file.size > MAX_FILE_MB * 1024 * 1024) return setError(`File must be under ${MAX_FILE_MB} MB.`);
    if (!title.trim()) return setError("Please give your job a short title.");

    setBusy(true);
    try {
      // 1) Upload the file to Cloud Storage under this user's folder.
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `uploads/${user.uid}/${Date.now()}_${safeName}`;
      // contentDisposition "attachment" makes the admin's download button save
      // the file to disk (with its original name) instead of opening it in a tab.
      await uploadBytes(ref(storage, path), file, {
        contentType: file.type || "application/octet-stream",
        contentDisposition: `attachment; filename="${safeName}"`,
      });

      // 2) Create the queue entry in Firestore that points at the file.
      await addDoc(collection(db, "jobs"), {
        ownerUid: user.uid,
        ownerEmail: user.email,
        ownerName: user.displayName || user.email,
        type,
        title: title.trim(),
        notes: notes.trim(),
        fileName: file.name,
        filePath: path,
        status: "queued",
        createdAt: serverTimestamp(),
      });

      setTitle("");
      setNotes("");
      setFile(null);
      e.target.reset();
      setDone(true);
      setTimeout(() => setDone(false), 4000);
    } catch (err) {
      setError(err?.message || "Something went wrong submitting your job.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Join the queue</h2>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {JOB_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label>
          Title
          <input
            type="text"
            value={title}
            placeholder="e.g. Keychain prototype"
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
          />
        </label>

        <label>
          Notes for the lab (optional)
          <textarea
            value={notes}
            placeholder="Material, color, infill, quantity, anything we should know…"
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={500}
          />
        </label>

        <label>
          File ({ACCEPTED_EXTENSIONS.join(" / ")}, max {MAX_FILE_MB} MB)
          <input
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(",")}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>

        {error && <div className="banner error">{error}</div>}
        {done && <div className="banner success">Added to the queue! 🎉</div>}

        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Uploading…" : "Add to queue"}
        </button>
      </form>
    </section>
  );
}

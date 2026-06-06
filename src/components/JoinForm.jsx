import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";
import { ACCEPTED_EXTENSIONS, MAX_FILE_MB, typeForFile } from "../config";

export default function JoinForm({ user }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // The queue is decided by the file's extension (.stl → 3D Printing, .svg → Laser Cutter).
  const detectedType = file ? typeForFile(file.name) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!file) return setError("Please choose a file to upload.");
    const type = typeForFile(file.name);
    if (!type) return setError(`File must be one of: ${ACCEPTED_EXTENSIONS.join(", ")}`);
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
        type, // auto-detected from the extension
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
          File
          <input
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(",")}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <span className="muted small">
            Upload a <strong>.stl</strong> for 3D Printing or a <strong>.svg</strong> for the
            Laser Cutter — the right queue is chosen automatically. Max {MAX_FILE_MB} MB.
          </span>
        </label>

        {file && detectedType && (
          <div className="banner info">
            This will join the <strong>{detectedType}</strong> queue.
          </div>
        )}
        {file && !detectedType && (
          <div className="banner error">
            Unsupported file type — please choose a .stl or .svg file.
          </div>
        )}

        {error && <div className="banner error">{error}</div>}
        {done && <div className="banner success">Added to the queue! 🎉</div>}

        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Uploading…" : "Add to queue"}
        </button>
      </form>
    </section>
  );
}

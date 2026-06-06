import { useRef, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";
import { ACCEPTED_EXTENSIONS, MAX_FILE_MB, typeForFile } from "../config";

export default function JoinForm({ user }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [doneMsg, setDoneMsg] = useState("");
  const fileInputRef = useRef(null);

  function clearInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Runs the moment a file is chosen — uploads and joins the right queue automatically.
  async function submitJob(file) {
    setError("");
    setDoneMsg("");

    const type = typeForFile(file.name); // .stl → 3D Printing, .svg → Laser Cutter
    if (!type) {
      setError(`File must be one of: ${ACCEPTED_EXTENSIONS.join(", ")}`);
      clearInput();
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_FILE_MB} MB.`);
      clearInput();
      return;
    }

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
        notes: "", // students can add notes from the queue afterwards
        fileName: file.name,
        filePath: path,
        status: "queued",
        createdAt: serverTimestamp(),
      });

      setDoneMsg(`Added to the ${type} queue! 🎉`);
      setTimeout(() => setDoneMsg(""), 4000);
    } catch (err) {
      setError(err?.message || "Something went wrong submitting your job.");
    } finally {
      setBusy(false);
      clearInput();
    }
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (f) submitJob(f);
  }

  return (
    <section className="card">
      <div className="form">
        <input
          ref={fileInputRef}
          id="queue-file-input"
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={handleFileChange}
          disabled={busy}
          className="visually-hidden"
        />
        <label htmlFor="queue-file-input" className={`upload-btn ${busy ? "disabled" : ""}`}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 16V4" />
            <path d="m6 10 6-6 6 6" />
            <path d="M4 20h16" />
          </svg>
          {busy ? "Uploading…" : "Upload a file for printing or cutting"}
        </label>
        <span className="muted small upload-hint">Maximum {MAX_FILE_MB} MB</span>

        {error && <div className="banner error">{error}</div>}
        {doneMsg && <div className="banner success">{doneMsg}</div>}
      </div>
    </section>
  );
}

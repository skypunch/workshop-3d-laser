import { useRef, useState } from "react";
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";
import { ACCEPTED_EXTENSIONS, MAX_FILE_MB, typeForFile, firstName, TYPE_FILE_LABEL } from "../config";

const ACTIVE_STATUSES = ["queued", "in_progress", "rejected"];

export default function JoinForm({ user }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [doneMsg, setDoneMsg] = useState("");
  const [dragging, setDragging] = useState(false);
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
      // Build a friendly name: "<label> - <preferred name>.<ext>", numbered
      // ("<label> job 2 - …") if this student already has active jobs of this
      // type in the queue. Completed jobs don't count.
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      const label = TYPE_FILE_LABEL[type] || type;
      const name = firstName(user.displayName || user.email);
      const ownSnap = await getDocs(
        query(collection(db, "jobs"), where("ownerUid", "==", user.uid))
      );
      const existing = ownSnap.docs
        .map((d) => d.data())
        .filter((j) => j.type === type && ACTIVE_STATUSES.includes(j.status)).length;
      const n = existing + 1;
      const friendlyName = (n === 1 ? `${label} - ${name}` : `${label} job ${n} - ${name}`) + ext;

      // 1) Upload the file to Cloud Storage under this user's folder.
      const safeName = friendlyName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `uploads/${user.uid}/${Date.now()}_${safeName}`;
      // contentDisposition "attachment" makes the admin's download button save
      // the file to disk (with the friendly name) instead of opening it in a tab.
      await uploadBytes(ref(storage, path), file, {
        contentType: file.type || "application/octet-stream",
        contentDisposition: `attachment; filename="${friendlyName}"`,
      });

      // 2) Create the queue entry in Firestore that points at the file.
      await addDoc(collection(db, "jobs"), {
        ownerUid: user.uid,
        ownerEmail: user.email,
        ownerName: user.displayName || user.email,
        type, // auto-detected from the extension
        notes: "", // students can add notes from the queue afterwards
        fileName: friendlyName,
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

  // The whole upload box is a drop zone; only the button shows the visual cue.
  function handleDragOver(e) {
    e.preventDefault(); // required, or the browser just opens the dropped file
    if (!busy && !dragging) setDragging(true);
  }

  function handleDragLeave(e) {
    // Ignore leaves that are just moving onto a child element inside the box.
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    const f = e.dataTransfer.files?.[0]; // take the first file, ignore the rest
    if (f) submitJob(f);
  }

  return (
    <section
      className="card upload-card"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
        <label
          htmlFor="queue-file-input"
          className={`upload-btn ${busy ? "disabled" : ""} ${dragging ? "dragover" : ""}`}
        >
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
          {busy ? "Uploading…" : "Drag a file here or click to upload"}
        </label>
        <span className="muted small upload-hint">Maximum {MAX_FILE_MB} MB</span>

        {error && <div className="banner error">{error}</div>}
        {doneMsg && <div className="banner success">{doneMsg}</div>}
      </div>
    </section>
  );
}

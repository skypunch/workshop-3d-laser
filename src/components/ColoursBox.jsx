import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

// A single shared document everyone reads; only admins can write (see rules).
const COLOURS_DOC = doc(db, "settings", "printColours");

export default function ColoursBox({ editable }) {
  const [remote, setRemote] = useState("");
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const dirty = ready && draft !== remote;

  useEffect(() => {
    return onSnapshot(COLOURS_DOC, (snap) => {
      const t = snap.exists() ? snap.data().text ?? "" : "";
      setRemote(t);
      setReady((was) => {
        if (!was) setDraft(t); // initialise the editor once, on first load
        return true;
      });
    });
  }, []);

  // Autosave (admin only) ~0.7s after typing stops — same behaviour as Notes.
  useEffect(() => {
    if (!editable || !ready || draft === remote) return;
    const tmr = setTimeout(async () => {
      setSaving(true);
      try {
        await setDoc(COLOURS_DOC, { text: draft, updatedAt: serverTimestamp() }, { merge: true });
      } catch (e) {
        console.error("Could not save colours:", e);
      } finally {
        setSaving(false);
      }
    }, 700);
    return () => clearTimeout(tmr);
  }, [draft, remote, editable, ready]);

  return (
    <div className="colours-inline">
      <span className="colours-title">Currently available 3D printing colours</span>
      {editable ? (
        <input
          className="colours-field"
          type="text"
          value={draft}
          onChange={(e) => {
            setTouched(true);
            setDraft(e.target.value);
          }}
          maxLength={200}
          placeholder="e.g. Black, White, Red, Blue"
        />
      ) : (
        <span className="colours-field colours-readonly">
          {remote ? remote : <span className="muted">Not set yet.</span>}
        </span>
      )}
      {editable && (
        <span className="muted small colours-status">
          {saving || dirty ? "Saving…" : touched ? "Saved ✓" : ""}
        </span>
      )}
    </div>
  );
}

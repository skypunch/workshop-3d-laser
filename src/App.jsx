import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { isSchoolEmail, isAdminEmail, SCHOOL_DOMAIN } from "./config";
import JoinForm from "./components/JoinForm.jsx";
import QueueList from "./components/QueueList.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
import ColoursBox from "./components/ColoursBox.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewAsStudent, setViewAsStudent] = useState(false); // admins can preview the student view
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    // Failsafe: never sit on "Loading…" forever if the auth check is slow —
    // after 4s, fall back to showing the sign-in screen.
    const failsafe = setTimeout(() => setLoading(false), 4000);
    // Fires on load and whenever the user signs in or out.
    const unsub = onAuthStateChanged(auth, (u) => {
      clearTimeout(failsafe);
      if (u && !isSchoolEmail(u.email) && !isAdminEmail(u.email)) {
        // Someone signed in with a non-school Google account (and isn't an
        // admin): reject + sign out. Admins are allowed in from any address.
        setError(`Please sign in with your @${SCHOOL_DOMAIN} account (you used ${u.email}).`);
        signOut(auth);
        setUser(null);
      } else {
        setError("");
        setUser(u);
      }
      setLoading(false);
    });
    return () => {
      clearTimeout(failsafe);
      unsub();
    };
  }, []);

  async function handleSignIn() {
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e?.code !== "auth/popup-closed-by-user" && e?.code !== "auth/cancelled-popup-request") {
        setError(e?.message || "Sign-in failed.");
      }
    }
  }

  if (loading) {
    return <div className="centered muted">Loading…</div>;
  }

  const isAdmin = !!user && isAdminEmail(user.email);
  const showStudentView = !!user && (!isAdmin || viewAsStudent);

  return (
    <div className={`app${user && !showStudentView ? " admin" : ""}`}>
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <div>
              <h1>Workshop 3D Printing and Laser Cutting Queue</h1>
              <span className="url-mono">tinyurl.com/ehprintcut</span>
            </div>
          </div>
          {user && <ColoursBox editable={isAdmin && !viewAsStudent} />}
        </div>
        {user && (
          <div className="userbox">
            {isAdmin && (
              <button className="btn ghost small" onClick={() => setViewAsStudent((v) => !v)}>
                {viewAsStudent ? "Back to admin" : "View as student"}
              </button>
            )}
            {isAdmin && <span className="badge">admin</span>}
            <button
              className="name-btn"
              onClick={() => setConfirmSignOut(true)}
              title="Click to sign out"
            >
              {user.displayName || user.email}
            </button>
          </div>
        )}
      </header>

      {error && <div className="banner error">{error}</div>}

      {!user ? (
        <div className="centered signin">
          <h2>Sign in to join the queue</h2>
          <p className="muted">Use your @{SCHOOL_DOMAIN} Google account.</p>
          <button className="btn primary" onClick={handleSignIn}>
            Sign in with Google
          </button>
        </div>
      ) : showStudentView ? (
        <main className="stack">
          <JoinForm user={user} />
          <QueueList user={user} />
        </main>
      ) : (
        <AdminDashboard user={user} />
      )}

      {showStudentView && (
        <footer className="muted footer">
          Only Mr Wetherell can access your uploaded files.
        </footer>
      )}

      {confirmSignOut && (
        <div className="modal-overlay" onClick={() => setConfirmSignOut(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Sign out?</h3>
            <p className="muted">
              You're signed in as {user?.displayName || user?.email}. You'll need to sign in
              with Google again to rejoin.
            </p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmSignOut(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setConfirmSignOut(false);
                  signOut(auth);
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

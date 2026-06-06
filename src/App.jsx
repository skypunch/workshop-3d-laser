import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { isSchoolEmail, isAdminEmail, SCHOOL_DOMAIN } from "./config";
import JoinForm from "./components/JoinForm.jsx";
import QueueList from "./components/QueueList.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Fires on load and whenever the user signs in or out.
    return onAuthStateChanged(auth, (u) => {
      if (u && !isSchoolEmail(u.email)) {
        // Someone signed in with a non-school Google account: reject + sign out.
        setError(`Please sign in with your @${SCHOOL_DOMAIN} account (you used ${u.email}).`);
        signOut(auth);
        setUser(null);
      } else {
        setError("");
        setUser(u);
      }
      setLoading(false);
    });
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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⚙︎</span>
          <div>
            <h1>Fab Lab Queue</h1>
            <p className="muted">3D printing &amp; laser cutting</p>
          </div>
        </div>
        {user && (
          <div className="userbox">
            <span className="muted">{user.displayName || user.email}</span>
            {isAdminEmail(user.email) && <span className="badge">admin</span>}
            <button className="btn ghost" onClick={() => signOut(auth)}>
              Sign out
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
      ) : isAdminEmail(user.email) ? (
        <AdminDashboard user={user} />
      ) : (
        <main className="stack">
          <JoinForm user={user} />
          <QueueList user={user} />
        </main>
      )}

      <footer className="muted footer">
        Files are private — only you and the lab staff can download them.
      </footer>
    </div>
  );
}

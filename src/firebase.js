// Initializes Firebase once and exports the handles the rest of the app uses.
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { firebaseConfig } from "./firebaseConfig";
import { SCHOOL_DOMAIN } from "./config";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Persistent local cache (IndexedDB): repeat visits paint the queue instantly
// from the device while fresh data streams in, and cached reads aren't billed.
// The multi-tab manager lets several open tabs share one cache safely; on
// browsers without IndexedDB the SDK falls back to in-memory automatically.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
// `hd` nudges Google's account chooser toward your school domain. This is a UX
// convenience only — the real "school accounts only" enforcement lives in the
// Security Rules and in App.jsx (which signs out non-school accounts).
googleProvider.setCustomParameters({ hd: SCHOOL_DOMAIN, prompt: "select_account" });

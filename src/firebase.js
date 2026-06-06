// Initializes Firebase once and exports the handles the rest of the app uses.
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { firebaseConfig } from "./firebaseConfig";
import { SCHOOL_DOMAIN } from "./config";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
// `hd` nudges Google's account chooser toward your school domain. This is a UX
// convenience only — the real "school accounts only" enforcement lives in the
// Security Rules and in App.jsx (which signs out non-school accounts).
googleProvider.setCustomParameters({ hd: SCHOOL_DOMAIN, prompt: "select_account" });

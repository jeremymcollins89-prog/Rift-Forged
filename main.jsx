import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
// Note: rift-forged.jsx itself imports whatever other firebase/firestore
// functions it needs (onSnapshot, runTransaction, etc.) directly — it's
// bundled into the same graph as this file, so that's safe. Only the live
// `db` instance and the signed-in user's identity need to cross the
// window bridge, since those are created/resolved here.
import { firebaseConfig } from "./firebase-config.js";
import App, { DEFAULT_STATE } from "./rift-forged.jsx";
import AuthScreen from "./auth.jsx";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Wires the game's pluggable persistence layer to this user's Firestore save.
// Critically, this must happen SYNCHRONOUSLY inside the auth callback, before
// React ever re-renders — not in a useEffect keyed on `user`. A separate
// effect runs one tick too late: App mounts and calls loadState() before
// that effect fires, so the hook isn't there yet and every load silently
// falls back to an empty local save. Setting it up right here, before
// setUser() is even called, guarantees it's ready before App exists.
function wirePersistence(uid) {
  window.__riftForgedPersistence = {
    load: async () => {
      const snap = await getDoc(doc(db, "saves", uid));
      return snap.exists() ? JSON.parse(snap.data().data) : null;
    },
    save: async (state) => {
      await setDoc(doc(db, "saves", uid), { data: JSON.stringify(state), updatedAt: Date.now() });
    },
  };
  window.__riftForgedLogout = async () => {
    delete window.__riftForgedPersistence;
    delete window.__riftForgedLogout;
    unwirePvp();
    await signOut(auth);
  };
  wirePvp(uid);
}
function unwirePersistence() {
  delete window.__riftForgedPersistence;
  delete window.__riftForgedLogout;
  unwirePvp();
}

// PvP bridge: gives the game component the live Firestore `db` instance plus
// the signed-in player's uid/username, so PvP matchmaking/battle code can run
// without prop drilling — same convention as the persistence bridge above.
// Username isn't known synchronously (it lives in Firestore, not on the auth
// user object), so it starts null and fills in once the profiles/{uid} read
// resolves; PvP UI should treat a null username as "still loading."
function wirePvp(uid) {
  window.__riftForgedPvp = { db, uid, username: null };
  getDoc(doc(db, "profiles", uid))
    .then((snap) => {
      if (window.__riftForgedPvp && window.__riftForgedPvp.uid === uid) {
        window.__riftForgedPvp.username = snap.exists() ? snap.data().username : null;
      }
    })
    .catch(() => {});
}
function unwirePvp() {
  delete window.__riftForgedPvp;
}

function Root() {
  const [user, setUser] = useState(undefined); // undefined = still checking, null = logged out

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) wirePersistence(u.uid);
      else unwirePersistence();
      setUser(u || null);
    });
    return () => {
      unsub();
      unwirePersistence();
    };
  }, []);

  if (user === undefined) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0812", color: "#B0A6D6", fontFamily: "Georgia, serif", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        auth={auth}
        db={db}
        defaultState={DEFAULT_STATE}
        onAuthed={(u) => {
          // Signup/login already resolved to a user by the time onAuthed
          // fires, but wire persistence here too in case onAuthStateChanged
          // hasn't caught up yet — cheap and idempotent, closes any residual gap.
          wirePersistence(u.uid);
          setUser(u);
        }}
      />
    );
  }

  // key={user.uid} forces a full remount on login/logout so App's internal
  // state hooks re-initialize fresh for whichever account is now active.
  return <App key={user.uid} />;
}

const root = createRoot(document.getElementById("root"));
root.render(<Root />);

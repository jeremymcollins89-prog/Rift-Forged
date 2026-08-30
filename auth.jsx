import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

// Firebase Auth wants an email, but we only ever show the player a username.
// We derive a stable synthetic email from it so login/signup never needs a
// real email address, and enforce uniqueness ourselves via a Firestore
// "usernames" lookup collection (case-insensitive, since email is lowercase).
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@riftforged.local`;
}

const C = {
  void: "#0A0812",
  panel: "#1C1730",
  panel2: "#2A2145",
  line: "#5C4E88",
  bone: "#FBF8FF",
  dim: "#B0A6D6",
  gold: "#FFCB5C",
  danger: "#FF5470",
  bronze: "#CFA36A",
};
const FONT_DISPLAY = "'Cinzel', Georgia, 'Times New Roman', serif";
const FONT_BODY = "'EB Garamond', Georgia, 'Times New Roman', serif";
const FONT_UI = "Georgia, 'Times New Roman', serif";

export default function AuthScreen({ auth, db, defaultState, onAuthed }) {
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const uname = username.trim();
    if (!USERNAME_RE.test(uname)) {
      setError("Username must be 3-20 characters: letters, numbers, underscore only.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (mode === "signup" && password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    const email = usernameToEmail(uname);
    try {
      if (mode === "signup") {
        const unameLower = uname.toLowerCase();
        const takenDoc = await getDoc(doc(db, "usernames", unameLower));
        if (takenDoc.exists()) {
          setError("That username is already taken.");
          setBusy(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "usernames", unameLower), { uid: cred.user.uid });
        await setDoc(doc(db, "saves", cred.user.uid), { data: JSON.stringify(defaultState), updatedAt: Date.now() });
        // Forward lookup (uid -> username) for PvP: showing "you vs. Someone"
        // in the queue/battle needs this without re-reading the usernames
        // collection by value every time.
        await setDoc(doc(db, "profiles", cred.user.uid), { username: uname, updatedAt: Date.now() });
        onAuthed(cred.user);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        // Backfill for accounts created before the profiles collection
        // existed. Cheap idempotent merge, fire-and-forget — login should
        // never be blocked or failed by this.
        setDoc(doc(db, "profiles", cred.user.uid), { username: uname, updatedAt: Date.now() }, { merge: true }).catch(() => {});
        onAuthed(cred.user);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: `radial-gradient(circle at 50% 30%, #251b3a, ${C.void} 70%)`,
        padding: 28,
        fontFamily: FONT_BODY,
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 26 }}>
        <div style={{ fontSize: 10, letterSpacing: 5, color: C.bronze, fontWeight: 700, fontFamily: FONT_UI }}>RIFT-FORGED</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: C.bone, marginTop: 4, fontFamily: FONT_DISPLAY, letterSpacing: 1 }}>CARD RUSH</div>
      </div>

      <form onSubmit={submit} style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          {["login", "signup"].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError("");
              }}
              style={{
                flex: 1,
                background: mode === m ? `linear-gradient(180deg, ${C.panel2}, ${C.panel})` : `${C.panel2}66`,
                border: `1px solid ${mode === m ? C.gold : C.line}`,
                color: mode === m ? C.gold : C.dim,
                fontWeight: 700,
                fontSize: 12,
                padding: "10px 0",
                borderRadius: 3,
                cursor: "pointer",
                fontFamily: FONT_DISPLAY,
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              {m === "login" ? "Log In" : "Sign Up"}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Username"
          autoCapitalize="none"
          autoCorrect="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={inputStyle}
        />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
        {mode === "signup" && (
          <input type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
        )}

        {error && <div style={{ color: C.danger, fontSize: 11.5, fontFamily: FONT_BODY, fontStyle: "italic", textAlign: "center" }}>{error}</div>}

        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: 6,
            background: busy ? C.panel2 : `linear-gradient(180deg, #F3D27A, ${C.gold})`,
            color: busy ? C.dim : "#1a1200",
            border: `1px solid ${busy ? C.line : "#FFE9B0"}`,
            borderRadius: 3,
            padding: "13px 0",
            fontWeight: 700,
            fontFamily: FONT_DISPLAY,
            letterSpacing: 2,
            textTransform: "uppercase",
            fontSize: 12.5,
            cursor: busy ? "default" : "pointer",
            boxShadow: busy ? "none" : `0 0 10px ${C.gold}55`,
          }}
        >
          {busy ? "…" : mode === "login" ? "Enter the Rift" : "Create Account"}
        </button>
      </form>

      <div style={{ color: C.dim, fontSize: 10, fontFamily: FONT_BODY, fontStyle: "italic", marginTop: 20, maxWidth: 300, textAlign: "center", lineHeight: 1.5 }}>
        Your progress saves to your account and follows you to any device you log in on.
      </div>
    </div>
  );
}

function friendlyError(err) {
  const code = err?.code || "";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Incorrect username or password.";
  if (code.includes("user-not-found")) return "No account with that username.";
  if (code.includes("email-already-in-use")) return "That username is already taken.";
  if (code.includes("network-request-failed")) return "Network error — check your connection.";
  if (code.includes("too-many-requests")) return "Too many attempts — try again in a moment.";
  return "Something went wrong. Please try again.";
}

const inputStyle = {
  background: C.panel,
  border: `1px solid ${C.line}`,
  borderRadius: 3,
  color: C.bone,
  fontSize: 14,
  padding: "12px 14px",
  fontFamily: FONT_BODY,
  outline: "none",
};

// admin-login.js
import { app } from "./firebase-config.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

// ✅ Initialize Firebase Auth
const auth = getAuth(app);

// ✅ Ensure session persists across refresh/browser restarts
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("✅ Auth persistence set to LOCAL (survives refresh).");

    // ✅ Handle login form
    const form = document.getElementById("adminLoginForm");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = document.getElementById("adminEmail").value.trim();
        const password = document.getElementById("adminPassword").value.trim();

        try {
          await signInWithEmailAndPassword(auth, email, password);
          console.log("✅ Login success, refreshing token...");
          const user = auth.currentUser;
          if (user) {
            await user.getIdToken(true); // force refresh so claims are loaded
          }
          window.location.href = "admin-dashboard.html";
        } catch (error) {
          console.error("❌ Login error:", error);
          alert("❌ Invalid credentials: " + error.message);
        }
      });
    }
  })
  .catch((error) => {
    console.error("❌ Failed to set persistence:", error);
  });
// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDsajAglyJFpklvzbNVesIakEIFQFTvJpg",
  authDomain: "eco-quick-fix.firebaseapp.com",
  projectId: "eco-quick-fix",
  storageBucket: "eco-quick-fix.firebasestorage.app",
  messagingSenderId: "321869254347",
  appId: "1:321869254347:web:ceac5c5e125db7ea1c554e"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyDQDHlPUTuWxgQAT2R096LUwJIm6256LAQ",
  authDomain: "pppp2546-29555.firebaseapp.com",
  projectId: "pppp2546-29555",
  storageBucket: "pppp2546-29555.appspot.com", // ❗ แก้ตรงนี้ด้วยนะ (เดิมคุณพิมพ์ผิดเป็น .firebasestorage.app)
  messagingSenderId: "628231706266",
  appId: "1:628231706266:web:86b18d77088b6151793123",
  measurementId: "G-ZXF1G3W8Q9"
};

// ✅ Init Firebase
const app = initializeApp(firebaseConfig);

// ✅ Init Firestore
const db = getFirestore(app);

// ✅ (ไม่จำเป็นต้องใช้ analytics ถ้าไม่ได้เปิดใช้งานในโปรเจกต์)
const analytics = getAnalytics(app);

export { db }; // ✅ ส่งออกให้ script.js ใช้

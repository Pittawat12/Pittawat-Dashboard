// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-analytics.js";

// ข้อมูลการตั้งค่า Firebase Project ของคุณ
const firebaseConfig = {
  // 🔴 สำคัญมาก: คุณต้องเปลี่ยน "YOUR_NEW_AND_SECURE_WEB_API_KEY_HERE"
  // เป็น Web API Key ตัวใหม่ที่คุณสร้างขึ้นใน Firebase Console
  // และได้ลบ/เพิกถอน API Key ตัวเก่าที่รั่วไหลไปแล้ว
  apiKey: "AIzaSyDQUm1PUTuWxgQAT2R096LUwJIm6256LAQ",
  authDomain: "pppp2546-29555.firebaseapp.com",
  projectId: "pppp2546-29555",
  // ✅ แก้ไข storageBucket ให้ถูกต้องตามที่คุณระบุ
  storageBucket: "pppp2546-29555.appspot.com", 
  messagingSenderId: "628231706266",
  appId: "1:628231706266:web:86b18d77088b6151793123",
  measurementId: "G-ZXF1G3W8Q9"
};

// ✅ เริ่มต้น Firebase App
const app = initializeApp(firebaseConfig);

// ✅ เริ่มต้น Firestore Database
const db = getFirestore(app);

// ✅ เริ่มต้น Firebase Analytics (ถ้าคุณเปิดใช้งานในโปรเจกต์)
// หากคุณไม่ได้ใช้ Analytics หรือไม่ได้เปิดใช้งานใน Firebase Console
// คุณสามารถลบบรรทัดนี้และบรรทัดที่เกี่ยวข้องกับ analytics ออกได้
const analytics = getAnalytics(app);

// ✅ ส่งออก instance ของ Firestore (db) เพื่อให้ไฟล์ JavaScript อื่นๆ สามารถนำไปใช้ได้
export { db };

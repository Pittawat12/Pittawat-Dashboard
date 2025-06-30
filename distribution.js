import { db } from './firebase.js';
import {
  collection,
  getDocs,
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

// --- ส่วนควบคุมเมนู (ที่เพิ่มเข้ามา) ---
const hamburgerMenu = document.getElementById('hamburgerMenu');
const overlayMenu = document.getElementById('overlayMenu');
const closeMenu = document.getElementById('closeMenu');
// --- จบส่วนควบคุมเมนู ---

const buildingFilter = document.getElementById('buildingFilter');
const patientFilter = document.getElementById('patientFilter');
const patientDetails = document.getElementById('patientDetails');
const dischargeForm = document.getElementById('dischargeForm');

// โหลดรายการตึก
async function loadBuildings() {
  const snapshot = await getDocs(collection(db, 'patients'));
  const buildings = new Set();

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.building) buildings.add(data.building);
  });

  buildings.forEach(building => {
    const option = document.createElement('option');
    option.value = building;
    option.textContent = building;
    buildingFilter.appendChild(option);
  });
}

// โหลดผู้ป่วยจากตึกที่เลือก
async function loadPatientsByBuilding(building) {
  patientFilter.innerHTML = `<option value="">-- เลือกผู้ป่วย --</option>`;
  const snapshot = await getDocs(collection(db, 'patients'));
  let hasPatient = false;

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.building === building) {
      const option = document.createElement('option');
      option.value = doc.id;
      option.textContent = `${data.name || '(ไม่มีชื่อ)'}`;
      patientFilter.appendChild(option);
      hasPatient = true;
    }
  });

  patientFilter.disabled = !hasPatient;
}

// แสดงรายละเอียดผู้ป่วย
async function showPatientDetails(patientId) {
  const docRef = doc(db, 'patients', patientId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const data = docSnap.data();
    patientDetails.innerHTML = `
      <p><strong>ชื่อ:</strong> ${data.name || '-'}</p>
      <p><strong>วินิจฉัย:</strong> ${data.Diagnosis || '-'}</p>
      <p><strong>วัน Admit:</strong> ${data.admissionDate || '-'}</p>
      <p><strong>วันผ่าตัด:</strong> ${data.operationDate || '-'}</p>
    `;
    enableDischargeForm(true);
  } else {
    patientDetails.innerHTML = '<p>ไม่พบข้อมูลผู้ป่วย</p>';
    enableDischargeForm(false);
  }
}

// เปิด/ปิดฟอร์ม
function enableDischargeForm(enabled) {
  document.querySelectorAll('input[name="dischargeOption"]').forEach(el => el.disabled = !enabled);
  document.querySelectorAll('input[name="statusCheckbox"]').forEach(el => el.disabled = !enabled);
  document.getElementById('submitDischarge').disabled = !enabled;
}

// Event: เลือกตึก
buildingFilter.addEventListener('change', (e) => {
  const building = e.target.value;
  if (building) {
    loadPatientsByBuilding(building);
  } else {
    patientFilter.innerHTML = `<option value="">-- เลือกผู้ป่วย --</option>`;
    patientFilter.disabled = true;
    enableDischargeForm(false);
  }
});

// Event: เลือกผู้ป่วย
patientFilter.addEventListener('change', (e) => {
  const patientId = e.target.value;
  if (patientId) {
    showPatientDetails(patientId);
  } else {
    enableDischargeForm(false);
    patientDetails.innerHTML = '';
  }
});

// เริ่มต้นโหลดเมื่อหน้าเว็บพร้อม
window.addEventListener('DOMContentLoaded', () => {
  loadBuildings();
  enableDischargeForm(false);

  // --- เพิ่ม Event Listeners สำหรับควบคุมการเปิด-ปิดเมนู ---
  if (hamburgerMenu && overlayMenu && closeMenu) {
    hamburgerMenu.addEventListener('click', () => {
      overlayMenu.classList.add('open');
      document.body.classList.add('no-scroll'); // ป้องกันการเลื่อนหน้าจอข้างหลัง
    });

    closeMenu.addEventListener('click', () => {
      overlayMenu.classList.remove('open');
      document.body.classList.remove('no-scroll');
    });
  }
  // --- จบส่วน Event Listeners ---
});
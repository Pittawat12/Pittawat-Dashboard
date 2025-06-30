import { db } from './firebase.js';
import {
  collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const tableBody = document.querySelector('#progressTable tbody');
const filterInput = document.getElementById('filterBuilding');

async function loadProgress(buildingFilter = "") {
  const q = buildingFilter
    ? query(collection(db, "progress"), where("building", "==", buildingFilter))
    : collection(db, "progress");
  const snapshot = await getDocs(q);
  tableBody.innerHTML = "";
  snapshot.forEach(doc => {
    const data = doc.data();
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${data.patientId}</td>
      <td>${data.activities.join(", ")}</td>
      <td>${new Date(data.date).toLocaleString()}</td>
    `;
    tableBody.appendChild(row);
  });
}

filterInput.addEventListener('input', () => {
  loadProgress(filterInput.value);
});

loadProgress();
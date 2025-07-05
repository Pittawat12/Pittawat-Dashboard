// delay.js

import { db } from './firebase.js';
import {
    collection, query, where, getDocs, onSnapshot,
    doc, getDoc, updateDoc, addDoc // เพิ่ม addDoc ที่นี่
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

let currentPatientsData = []; // This will now hold combined data for export

// Global maps to hold real-time data from each collection
let patientsDataCache = new Map(); // Stores data from 'patients' collection (patientId -> docData)
let statusesDataCache = new Map(); // Stores data from 'register_process_statuses' collection (patientId -> docData)
let equipmentDataCache = new Map(); // Stores data from 'data' collection (patientId -> docData)

let currentBuildingFilter = 'all'; // Keep track of the current building filter

let globalDischargeCriteria = {}; // To store the common discharge criteria fetched from 'data' collection
let globalEquipment = {};     // To store the common equipment list fetched from 'data' collection

// === Helper Functions for rendering status ===
const renderStatusCheckbox = (isCompleted, label, delayReason) => {
    // The checkbox will be checked and blue if completed, or unchecked and red if not completed (delayed).
    // It will always be disabled as per the requirement in the image.
    const statusClass = isCompleted ? 'blue' : 'red';
    const checkedAttribute = isCompleted ? 'checked' : '';

    // NEW LOGIC for displaying delayReason based on user's specific conditions:
    // Display reason ONLY if completed is TRUE, AND delayReason exists and is not empty string or "weak_null"
    const shouldShowReason = isCompleted && delayReason && delayReason !== '' && delayReason !== 'weak_null';

    return `
        <label class="status-item">
            <input type="checkbox" class="status-checkbox ${statusClass}" ${checkedAttribute} disabled>
            <span>${label}</span>
        </label>
        ${shouldShowReason ? `<p class="delay-reason-text">เหตุผล: ${delayReason}</p>` : ''}
    `;
};

// Helper function for rendering Discharge Criteria (uses global data and patient's selected data)
// This function needs to accept patient-specific criteria.
const renderDischargeCriteria = (patientCriteria) => {
    if (!globalDischargeCriteria || Object.keys(globalDischargeCriteria).length === 0) return '';

    let html = '<h3>Discharge Criteria</h3><div class="checkbox-group">';
    for (const key in globalDischargeCriteria) {
        const labelText = globalDischargeCriteria[key];

        // patientCriteria[key] จะเป็น Object ที่มี checked: true/false และอาจมี time: "..."
        // ตรวจสอบจาก key ที่ดึงมาจาก globalDischargeCriteria
        const criterion = (patientCriteria && patientCriteria[key] && typeof patientCriteria[key] === 'object') ? patientCriteria[key] :
                          // เพิ่มการตรวจสอบสำหรับคีย์ที่สะกดผิด (geriatic) หากคีย์ถูกต้องคือ geriatric
                          (key === 'geriatric' && patientCriteria && patientCriteria['geriatic'] && typeof patientCriteria['geriatic'] === 'object') ? patientCriteria['geriatic'] : null;

        const isChecked = criterion && 'checked' in criterion && criterion.checked;
        // Ensure time is converted to a Date object and then formatted for display.
        // Use Thai locale and appropriate date/time style.
        const time = criterion && criterion.time ? new Date(criterion.time).toLocaleString('th-TH', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''; //

        html += `
            <label class="status-item">
                <input type="checkbox" class="status-checkbox blue" ${isChecked ? 'checked' : ''} disabled>
                <span>${labelText}</span>
            </label>
            ${isChecked && time ? `<p class="discharge-time-text">เวลา: ${time}</p>` : ''}
        `;
    }
    html += '</div>';
    return html;
};

// Helper function for rendering Equipment (uses global data and patient's selected data)
const renderEquipment = (patientId, patientEquipment) => {
    let html = '<h3>อุปกรณ์</h3><div class="checkbox-group">';
    for (const key in globalEquipment) {
        const labelText = globalEquipment[key];
        const isChecked = patientEquipment && (patientEquipment[key] === true || typeof patientEquipment[key] === 'string');
        const equipmentValue = patientEquipment ? patientEquipment[key] : null;

        html += `
            <label class="status-item">
                <input type="checkbox" class="status-checkbox blue"
                       data-patient-id="${patientId}"
                       data-equipment-key="${key}"
                       ${isChecked ? 'checked' : ''}>
                <span>${labelText}</span>
            </label>
        `;
        // Conditionally display the string value for 'other' equipment on the dashboard
        if (key === "other" && isChecked && typeof equipmentValue === 'string') {
            html += `<p class="equipment-detail-text">ระบุ: ${equipmentValue}</p>`;
        }
    }
    html += '</div>';
    return html;
};

// Function to calculate Post-op Day and Length of Stay
const calculateDates = (admissionDateStr, operationDateStr) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

    let postOpDay = 'N/A';
    if (operationDateStr) {
        const opDate = new Date(operationDateStr.split('T')[0]);
        if (!isNaN(opDate.getTime())) {
            opDate.setHours(0, 0, 0, 0);
            const diffDaysOp = Math.floor((today.getTime() - opDate.getTime()) / MILLISECONDS_PER_DAY);
            postOpDay = diffDaysOp;
        }
    }

    let lengthOfStay = 'N/A';
    if (admissionDateStr) {
        const admDate = new Date(admissionDateStr);
        if (!isNaN(admDate.getTime())) {
            admDate.setHours(0, 0, 0, 0);
            const diffTimeAdm = today.getTime() - admDate.getTime();
            lengthOfStay = Math.floor(diffTimeAdm / MILLISECONDS_PER_DAY) + 1;
        }
    }
    return { postOpDay, lengthOfStay };
};


// Function to render patient cards
const renderPatientCards = (patients) => {
    const patientListDiv = document.getElementById('patientList');
    patientListDiv.innerHTML = ''; // Clear previous content
    const noPatientsMessage = document.getElementById('noPatientsMessage');

    if (patients.length === 0) {
        noPatientsMessage.style.display = 'block';
        return;
    } else {
        noPatientsMessage.style.display = 'none';
    }

    patients.forEach(patient => {
        const patientCard = document.createElement('div');
        patientCard.className = 'patient-card';

        const name = patient.name;
        const building = patient.building;
        const { postOpDay, lengthOfStay } = calculateDates(patient.admissionDate, patient.operationDate);

        const sittingCompleted = patient.statuses?.sitting?.completed || false;
        const standingCompleted = patient.statuses?.standing?.completed || false;
        const ambulationCompleted = patient.statuses?.goal_ambulation?.completed || false;
        
        const sittingDelayReason = patient.statuses?.sitting?.delayReason || '';
        const standingDelayReason = patient.statuses?.standing?.delayReason || '';
        const ambulationDelayReason = patient.statuses?.goal_ambulation?.delayReason || '';

        // Determine if there's any delay to set the card border color
        const hasDelay = !sittingCompleted || !standingCompleted || !ambulationCompleted;
        patientCard.classList.add(hasDelay ? 'card-delayed' : 'card-no-delay');

        const patientDischargeCriteria = patient.dischargeCriteria || {};
        const patientEquipment = patient.equipment || {};

        patientCard.innerHTML = `
            <div class="patient-info">
                <h2>${name}</h2>
                <p><strong>ตึก:</strong> ${building}</p>
                <p><strong>Post-Op Day:</strong> ${postOpDay} วัน</p>
                <p><strong>Length of Stay:</strong> ${lengthOfStay} วัน</p>
            </div>
            <div class="status-section">
                <h3>Progress Status</h3>
                ${renderStatusCheckbox(sittingCompleted, 'Sitting', sittingDelayReason)}
                ${renderStatusCheckbox(standingCompleted, 'Standing', standingDelayReason)}
                ${renderStatusCheckbox(ambulationCompleted, 'Goal Ambulation', ambulationDelayReason)}
            </div>
            <div class="discharge-info">
                ${renderDischargeCriteria(patientDischargeCriteria)}
            </div>
            <div class="equipment-info">
                ${renderEquipment(patient.id, patientEquipment)}
            </div>
        `;
        patientListDiv.appendChild(patientCard);
    });
};

// Function to combine cached data and render patients
const combineAndRenderPatients = () => {
    let combinedPatients = [];

    // Iterate through all active patients from the patientsDataCache
    for (const [patientId, patientDocData] of patientsDataCache.entries()) {
        if (!patientDocData.isActive) {
            continue; // Skip inactive patients
        }

        // Apply building filter
        if (currentBuildingFilter !== 'all' && patientDocData.building !== currentBuildingFilter) {
            continue;
        }

        const statusesDoc = statusesDataCache.get(patientId);
        const equipmentDoc = equipmentDataCache.get(patientId);

        // Prepare combined data for rendering
        const statuses = statusesDoc?.statuses || {};
        let dischargeCriteria = equipmentDoc?.dischargeCriteria || {};
        const equipment = equipmentDoc?.equipment || {};

        // Fallback for dischargeCriteria if not in 'data' collection but in 'register_process_statuses'
        if (Object.keys(dischargeCriteria).length === 0 && statusesDoc?.dischargeCriteria) {
            dischargeCriteria = statusesDoc.dischargeCriteria;
        }

        combinedPatients.push({
            id: patientId,
            ...patientDocData,
            statuses: statuses,
            dischargeCriteria: dischargeCriteria,
            equipment: equipment
        });
    }

    currentPatientsData = combinedPatients; // Update the global array used for Excel export
    renderPatientCards(combinedPatients); // Render the combined data
};

// Setup real-time listeners for all relevant collections
const setupRealtimeListeners = () => {
    // Listener for 'patients' collection
    onSnapshot(query(collection(db, "patients")), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "added" || change.type === "modified") {
                patientsDataCache.set(change.doc.id, change.doc.data());
            } else if (change.type === "removed") {
                patientsDataCache.delete(change.doc.id);
                // Also remove related data from other caches if patient is removed
                statusesDataCache.delete(change.doc.id);
                equipmentDataCache.delete(change.doc.id);
            }
        });
        console.log("Patients collection updated, triggering re-render.");
        combineAndRenderPatients();
    }, (error) => {
        console.error("Error listening to patients collection: ", error);
    });

    // Listener for 'register_process_statuses' collection
    // Assumes patientId is a field in the status document
    onSnapshot(query(collection(db, "register_process_statuses")), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const patientIdFromStatusDoc = change.doc.data().patientId;
            if (change.type === "added" || change.type === "modified") {
                // Only store if the status doc is active, or if it's the latest one for the patient
                // This logic assumes there's an 'isActive' field and only one active status doc per patient
                if (change.doc.data().isActive) {
                    statusesDataCache.set(patientIdFromStatusDoc, change.doc.data());
                } else {
                    statusesDataCache.delete(patientIdFromStatusDoc); // If it became inactive, remove it
                }
            } else if (change.type === "removed") {
                statusesDataCache.delete(patientIdFromStatusDoc);
            }
        });
        console.log("Statuses collection updated, triggering re-render.");
        combineAndRenderPatients();
    }, (error) => {
        console.error("Error listening to register_process_statuses collection: ", error);
    });

    // Listener for 'data' collection
    // Assumes patientId is a field in the data document
    onSnapshot(query(collection(db, "data")), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const patientIdFromDataDoc = change.doc.data().patientId;
            if (change.type === "added" || change.type === "modified") {
                equipmentDataCache.set(patientIdFromDataDoc, change.doc.data());
            } else if (change.type === "removed") {
                equipmentDataCache.delete(patientIdFromDataDoc);
            }
        });
        console.log("Data collection updated, triggering re-render.");
        combineAndRenderPatients();
    }, (error) => {
        console.error("Error listening to data collection: ", error);
    });
};

// Function to fetch buildings for the filter (remains largely same)
const fetchBuildings = async () => {
    try {
        const q = query(collection(db, "patients"), where("isActive", "==", true));
        const snapshot = await getDocs(q); // Use getDocs here as buildings are relatively static
        const buildings = new Set();
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.building) {
                buildings.add(data.building);
            }
        });

        const buildingSelect = document.getElementById('building');
        buildingSelect.innerHTML = '<option value="all">ทั้งหมด</option>';
        buildings.forEach(building => {
            const option = document.createElement('option');
            option.value = building;
            option.textContent = building;
            buildingSelect.appendChild(option);
        });

        // Set initial filter and trigger initial render
        buildingSelect.value = currentBuildingFilter; // Ensure the select reflects current filter
        combineAndRenderPatients(); // Initial render after buildings are loaded

    } catch (error) {
        console.error("Error fetching buildings: ", error);
    }
};

// Function to fetch common discharge criteria and equipment from 'data' collection (remains same)
const fetchCommonData = async () => {
    try {
        globalDischargeCriteria = {
            geriatric: 'Geriatric',
            orthopedist: 'Orthopedist',
            physical_therapist: 'Physical Therapist'
        };

        globalEquipment = {
            cane: 'Cane',
            walker: 'Walker',
            wheel_chair: 'wheel chair',
            other: 'อื่นๆ ระบุ'
        };
        
        console.log("Fetched common discharge options (transformed):", globalDischargeCriteria);
        console.log("Fetched common equipment (transformed):", globalEquipment); 

    } catch (error) {
        console.error("Error fetching common data:", error);
    }
};

// Function to update patient equipment in Firestore (remains same logic, now triggers real-time listener)
async function updatePatientEquipment(patientId, equipmentKey, isChecked) {
    console.log(`Attempting to update equipment: ${equipmentKey} to ${isChecked} for patientId: ${patientId}`);

    try {
        const dataCollectionRef = collection(db, "data");
        const q = query(dataCollectionRef, where("patientId", "==", patientId));
        const querySnapshot = await getDocs(q);

        const updateData = {};
        updateData[`equipment.${equipmentKey}`] = isChecked;

        if (!querySnapshot.empty) {
            const existingDoc = querySnapshot.docs[0];
            const dataDocRef = doc(db, "data", existingDoc.id);
            await updateDoc(dataDocRef, updateData);
            console.log(`Successfully updated existing equipment for patient ${patientId} (Doc ID: ${existingDoc.id})`);
        } else {
            const initialData = {
                patientId: patientId,
                equipment: {
                    [equipmentKey]: isChecked
                },
                dischargeCriteria: {}
            };
            const newDocRef = await addDoc(dataCollectionRef, initialData);
            console.log(`Successfully created new data document for patient ${patientId} (Doc ID: ${newDocRef.id}) and updated equipment.`);
        }
    } catch (error) {
        console.error(`Error updating/creating equipment for patient ${patientId} (Key: ${equipmentKey}, Value: ${isChecked}):`, error);
        alert(`เกิดข้อผิดพลาดในการอัปเดต/สร้างข้อมูลอุปกรณ์สำหรับผู้ป่วย ${patientId}: ${error.message}`);
    }
}


// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded. Initializing scripts for delay.html.');

    await fetchCommonData();
    setupRealtimeListeners(); // Initialize real-time listeners first
    await fetchBuildings(); // Then fetch buildings and trigger initial render via combineAndRenderPatients

    const buildingSelect = document.getElementById('building');
    if (buildingSelect) {
        buildingSelect.addEventListener('change', (event) => {
            // No need to call fetchPatients with await, just update filter and re-render
            currentBuildingFilter = event.target.value;
            combineAndRenderPatients();
        });
    }

    const exportExcelBtn = document.getElementById('exportExcelBtn');

    const exportPatientsToExcel = () => {
        if (currentPatientsData.length === 0) {
            alert("ไม่มีข้อมูลผู้ป่วยให้ดาวน์โหลด");
            return;
        }

        const dataToExport = currentPatientsData.map(p => {
            const { postOpDay, lengthOfStay } = calculateDates(p.admissionDate, p.operationDate);

            const sittingCompleted = p.statuses?.sitting?.completed || false;
            const sittingDelayReason = p.statuses?.sitting?.delayReason || '';
            const standingCompleted = p.statuses?.standing?.completed || false;
            const standingDelayReason = p.statuses?.standing?.delayReason || '';
            const ambulationCompleted = p.statuses?.goal_ambulation?.completed || false;
            const ambulationDelayReason = p.statuses?.goal_ambulation?.delayReason || '';

            const row = {
                'HN': p.id || '',
                'Name': p.name || '',
                'Building': p.building || '',
                'Post-Op Day': postOpDay,
                'Length of Stay': lengthOfStay,
                'Sitting (Completed)': sittingCompleted ? '✔' : '✖',
                'Sitting (Delay Reason)': sittingDelayReason,
                'Standing (Completed)': standingCompleted ? '✔' : '✖',
                'Standing (Delay Reason)': standingDelayReason,
                'Goal Ambulation (Completed)': ambulationCompleted ? '✔' : '✖',
                'Goal Ambulation (Delay Reason)': ambulationDelayReason,
            };

            for (const key in globalDischargeCriteria) {
                const label = globalDischargeCriteria[key];
                const criterion = (p.dischargeCriteria && p.dischargeCriteria[key] && typeof p.dischargeCriteria[key] === 'object') ? p.dischargeCriteria[key] :
                                  (key === 'geriatric' && p.dischargeCriteria && p.dischargeCriteria['geriatic'] && typeof p.dischargeCriteria['geriatic'] === 'object') ? p.dischargeCriteria['geriatic'] : null;

                const isChecked = criterion && 'checked' in criterion && criterion.checked;
                const time = criterion && criterion.time ? new Date(criterion.time).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '';

                row[`: ${label}`] = isChecked ? '✔' : '✖';
                row[`: ${label} (เวลา)`] = time;
            }

            for (const key in globalEquipment) {
                const label = globalEquipment[key];
                const isChecked = p.equipment && (p.equipment[key] === true || typeof p.equipment[key] === 'string');
                
                if (key === "other") {
                    row[`อุปกรณ์: ${label}`] = isChecked ? '✔' : '✖';
                    row[`อุปกรณ์: ${label} (ระบุ)`] = isChecked && typeof p.equipment[key] === 'string' ? p.equipment[key] : '';
                } else {
                    row[`อุปกรณ์: ${label}`] = isChecked ? '✔' : '✖';
                }
            }
            return row;
        });

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "DelayPatients");
        const filename = `Progress_Goal_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);
    };

    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', exportPatientsToExcel);
    }

    const patientListDiv = document.getElementById('patientList');
    if (patientListDiv) {
        patientListDiv.addEventListener('change', async (event) => {
            if (event.target.matches('.equipment-info input[type="checkbox"]')) {
                const checkbox = event.target;
                const patientId = checkbox.dataset.patientId;
                const equipmentKey = checkbox.dataset.equipmentKey;
                const isChecked = checkbox.checked;

                if (patientId && equipmentKey) {
                    await updatePatientEquipment(patientId, equipmentKey, isChecked);
                } else {
                    console.warn("Missing patientId or equipmentKey for update.", {patientId, equipmentKey});
                    alert("ไม่สามารถอัปเดตอุปกรณ์ได้: ข้อมูลผู้ป่วยไม่สมบูรณ์");
                }
            }
        });
    }

    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const overlayMenu = document.getElementById('overlayMenu');
    const closeMenuBtn = document.getElementById('closeMenu');
    const body = document.body;

    if (hamburgerMenu && overlayMenu && closeMenuBtn) {
        hamburgerMenu.addEventListener('click', (event) => {
            event.stopPropagation();
            overlayMenu.classList.add('open');
            body.classList.add('no-scroll');
        });

        closeMenuBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            overlayMenu.classList.remove('open');
            body.classList.remove('no-scroll');
        });

        document.querySelectorAll('.overlay-menu .nav-list a').forEach(link => {
            link.addEventListener('click', () => {
                overlayMenu.classList.remove('open');
                body.classList.remove('no-scroll');
            });
        });

        overlayMenu.addEventListener('click', (event) => {
            if (event.target === overlayMenu) {
                overlayMenu.classList.remove('open');
                body.classList.remove('no-scroll');
            }
        });
    }

    const activeNavLinks = document.querySelectorAll('.overlay-menu .nav-list a');
    const currentPath = window.location.pathname.split('/').pop();
    activeNavLinks.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        } else if (currentPath === '' && link.getAttribute('href') === 'progress.html') {
            link.classList.add('active');
        }
    });
});
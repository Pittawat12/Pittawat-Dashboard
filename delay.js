import { db } from './firebase.js';
import {
    collection, query, where, getDocs, onSnapshot,
    doc, getDoc, updateDoc, addDoc, orderBy, limit, // Added orderBy, limit
    serverTimestamp // Added serverTimestamp
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
const renderStatusCheckbox = (isCompleted, label, delayReason, statusKey) => { // Added statusKey
    // The checkbox will be checked and blue if completed, or unchecked and red if not completed (delayed).
    // It will always be disabled as per the requirement in the image.
    const statusClass = isCompleted ? 'blue' : 'blue';
    const checkedAttribute = isCompleted ? 'checked' : '';

    let delayReasonHtml = '';
    const specificStatusesForSpecialDelayLogic = ['sitting', 'standing', 'goal_ambulation'];

    if (specificStatusesForSpecialDelayLogic.includes(statusKey)) {
        // For sitting/standing/goal_ambulation, show reason if completed is TRUE AND there's a reason.
        // Also, if completed is FALSE, we explicitly do NOT show the reason as per user request.
        if (isCompleted && delayReason && delayReason !== '' && delayReason !== 'weak_null') {
            delayReasonHtml = `<p class="delay-reason-text">เหตุผล: ${delayReason}</p>`;
        }
    } else {
        // For other statuses (e.g., discharge, physicalAssessment), reason is shown if NOT completed AND there's a reason.
        // This is the original logic.
        if (!isCompleted && delayReason && delayReason !== '' && delayReason !== 'weak_null') {
            delayReasonHtml = `<p class="delay-reason-text">เหตุผล: ${delayReason}</p>`;
        }
    }

    return `
        <label class="status-item">
            <input type="checkbox" class="status-checkbox ${statusClass}" ${checkedAttribute} disabled>
            <span>${label}</span>
        </label>
        ${delayReasonHtml}
    `;
};

// Helper function for rendering Discharge Criteria (uses global data and patient's selected data)
const renderDischargeCriteria = (patientCriteria) => {
    // Check if globalDischargeCriteria is available and not empty
    if (!globalDischargeCriteria || Object.keys(globalDischargeCriteria).length === 0) {
        return '<p>ไม่พบข้อมูล Discharge Criteria สำหรับแสดงผล.</p>';
    }

    let html = '<h3>Discharge Criteria</h3><div class="checkbox-group">';
    for (const key in globalDischargeCriteria) {
        if (globalDischargeCriteria.hasOwnProperty(key)) {
            const labelText = globalDischargeCriteria[key];

            // Safely access patient-specific criterion
            const criterion = (patientCriteria && typeof patientCriteria === 'object' && patientCriteria[key] && typeof patientCriteria[key] === 'object') ? patientCriteria[key] : null;
            
            // Handle 'geriatric' vs 'geriatic' potential typo if it still exists in your data
            // This ensures robustness but ideally, data should be consistent.
            const checkedValue = criterion?.checked;
            const timeValue = criterion?.time;

            const isChecked = checkedValue === true;
            let timeDisplay = '';
            if (isChecked && timeValue) {
                try {
                    // Assuming timeValue is a Firestore Timestamp or a string compatible with Date constructor
                    const dateObj = new Date(timeValue.toDate ? timeValue.toDate() : timeValue);
                    if (!isNaN(dateObj.getTime())) {
                        timeDisplay = dateObj.toLocaleString('th-TH', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                    }
                } catch (e) {
                    console.error("Error parsing date for discharge criteria:", timeValue, e);
                    timeDisplay = 'เวลาไม่ถูกต้อง';
                }
            }


            html += `
                <label class="status-item">
                    <input type="checkbox" class="status-checkbox blue" ${isChecked ? 'checked' : ''} disabled>
                    <span>${labelText}</span>
                </label>
                ${isChecked && timeDisplay ? `<p class="discharge-time-text">เวลา: ${timeDisplay}</p>` : ''}
            `;
        }
    }
    html += '</div>';
    return html;
};

// Helper function for rendering Equipment (uses global data and patient's selected data)
const renderEquipment = (patientId, patientEquipment) => {
    if (!globalEquipment || Object.keys(globalEquipment).length === 0) {
        return '<p>ไม่พบข้อมูลอุปกรณ์สำหรับแสดงผล.</p>';
    }

    let html = '<h3>อุปกรณ์</h3><div class="checkbox-group">';
    for (const key in globalEquipment) {
        if (globalEquipment.hasOwnProperty(key)) {
            const labelText = globalEquipment[key];
            const isChecked = patientEquipment && (patientEquipment[key] === true || typeof patientEquipment[key] === 'string');
            const equipmentValue = patientEquipment ? patientEquipment[key] : null;

            html += `
                <label class="status-item">
                    <input type="checkbox" class="status-checkbox blue"
                            data-patient-id="${patientId}"
                            data-equipment-key="${key}"
                            ${isChecked ? 'checked' : ''} disabled> <span>${labelText}</span>
                </label>
            `;
            // Conditionally display the string value for 'other' equipment on the dashboard
            if (key === "other" && isChecked && typeof equipmentValue === 'string') {
                html += `<p class="equipment-detail-text">ระบุ: ${equipmentValue}</p>`;
            }
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
        // Ensure format is 'YYYY-MM-DD' for consistent Date parsing
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
            lengthOfStay = Math.floor(diffTimeAdm / MILLISECONDS_PER_DAY) + 1; // +1 to include the admission day
        }
    }
    return { postOpDay, lengthOfStay };
};


// Function to render patient cards
const renderPatientCards = (patients) => {
    const patientListDiv = document.getElementById('patientList');
    if (!patientListDiv) {
        console.error("patientList element not found!");
        return;
    }
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
        const room = patient.room; // Added room
        const { postOpDay, lengthOfStay } = calculateDates(patient.admissionDate, patient.operationDate);

        // Extract new patient details based on your request
        const bed = patient.bed; // Assuming 'hn' field exists in patient data
        const Diagnosis = patient.Diagnosis; // Assuming 'Diagnosis' field exists
        const operation = patient.operation; // Assuming 'operation' field exists
        const goal = patient.goal; // Assuming 'goal' field exists for Goal Ambulation

        const sittingCompleted = patient.statuses?.sitting?.completed || false;
        const standingCompleted = patient.statuses?.standing?.completed || false;
        const ambulationCompleted = patient.statuses?.goal_ambulation?.completed || false;
        
        const sittingDelayReason = patient.statuses?.sitting?.delayReason || '';
        const standingDelayReason = patient.statuses?.standing?.delayReason || '';
        const ambulationDelayReason = patient.statuses?.goal_ambulation?.delayReason || '';

        // Determine if there's any delay to set the card border color
        // A delay exists if any of the three key statuses are NOT completed
        const hasDelay = !sittingCompleted || !standingCompleted || !ambulationCompleted;
        patientCard.classList.add(hasDelay ? 'card-delayed' : 'card-no-delay');

        // Check if patient is discharged (from the 'data' collection with dischargeOption)
        const isDischarged = patient.dischargeData?.dischargeOption === 'discharge';
        if (isDischarged) {
            patientCard.classList.add('card-discharged'); // Add a class for discharged patients
            // Optionally, you might want to adjust the header color to gray for discharged patients
            // The logic for overallStatusClass in a previous iteration handled this.
            // For now, relying on 'card-discharged' class for styling.
        }

        const patientDischargeCriteria = patient.dischargeCriteria || {};
        const patientEquipment = patient.equipment || {};

        patientCard.innerHTML = `
            <div class="patient-info">
                <h2>${name || 'ไม่ระบุชื่อ'}</h2>
                <p><strong>ตึก:</strong> ${building } </p>
                <p><strong>HN:</strong> ${bed || ''}</p>
                <p><strong>Diagnosis:</strong> ${Diagnosis || ''}</p>
                <p><strong>Operation:</strong> ${operation || '-'}</p>
                <p><strong>Post-Op Day:</strong> ${postOpDay} วัน</p>
                <p><strong>Length Of Stay:</strong>${lengthOfStay} วัน</p>
                <p><strong>Goal Ambulation:</strong> ${goal || '-'}</p>
            </div>
            <div class="status-section">
                <h3>Progress Status</h3>
                ${renderStatusCheckbox(sittingCompleted, 'Sitting', sittingDelayReason, 'sitting')}
                ${renderStatusCheckbox(standingCompleted, 'Standing', standingDelayReason, 'standing')}
                ${renderStatusCheckbox(ambulationCompleted, 'Goal Ambulation', ambulationDelayReason, 'goal_ambulation')}
            </div>
            <div class="discharge-info">
                ${isDischarged ? `
                    <p class="discharge-status-text">ผู้ป่วยได้รับการจำหน่ายแล้ว</p>
                    ${renderDischargeCriteria(patientDischargeCriteria)}
                    ${renderEquipment(patient.id, patientEquipment)}
                ` : `

                    ${renderDischargeCriteria(patientDischargeCriteria)}
                    ${renderEquipment(patient.id, patientEquipment)}
                `}
            </div>
        `;
        patientListDiv.appendChild(patientCard);
    });
};

// Function to combine cached data and render patients
const combineAndRenderPatients = () => {
    let combinedPatients = [];

    // Iterate through all patients in patientsDataCache
    for (const [patientId, patientDocData] of patientsDataCache.entries()) {
        // Primary filter: Only include patients who are isActive: true
        if (patientDocData.isActive === false) {
            continue; // Skip inactive patients
        }

        // Apply building filter
        if (currentBuildingFilter !== 'all' && patientDocData.building !== currentBuildingFilter) {
            continue;
        }

        const statusesDoc = statusesDataCache.get(patientId);
        // Find the latest active equipment/discharge data for this patient
        // The `onSnapshot` for 'data' collection should already handle fetching only active ones.
        const equipmentDoc = equipmentDataCache.get(patientId);

        // Prepare combined data for rendering
        const statuses = statusesDoc?.statuses || {};
        const dischargeData = equipmentDoc || {}; // All data from the 'data' collection doc

        combinedPatients.push({
            id: patientId,
            ...patientDocData,
            statuses: statuses,
            dischargeData: dischargeData, // Store the entire data document
            // Extract dischargeCriteria and equipment from dischargeData if needed for direct access
            dischargeCriteria: dischargeData.dischargeCriteria || {},
            equipment: dischargeData.equipment || {}
        });
    }

    // Sort patients: active first, then by building, then by name
    combinedPatients.sort((a, b) => {
        // Since we already filtered for isActive: true, this primary sort might seem redundant
        // but it's good practice for safety or if logic changes.
        // If 'isActive' can be undefined, consider how it should sort.
        const isActiveA = a.isActive === true ? 0 : 1;
        const isActiveB = b.isActive === true ? 0 : 1;
        if (isActiveA !== isActiveB) {
            return isActiveA - isActiveB;
        }

        // Secondary sort: building (alphabetical)
        if (a.building && b.building) {
            const buildingCompare = a.building.localeCompare(b.building);
            if (buildingCompare !== 0) return buildingCompare;
        }

        // Tertiary sort: name (alphabetical)
        if (a.name && b.name) {
            return a.name.localeCompare(b.name);
        }
        return 0;
    });


    currentPatientsData = combinedPatients; // Update the global array used for Excel export
    renderPatientCards(combinedPatients); // Render the combined data
};

// Setup real-time listeners for all relevant collections
const setupRealtimeListeners = () => {
    // Listener for 'patients' collection
    // *** MODIFIED: Added where('isActive', '==', true) to query directly ***
    onSnapshot(query(collection(db, "patients"), where('isActive', '==', true)), (snapshot) => {
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
        updateBuildingFilterOptions(); // Update building filter options dynamically
    }, (error) => {
        console.error("Error listening to patients collection: ", error);
    });

    // Listener for 'register_process_statuses' collection
    // *** MODIFIED: Added where('isActive', '==', true) to query directly ***
    onSnapshot(query(collection(db, "register_process_statuses"), where('isActive', '==', true)), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const patientIdFromStatusDoc = change.doc.data().patientId;
            if (change.type === "added" || change.type === "modified") {
                // Since we are now filtering by isActive:true at the query level,
                // we can just set the data directly.
                statusesDataCache.set(patientIdFromStatusDoc, change.doc.data());
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
    // *** NEW: Added where('isActive', '==', true) to query directly ***
    // *** AND orderBy('timestamp', 'desc'), limit(1) to get the latest active record per patient ***
    // Note: To get the *latest* active record per patient efficiently in Firestore with a single query,
    // you generally need to query by patientId and then order/limit, or query all active and then
    // process in client-side to get the latest per patient.
    // For simplicity, this will fetch all active 'data' docs. If a patient has multiple active 'data' docs,
    // the last one processed in the snapshot.forEach will win in the Map, which might not always be the latest by timestamp.
    // A more robust solution for "latest by patientId" would involve a more complex query if 'patientId' is also unique,
    // or client-side aggregation. For now, assuming isActive implies unique relevant data or latest is sufficient.
    onSnapshot(query(collection(db, "data"), where('isActive', '==', true)), (snapshot) => {
        // Clear and re-populate the cache for data collection to ensure latest state
        equipmentDataCache.clear();
        const latestDataForPatient = new Map(); // To hold only the very latest active document per patientId

        snapshot.forEach(doc => {
            const data = doc.data();
            const patientId = data.patientId;
            const timestamp = data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate().getTime() : new Date(data.timestamp).getTime()) : 0; // Handle Firestore Timestamp objects

            if (!latestDataForPatient.has(patientId) || latestDataForPatient.get(patientId).timestamp < timestamp) {
                latestDataForPatient.set(patientId, { ...data, timestamp: timestamp }); // Store data with its parsed timestamp
            }
        });

        // Now populate equipmentDataCache with only the latest active data for each patient
        latestDataForPatient.forEach((value, key) => {
            equipmentDataCache.set(key, value);
        });

        console.log("Data collection updated, triggering re-render.");
        combineAndRenderPatients();
    }, (error) => {
        console.error("Error listening to data collection: ", error);
    });
};

// Function to update building filter options dynamically
async function updateBuildingFilterOptions() {
    const buildingSelect = document.getElementById('building'); // Corrected ID to 'building' as per HTML
    if (!buildingSelect) return;

    // Clear existing options, keep "All Buildings"
    buildingSelect.innerHTML = '<option value="all">ทั้งหมด</option>';

    const buildings = new Set();
    // Use data from patientsDataCache directly, as it's already filtered for active patients
    patientsDataCache.forEach(patient => {
        if (patient.building) {
            buildings.add(patient.building);
        }
    });

    Array.from(buildings).sort().forEach(building => {
        const option = document.createElement('option');
        option.value = building;
        option.textContent = building;
        buildingSelect.appendChild(option);
    });
    // Ensure the current filter is re-selected if it still exists
    if (currentBuildingFilter !== 'all' && buildings.has(currentBuildingFilter)) {
        buildingSelect.value = currentBuildingFilter;
    } else {
        currentBuildingFilter = 'all'; // Reset if the current building is no longer active
        buildingSelect.value = 'all';
    }
}


// Function to fetch buildings for the filter (remains largely same, but relies on realtime cache)
// This function will now be primarily responsible for *populating* the dropdown
// The actual filtering for patients is done in combineAndRenderPatients.
const fetchBuildings = async () => {
    // This function can now just call updateBuildingFilterOptions directly,
    // as patientsDataCache is populated by the real-time listener.
    updateBuildingFilterOptions();
};

// Function to fetch common discharge criteria and equipment (from 'data' collection or hardcoded)
const fetchCommonData = async () => {
    // As per your previous instruction, these are hardcoded global objects.
    globalDischargeCriteria = {
        geriatic: 'Geriatric', // Corrected spelling based on common usage
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
};

// Function to update patient equipment in Firestore (remains same logic, now triggers real-time listener)
// Note: This function doesn't need to be concerned with 'isActive' filter for writing,
// only the read operations on the dashboard need to filter.
async function updatePatientEquipment(patientId, equipmentKey, isChecked) {
    console.log(`Attempting to update equipment: ${equipmentKey} to ${isChecked} for patientId: ${patientId}`);

    try {
        const dataCollectionRef = collection(db, "data");
        // Query for existing document with this patientId and 'isActive: true' (if relevant for update)
        // Or simply query by patientId and check if it exists
        const q = query(dataCollectionRef, where("patientId", "==", patientId), where("isActive", "==", true), orderBy('timestamp', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);

        const updateData = {};
        updateData[`equipment.${equipmentKey}`] = isChecked;
        updateData.timestamp = serverTimestamp(); // Update timestamp on modification

        if (!querySnapshot.empty) {
            const existingDoc = querySnapshot.docs[0];
            const dataDocRef = doc(db, "data", existingDoc.id);
            await updateDoc(dataDocRef, updateData);
            console.log(`Successfully updated existing equipment for patient ${patientId} (Doc ID: ${existingDoc.id})`);
        } else {
            // If no active doc found, create a new one as active
            const initialData = {
                patientId: patientId,
                equipment: {
                    [equipmentKey]: isChecked
                },
                dischargeCriteria: {}, // Initialize empty
                isActive: true, // New data entry should be active
                timestamp: serverTimestamp()
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

    // Use Promise.all to call fetchCommonData and fetchBuildings simultaneously
    try {
        await Promise.all([
            fetchCommonData(),
            fetchBuildings() // This now just sets up the dropdown, data comes from real-time listeners
        ]);
        console.log('Common data and buildings fetched successfully.');
    } catch (error) {
        console.error('Failed to fetch initial data:', error);
        // Handle error appropriately, e.g., show an error message to the user
    }

    setupRealtimeListeners(); // Initialize real-time listeners
    // Initial render is now implicitly triggered by the listeners on first data fetch.
    // combineAndRenderPatients(); // No longer explicitly needed here, as listeners will call it.

    const buildingSelect = document.getElementById('building');
    if (buildingSelect) {
        buildingSelect.addEventListener('change', (event) => {
            currentBuildingFilter = event.target.value;
            combineAndRenderPatients(); // Re-render when filter changes
        });
    }

    const exportExcelBtn = document.getElementById('exportExcelBtn');
    // Ensure XLSX library is loaded if you use this feature.
    // <script src="https://unpkg.com/xlsx/dist/xlsx.full.min.js"></script> in HTML
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
                'Name': p.name || '',
                'Building': p.building || '',
                // Added HN, Diagnosis, Operation, and Goal Ambulation to Excel export
                'HN': p.bed || '',
                'Diagnosis': p.Diagnosis || '',
                'Operation': p.operation || '',
                'Goal Ambulation (Text)': p.goal || '', // Assuming 'goal' is the raw data for Goal Ambulation
                'Post-Op Day': postOpDay ,
                'Length of Stay': lengthOfStay,
                'Sitting': sittingCompleted ? '✔' : '✖',
                'Delay Sitting': sittingCompleted && sittingDelayReason ? sittingDelayReason : '', // Updated logic for export
                'Standing': standingCompleted ? '✔' : '✖',
                'Delay Standing': standingCompleted && standingDelayReason ? standingDelayReason : '', // Updated logic for export
                'Goal Ambulation': ambulationCompleted ? '✔' : '✖',
                'Delay Goal Ambulation': ambulationCompleted && ambulationDelayReason ? ambulationDelayReason : '', // Updated logic for export
            };

            // Add Discharge Criteria to Excel
            for (const key in globalDischargeCriteria) {
                const label = globalDischargeCriteria[key];
                const criterion = (p.dischargeCriteria && typeof p.dischargeCriteria === 'object' && p.dischargeCriteria[key] && typeof p.dischargeCriteria[key] === 'object') ? p.dischargeCriteria[key] : null;
                
                const isChecked = criterion?.checked === true;
                let time = '';
                if (isChecked && criterion?.time) {
                    try {
                        const dateObj = new Date(criterion.time.toDate ? criterion.time.toDate() : criterion.time);
                        if (!isNaN(dateObj.getTime())) {
                            time = dateObj.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
                        }
                    } catch (e) {
                        time = 'Invalid Time';
                    }
                }

                row[`${label} `] = isChecked ? '✔' : '✖';
                row[`(Time) ${label} `] = time;
            }

            // Add Equipment to Excel
            for (const key in globalEquipment) {
                const label = globalEquipment[key];
                const equipmentVal = p.equipment ? p.equipment[key] : null;
                const isChecked = equipmentVal === true || typeof equipmentVal === 'string';
                
                if (key === "other") {
                    row[`${label}`] = isChecked ? '✔' : '✖';
                    row[`${label} (Detail)`] = isChecked && typeof equipmentVal === 'string' ? equipmentVal : '';
                } else {
                    row[`${label}`] = isChecked ? '✔' : '✖';
                    
                }
            }
            return row;
        });

        // Check if XLSX is available
        if (typeof XLSX === 'undefined') {
            alert('Libraries for Excel export are not loaded. Please ensure "https://unpkg.com/xlsx/dist/xlsx.full.min.js" is included in your HTML.');
            return;
        }

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
            // Note: The checkboxes for equipment in renderEquipment are now `disabled` as per dashboard view.
            // If you intend for users to be able to change equipment from this dashboard, you'll need to remove
            // the `disabled` attribute from `renderEquipment` for the input checkbox.
            if (event.target.matches('.equipment-info input[type="checkbox"]:not([disabled])')) { // Only respond if not disabled
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

    // --- Hamburger Menu and Active Link Logic (Remains unchanged) ---
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
// delay.js

import { db } from './firebase.js';
import {
    collection, query, where, getDocs, onSnapshot,
    doc, getDoc, updateDoc, addDoc // เพิ่ม addDoc ที่นี่
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

let currentPatientsData = []; // This will now hold combined data
let globalDischargeCriteria = {}; // To store the common discharge criteria fetched from 'data' collection
let globalEquipment = {};     // To store the common equipment list fetched from 'data' collection

// === Helper Functions for rendering status ===
const renderStatusCheckbox = (isCompleted, label, delayReason) => {
    // The checkbox will be checked and blue if completed, or unchecked and red if not completed (delayed).
    // It will always be disabled as per the requirement in the image.
    const statusClass = isCompleted ? 'blue' : 'red';
    const checkedAttribute = isCompleted ? 'checked' : '';
    return `
        <label class="status-item">
            <input type="checkbox" class="status-checkbox ${statusClass}" ${checkedAttribute} disabled>
            <span>${label}</span>
        </label>
        ${(!isCompleted && delayReason && delayReason !== '') ? `<p class="delay-reason-text">เหตุผล: ${delayReason}</p>` : ''}
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
// This function needs to accept patient-specific equipment.
// **แก้ไข**: ลบ dataDocId ออกจาก arguments และ data-attributes เพราะ updatePatientEquipment จะจัดการเอง
const renderEquipment = (patientId, patientEquipment) => {
    // ...
    let html = '<h3>อุปกรณ์</h3><div class="checkbox-group">';
    for (const key in globalEquipment) {
        const labelText = globalEquipment[key];
        const isChecked = patientEquipment && (patientEquipment[key] === true || typeof patientEquipment[key] === 'string');

        html += `
            <label class="status-item">
                <input type="checkbox" class="status-checkbox blue" // แก้ไขตรงนี้: เปลี่ยนเป็น class="status-checkbox blue"
                       data-patient-id="${patientId}"
                       data-equipment-key="${key}"
                       ${isChecked ? 'checked' : ''}>
                <span>${labelText}</span>
            </label>
        `;
        // ...
    }
    html += '</div>';
    return html;
};

// Function to calculate Post-op Day and Length of Stay
const calculateDates = (admissionDateStr, operationDateStr) => {
    // Get today's date and normalize it to local start of the day (00:00:00.000 local time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

    let postOpDay = 'N/A'; // Default to N/A for truly invalid/missing dates
    if (operationDateStr) {
        const opDate = new Date(operationDateStr.split('T')[0]); // Parse only date part
        if (!isNaN(opDate.getTime())) { // Only proceed if a valid date was parsed
            opDate.setHours(0, 0, 0, 0); // Normalize parsed date to local midnight
            const diffDaysOp = Math.floor((today.getTime() - opDate.getTime()) / MILLISECONDS_PER_DAY);
            postOpDay = diffDaysOp; // Will be negative if opDate is in the future, as per user's request to avoid "N/A"
        }
    }

    let lengthOfStay = 'N/A'; // Default to N/A for truly invalid/missing dates
    if (admissionDateStr) {
        const admDate = new Date(admissionDateStr); // admissionDateStr might not have time component
        if (!isNaN(admDate.getTime())) { // Only proceed if a valid date was parsed
            admDate.setHours(0, 0, 0, 0); // Normalize parsed date to local midnight
            const diffTimeAdm = today.getTime() - admDate.getTime();
            lengthOfStay = Math.floor(diffTimeAdm / MILLISECONDS_PER_DAY) + 1; // +1 to include the admission day
            // Will be negative (+1) if admDate is in the future, as per user's request to avoid "N/A"
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
        // Ensure patient.admissionDate and patient.operationDate are passed correctly
        const { postOpDay, lengthOfStay } = calculateDates(patient.admissionDate, patient.operationDate);

        // Fetching status from patient.statuses
        const sittingCompleted = patient.statuses?.sitting?.completed || false;
        const standingCompleted = patient.statuses?.standing?.completed || false;
        const ambulationCompleted = patient.statuses?.goal_ambulation?.completed || false;
        
        const sittingDelayReason = patient.statuses?.sitting?.delayReason || '';
        const standingDelayReason = patient.statuses?.standing?.delayReason || '';
        const ambulationDelayReason = patient.statuses?.goal_ambulation?.delayReason || '';

        // Determine if there's any delay to set the card border color
        const hasDelay = !sittingCompleted || !standingCompleted || !ambulationCompleted; //
        patientCard.classList.add(hasDelay ? 'card-delayed' : 'card-no-delay'); //

        const patientDischargeCriteria = patient.dischargeCriteria || {};
        const patientEquipment = patient.equipment || {};
        // **แก้ไข**: ไม่จำเป็นต้องส่ง patient.dataDocId ไปยัง renderEquipment แล้ว เพราะ updatePatientEquipment จะจัดการเอง
        // const patientDataDocId = patient.dataDocId || null; 

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

// Function to fetch patients based on the selected building
const fetchPatients = async (building = 'all') => {
    try {
        let q = query(collection(db, "patients"), where("isActive", "==", true));
        if (building !== 'all') {
            q = query(q, where("building", "==", building));
        }

        onSnapshot(q, async (patientSnapshot) => {
            console.log("onSnapshot triggered for patients collection. Number of docs:", patientSnapshot.docs.length);

            const patientsPromises = patientSnapshot.docs.map(async doc => {
                const patientDataFromPatientsCollection = { id: doc.id, ...doc.data() };
                
                let statuses = {};
                let dischargeCriteria = {};
                let equipment = {};

                // Step 1: Try to get dischargeCriteria and equipment from 'data' collection (highest priority)
                const dataCollectionQuery = query(collection(db, "data"), where("patientId", "==", patientDataFromPatientsCollection.id));
                const dataCollectionSnapshot = await getDocs(dataCollectionQuery);

                if (!dataCollectionSnapshot.empty) {
                    const docDataFromDataCollection = dataCollectionSnapshot.docs[0].data();
                    if (docDataFromDataCollection.dischargeCriteria) {
                        dischargeCriteria = docDataFromDataCollection.dischargeCriteria;
                    }
                    if (docDataFromDataCollection.equipment) {
                        equipment = docDataFromDataCollection.equipment;
                    }
                    console.log(`Fetched data document for patient ${patientDataFromPatientsCollection.id}:`, docDataFromDataCollection);
                } else {
                    console.log(`No data document found for patient ${patientDataFromPatientsCollection.id}.`);
                }

                // Step 2: Get statuses from 'register_process_statuses' collection (primary source for statuses)
                const statusQuery = query(collection(db, "register_process_statuses"), where("patientId", "==", patientDataFromPatientsCollection.id), where("isActive", "==", true));
                const statusSnapshot = await getDocs(statusQuery);

                if (!statusSnapshot.empty) {
                    const docDataFromStatusCollection = statusSnapshot.docs[0].data();
                    if (docDataFromStatusCollection.statuses) {
                        Object.assign(statuses, docDataFromStatusCollection.statuses);
                    }
                    // Step 3 (Fallback): If dischargeCriteria or equipment were NOT found in 'data' collection,
                    // check 'register_process_statuses' as a fallback.
                    if (Object.keys(dischargeCriteria).length === 0 && docDataFromStatusCollection.dischargeCriteria) {
                        dischargeCriteria = docDataFromStatusCollection.dischargeCriteria;
                    }
                    if (Object.keys(equipment).length === 0 && docDataFromStatusCollection.equipment) {
                        equipment = docDataFromStatusCollection.equipment;
                    }
                }

                // Final patient object: Combine patient data from 'patients' collection with merged statuses, dischargeCriteria, and equipment.
                const finalPatientData = { 
                    ...patientDataFromPatientsCollection, 
                    statuses, 
                    dischargeCriteria, 
                    equipment 
                };
                // *** เพิ่ม console.log ตรงนี้ ***
                console.log(`Final patient data object for rendering (Patient: ${finalPatientData.patientName}, ID: ${finalPatientData.id}):`, JSON.parse(JSON.stringify(finalPatientData)));

                return finalPatientData;
            });

            currentPatientsData = await Promise.all(patientsPromises);
            console.log("Current Patients Data before rendering (full array):", JSON.parse(JSON.stringify(currentPatientsData))); 

            renderPatientCards(currentPatientsData);
        }, (error) => {
            console.error("Error fetching patients (onSnapshot): ", error);
            alert("เกิดข้อผิดพลาดในการดึงข้อมูลผู้ป่วยแบบเรียลไทม์: " + error.message);
        });

    } catch (error) {
        console.error("Error setting up patient fetch: ", error);
        alert("เกิดข้อผิดพลาดในการตั้งค่าการดึงข้อมูลผู้ป่วย: " + error.message);
    }
};


// Function to fetch buildings for the filter
const fetchBuildings = async () => {
    try {
        const q = query(collection(db, "patients"), where("isActive", "==", true));
        const snapshot = await getDocs(q);
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

        buildingSelect.value = 'all';
        fetchPatients('all');

    } catch (error) {
        console.error("Error fetching buildings: ", error);
    }
};

// Function to fetch common discharge criteria and equipment from 'data' collection
// *** แก้ไขการกำหนดชื่อ Label สำหรับ Discharge Criteria และ Equipment ให้ Hardcode ตรงตามรูปที่ 1 และจัดการการสะกดที่ถูกต้อง ***
const fetchCommonData = async () => {
    try {
        // กำหนด globalDischargeCriteria โดยตรงด้วยคีย์และชื่อแสดงผลที่ถูกต้องตามที่คาดหวัง
        globalDischargeCriteria = {
            geriatric: 'Geriatric', // คีย์ที่ถูกต้องและการสะกดที่ถูกต้อง
            orthopedist: 'Orthopedist',
            physical_therapist: 'Physical Therapist'
        };

        // กำหนด globalEquipment โดยตรงด้วยคีย์และชื่อแสดงผลที่ถูกต้องและครบถ้วน
        globalEquipment = {
            cane: 'Cane',
            walker: 'Walker',
            wheel_chair: 'wheel chair', // เพิ่ม Wheel Chair
            other: 'อื่นๆ ระบุ' // เปลี่ยนเป็น 'อื่นๆ ระบุ'
        };

        // ส่วนนี้จะยังคงดึงข้อมูลจาก 'data' collection แต่จะไม่ถูกนำมาใช้เพื่อกำหนดโครงสร้างคีย์ของ global variables อีกต่อไป
        // มีไว้เผื่อในอนาคตต้องการดึง label dynamic จาก DB
        const dischargeQuery = query(collection(db, "data"), where("dischargeCriteria", "!=", null));
        const dischargeSnapshot = await getDocs(dischargeQuery);
        if (dischargeSnapshot.empty) {
            console.warn("Discharge Criteria document not found in 'data' collection. Using default template.");
        }

        const equipmentQuery = query(collection(db, "data"), where("equipment", "!=", null));
        const equipmentSnapshot = await getDocs(equipmentQuery);
        if (equipmentSnapshot.empty) {
            console.warn("Equipment document not found in 'data' collection. Using default template.");
        }
        
        console.log("Fetched common discharge options (transformed):", globalDischargeCriteria);
        console.log("Fetched common equipment (transformed):", globalEquipment); 

    } catch (error) {
        console.error("Error fetching common data:", error);
        // ในกรณีที่เกิดข้อผิดพลาด global variables จะยังคงถูกกำหนดตาม hardcoded template
    }
};


// === ฟังก์ชันใหม่: อัปเดตข้อมูลอุปกรณ์ของผู้ป่วยใน Firestore ===
// **แก้ไข**: เปลี่ยน dataDocId เป็น patientId และปรับ logic การค้นหา/สร้างเอกสาร
async function updatePatientEquipment(patientId, equipmentKey, isChecked) {
    console.log(`Attempting to update equipment: ${equipmentKey} to ${isChecked} for patientId: ${patientId}`);

    try {
        const dataCollectionRef = collection(db, "data");
        // ค้นหาเอกสารใน 'data' collection ที่มี field 'patientId' ตรงกับ patientId ที่ได้รับ
        const q = query(dataCollectionRef, where("patientId", "==", patientId));
        const querySnapshot = await getDocs(q);

        const updateData = {};
        // ใช้ Dot Notation เพื่ออัปเดต Nested Field (equipment.equipmentKey)
        updateData[`equipment.${equipmentKey}`] = isChecked;

        if (!querySnapshot.empty) {
            // หากพบเอกสาร (คือมีเอกสารข้อมูลอุปกรณ์สำหรับผู้ป่วยรายนี้อยู่แล้ว)
            const existingDoc = querySnapshot.docs[0];
            const dataDocRef = doc(db, "data", existingDoc.id); // ดึง Document ID ที่แท้จริงของเอกสารนั้น
            await updateDoc(dataDocRef, updateData); // อัปเดตเอกสารที่มีอยู่
            console.log(`Successfully updated existing equipment for patient ${patientId} (Doc ID: ${existingDoc.id})`);
            // *** เพิ่ม console.log ตรงนี้เมื่ออัปเดตสำเร็จ ***
            console.log("Update to Firestore completed. Firestore should now trigger onSnapshot.");
        } else {
            // หากไม่พบเอกสาร (คือยังไม่มีเอกสารข้อมูลอุปกรณ์สำหรับผู้ป่วยรายนี้)
            // ให้สร้างเอกสารใหม่
            const initialData = {
                patientId: patientId, // เก็บ patientId เป็น field ในเอกสารใหม่
                equipment: {
                    [equipmentKey]: isChecked // กำหนดค่าอุปกรณ์เริ่มต้น
                },
                dischargeCriteria: {} // ควรเริ่มต้น field อื่นๆ ที่คาดหวังด้วยหากจำเป็น
            };
            const newDocRef = await addDoc(dataCollectionRef, initialData); // ให้ Firebase สร้าง Document ID ใหม่
            console.log(`Successfully created new data document for patient ${patientId} (Doc ID: ${newDocRef.id}) and updated equipment.`);
            // *** เพิ่ม console.log ตรงนี้เมื่อสร้างใหม่สำเร็จ ***
            console.log("New document created in Firestore. Firestore should now trigger onSnapshot.");
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

    await fetchBuildings();

    const buildingSelect = document.getElementById('building');
    if (buildingSelect) {
        buildingSelect.addEventListener('change', (event) => {
            fetchPatients(event.target.value);
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
                'Sitting (Completed)': sittingCompleted ? 'Completed' : 'Delayed', // Corrected to reflect meaning "Completed" means no delay
                'Sitting (Delay Reason)': sittingDelayReason,
                'Standing (Completed)': standingCompleted ? 'Completed' : 'Delayed',
                'Standing (Delay Reason)': standingDelayReason,
                'Goal Ambulation (Completed)': ambulationCompleted ? 'Completed' : 'Delayed',
                'Goal Ambulation (Delay Reason)': ambulationDelayReason,
            };

            // Add Discharge Criteria columns dynamically based on globalDischargeCriteria
            for (const key in globalDischargeCriteria) {
                const label = globalDischargeCriteria[key];
                // Check for both correct key and misspelled 'geriatic'
                const criterion = (p.dischargeCriteria && p.dischargeCriteria[key] && typeof p.dischargeCriteria[key] === 'object') ? p.dischargeCriteria[key] :
                                  (key === 'geriatric' && p.dischargeCriteria && p.dischargeCriteria['geriatic'] && typeof p.dischargeCriteria['geriatic'] === 'object') ? p.dischargeCriteria['geriatic'] : null;

                const isChecked = criterion && 'checked' in criterion && criterion.checked;
                const time = criterion && criterion.time ? new Date(criterion.time).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : ''; // Format time for excel

                row[`เกณฑ์จำหน่าย: ${label}`] = isChecked ? 'ใช่' : 'ไม่ใช่';
                row[`เกณฑ์จำหน่าย: ${label} (เวลา)`] = time; // Add time to excel export
            }

            // Add Equipment columns dynamically based on globalEquipment
            for (const key in globalEquipment) {
                const label = globalEquipment[key];
                const isChecked = p.equipment && (p.equipment[key] === true || typeof p.equipment[key] === 'string');
                
                if (key === "other") {
                    row[`อุปกรณ์: ${label}`] = isChecked ? 'ใช่' : 'ไม่ใช่';
                    row[`อุปกรณ์: ${label} (ระบุ)`] = isChecked && typeof p.equipment[key] === 'string' ? p.equipment[key] : '';
                } else {
                    row[`อุปกรณ์: ${label}`] = isChecked ? 'ใช่' : 'ไม่ใช่';
                }
            }
            return row;
        });

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "DelayPatients"); // เปลี่ยน wb, wb เป็น wb, ws
        const filename = `Progress_Goal_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);
    };

    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', exportPatientsToExcel);
    }

    // === Event Listener ใหม่: สำหรับ Checkbox อุปกรณ์ต่างๆ ===
    const patientListDiv = document.getElementById('patientList'); // อ้างอิงถึง Element หลักที่ครอบคลุม Patient Card ทั้งหมด
    if (patientListDiv) {
        patientListDiv.addEventListener('change', async (event) => {
            // ตรวจสอบว่า Element ที่ถูกเปลี่ยนแปลงคือ Checkbox ของอุปกรณ์หรือไม่
            if (event.target.matches('.equipment-info input[type="checkbox"]')) {
                const checkbox = event.target;
                const patientId = checkbox.dataset.patientId; // ดึง patientId จาก data attribute
                // **แก้ไข**: ลบ dataDocId ออกไป
                // const dataDocId = checkbox.dataset.dataDocId; 
                const equipmentKey = checkbox.dataset.equipmentKey; // ดึง equipmentKey จาก data attribute
                const isChecked = checkbox.checked; // ดึงสถานะปัจจุบันของ Checkbox

                // **แก้ไข**: ส่งแค่ patientId ไปยังฟังก์ชัน updatePatientEquipment
                if (patientId && equipmentKey) { 
                    await updatePatientEquipment(patientId, equipmentKey, isChecked);
                    // การอัปเดต UI จะถูกจัดการโดย onSnapshot listener ใน fetchPatients โดยอัตโนมัติ
                    // จึงไม่จำเป็นต้องจัดการ DOM โดยตรงที่นี่
                } else {
                    console.warn("Missing patientId or equipmentKey for update.", {patientId, equipmentKey});
                    alert("ไม่สามารถอัปเดตอุปกรณ์ได้: ข้อมูลผู้ป่วยไม่สมบูรณ์");
                }
            }
        });
    }

    // === Hamburger Menu Functionality ===
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

    // === Active Link Logic ===
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
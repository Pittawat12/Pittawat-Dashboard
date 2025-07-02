// process.js

import { db } from './firebase.js';
import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    doc, 
    getDoc,
    updateDoc, 
    writeBatch, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";


document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded. Initializing scripts for process.html.');

    // === Hamburger Menu Functionality ===
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const overlayMenu = document.getElementById('overlayMenu');
    const closeMenuBtn = document.getElementById('closeMenu');
    const allNavLinks = document.querySelectorAll('.nav-list a');
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

        allNavLinks.forEach(link => {
            if (link.closest('.overlay-menu')) {
                link.addEventListener('click', (event) => {
                    event.stopPropagation();
                    overlayMenu.classList.remove('open');
                    body.classList.remove('no-scroll');
                });
            }
        });
    }

    // === Form Elements ===
    const buildingSelect = document.getElementById('building');
    const patientSelect = document.getElementById('patient');
    const alertForm = document.getElementById('alertForm'); 
    const endActivityCheckbox = document.getElementById('endActivityCheckbox'); 
    const endActivityButton = document.getElementById('endActivityButton');     
    const patientStatusDisplay = document.getElementById('patientStatusDisplay'); 
    const otherNurseAlertCheckbox = document.getElementById('otherNurseAlertCheckbox'); 
    const otherNurseAlertText = document.getElementById('otherNurseAlertText'); 

    // === Data Models & Queries ===
    const patientsCollection = collection(db, "patients");
    const patientAlertsCollection = collection(db, "patient_alerts"); 

    // NEW: Define fixed name for the grouped symptoms alert document
    const GROUPED_SYMPTOMS_ALERT_NAME = "KcTz3DIxbN2vwRB935Ap"; // Fixed identifier for the grouped symptoms document

    // Mapping Alert Text to a standard Type 
    const alertTypeMapping = {
        // Physical Alerts
        "เตรียมทำกายภาพ อีก30นาที": "physical_30min_prep",
        "ผู้ป่วยยังไม่พร้อมกายภาพ": "physical_not_ready",
        "ทำกายภาพเรียบร้อย": "physical_completed", 
        // Nurse Alerts
        "พร้อมทำกายภาพ": "nurse_physical_ready", 
        "ออกนอกตึก": "nurse_out_of_ward",
        "มีกิจกรรมการพยาบาล": "nurse_activity",
        "pain": "symptom_pain", // This will remain as a separate alertName
        "dyspnea": "symptom_dyspnea",
        "delirium": "symptom_delirium",
        "ขาอ่อนแรง": "symptom_weak_legs",
        "anemia transfusion": "symptom_anemia_transfusion",
        "fear of fall": "symptom_fear_of_fall",
        "อ่อนเพลีย เวียนศีรษะ": "symptom_fatigue_dizziness",
        "อื่นๆ ระบุ": "nurse_other", 
        [GROUPED_SYMPTOMS_ALERT_NAME]: "symptoms_grouped" // New type for the grouped symptoms document
    };

    // Separated nurse alert names based on grouping requirement
    const physicalAlertNames = [
        "เตรียมทำกายภาพ อีก30นาที",
        "ผู้ป่วยยังไม่พร้อมกายภาพ",
        "ทำกายภาพเรียบร้อย" 
    ];

    const individualNurseAlertNames = [ // These will remain as separate documents
        "พร้อมทำกายภาพ", 
        "ออกนอกตึก", 
        "มีกิจกรรมการพยาบาล", 
        "pain" //
    ];

    const groupedSymptomAlertNames = [ // These will be grouped into one document's array field
        "dyspnea",
        "delirium",
        "ขาอ่อนแรง",
        "anemia transfusion",
        "fear of fall",
        "อ่อนเพลีย เวียนศีรษะ",
        "อื่นๆ ระบุ"
    ];

    // === Functions ===

    // Fetch Buildings
    async function fetchBuildings() {
        buildingSelect.innerHTML = '<option value="">-- เลือกตึก --</option>';
        const q = query(patientsCollection, where('building', '!=', ''));
        const querySnapshot = await getDocs(q);
        const uniqueBuildings = new Set();
        querySnapshot.forEach((doc) => {
            const building = doc.data().building;
            if (building) {
                uniqueBuildings.add(building);
            }
        });
        uniqueBuildings.forEach(building => {
            const option = document.createElement('option');
            option.value = building;
            option.textContent = building;
            buildingSelect.appendChild(option);
        });
    }

    // Fetch Patients (มีการปรับปรุงเพื่อ filter สถานะ - ยกเลิก filter "Discharged")
    async function fetchPatients(building) {
        patientSelect.innerHTML = '<option value="">-- เลือกผู้ป่วย --</option>';
        if (!building) return;

        let q;
        // ดึง patient ทุกสถานะ, ไม่ต้อง filter "Discharged" ออกอีกต่อไป
        q = query(patientsCollection, where("building", "==", building));
        
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
            const patient = doc.data();
            const option = document.createElement('option');
            option.value = doc.id; // ใช้ Document ID เป็น value
            option.textContent = patient.name;
            patientSelect.appendChild(option);
        });
    }

    // Load existing alerts for selected patient and update form checkboxes/radios
    // รวมถึงดึงและแสดง patient_status
    async function loadPatientAlerts(patientId) {
        // Clear all checkboxes
        document.querySelectorAll('input[name="physicalStatus"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('input[name="nurseStatus"]').forEach(cb => cb.checked = false);
        
        // Reset "สิ้นสุดกิจกรรม" checkbox and button visibility
        endActivityCheckbox.checked = false;
        endActivityButton.style.display = 'none';
        
        patientStatusDisplay.textContent = ''; // Clear status display
        patientStatusDisplay.style.display = 'block'; // Ensure it's visible by default

        // Hide and clear "อื่นๆ ระบุ" text area
        otherNurseAlertCheckbox.checked = false; 
        otherNurseAlertText.style.display = 'none'; 
        otherNurseAlertText.value = ''; 

        if (!patientId) return;

        // Fetch patient's main status and display it
        const patientDocRef = doc(db, "patients", patientId);
        const patientDoc = await getDoc(patientDocRef);
        if (patientDoc.exists()) {
            const patientData = patientDoc.data();
            const patientStatus = patientData.patient_status;
            // ถ้าสถานะผู้ป่วยเป็น 'Discharged' หรือ 'จำหน่าย' ให้ไม่แสดงสถานะนั้น
            if (patientStatus && (patientStatus === 'Discharged' || patientStatus === 'จำหน่าย')) {
                patientStatusDisplay.textContent = ''; // ซ่อนข้อความสถานะถ้าเป็น Discharged
                patientStatusDisplay.style.display = 'none'; // ซ่อน element ทั้งหมด
            } else {
                patientStatusDisplay.textContent = 'สถานะผู้ป่วย: ' + (patientStatus || 'ไม่ระบุ');
                patientStatusDisplay.style.display = 'block'; // ให้แสดงปกติสำหรับสถานะอื่น
            }
        } else {
            patientStatusDisplay.textContent = 'สถานะผู้ป่วย: ไม่พบข้อมูล';
            patientStatusDisplay.style.display = 'block';
            console.error(`Patient with ID ${patientId} not found.`);
        }

        // Fetch all active nurse alerts for the patient
        const q = query(
            patientAlertsCollection, 
            where("patientId", "==", patientId),
            where("alertCategory", "==", "Nurse Alert"),
            where("isActive", "==", true) // ดึงเฉพาะ Alert ที่ยัง Active
        );
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach(docSnap => {
            const alert = docSnap.data();
            const alertName = alert.alertName;

            // Handle individual nurse alerts
            if (individualNurseAlertNames.includes(alertName)) {
                const nurseCheckbox = document.querySelector(`input[name="nurseStatus"][value="${alertName}"]`);
                if (nurseCheckbox) {
                    nurseCheckbox.checked = true;
                }
            }
            // Handle the grouped symptoms alert document
            else if (alertName === GROUPED_SYMPTOMS_ALERT_NAME) {
                const selectedSymptoms = alert.selected_symptoms || [];
                const otherSymptomDetail = alert.other_symptom_detail || '';

                selectedSymptoms.forEach(symptom => {
                    const symptomCheckbox = document.querySelector(`input[name="nurseStatus"][value="${symptom}"]`);
                    if (symptomCheckbox) {
                        symptomCheckbox.checked = true;
                    }
                });

                // If "อื่นๆ ระบุ" was selected, show its text area and populate it
                if (selectedSymptoms.includes("อื่นๆ ระบุ")) {
                    otherNurseAlertCheckbox.checked = true;
                    otherNurseAlertText.value = otherSymptomDetail;
                    otherNurseAlertText.style.display = 'block';
                }
            }
        });

        // Load existing physical alerts (unchanged from previous)
        const qPhysical = query(patientAlertsCollection, 
                        where("patientId", "==", patientId),
                        where("alertCategory", "==", "Physical Alert"),
                        where("isActive", "==", true)
                    );
        const querySnapshotPhysical = await getDocs(qPhysical);
        querySnapshotPhysical.forEach(doc => {
            const alert = doc.data();
            const alertValue = alert.alertName;
            const physicalCheckbox = document.querySelector(`input[name="physicalStatus"][value="${alertValue}"]`);
            if (physicalCheckbox) {
                if (alertValue !== "ทำกายภาพเรียบร้อย") {
                    physicalCheckbox.checked = true;
                }
            }
        });
    }

    // Function to resolve specific alerts (isActive to false) without changing patient_status
    async function resolveSpecificAlerts(patientId, alertsToResolve, alertCategory) {
        const batch = writeBatch(db);
        const now = serverTimestamp();

        // Resolve specified alerts by setting isActive to false
        // This query now handles both individual alerts and the grouped symptoms alert
        const q = query(
            patientAlertsCollection,
            where("patientId", "==", patientId),
            where("alertCategory", "==", alertCategory),
            where("alertName", "in", alertsToResolve), // This will match individual alert names AND GROUPED_SYMPTOMS_ALERT_NAME
            where("isActive", "==", true)
        );
        const snapshot = await getDocs(q);

        snapshot.forEach(docSnap => {
            batch.update(doc(db, "patient_alerts", docSnap.id), {
                isActive: false,
                resolvedAt: now,
                // Optionally clear specific fields for the grouped alert when resolved:
                ...(docSnap.data().alertName === GROUPED_SYMPTOMS_ALERT_NAME ? { selected_symptoms: [], other_symptom_detail: '' } : {})
            });
        });

        try {
            await batch.commit();
            console.log(`Alerts in category "${alertCategory}" resolved successfully.`);
            return true;
        } catch (error) {
            console.error("Error resolving alerts: ", error);
            alert("เกิดข้อผิดพลาดในการอัปเดตสถานะ: " + error.message);
            return false;
        }
    }


    // === Event Listeners ===

    // Building dropdown change
    buildingSelect.addEventListener('change', async () => {
        const selectedBuilding = buildingSelect.value;
        await fetchPatients(selectedBuilding);
        patientSelect.value = ""; // Clear patient selection
        loadPatientAlerts(""); // Clear alerts display and patient status display
    });

    // Patient dropdown change
    patientSelect.addEventListener('change', async () => {
        const selectedPatientId = patientSelect.value;
        await loadPatientAlerts(selectedPatientId);
    });

    // "สิ้นสุดกิจกรรม" checkbox change listener to show/hide button
    endActivityCheckbox.addEventListener('change', () => {
        if (endActivityCheckbox.checked) {
            endActivityButton.style.display = 'inline-block';
        } else {
            endActivityButton.style.display = 'none';
        }
    });

    // Toggle "อื่นๆ ระบุ" text area visibility
    otherNurseAlertCheckbox.addEventListener('change', () => { 
        if (otherNurseAlertCheckbox.checked) { 
            otherNurseAlertText.style.display = 'block'; 
        } else { 
            otherNurseAlertText.style.display = 'none'; 
            otherNurseAlertText.value = ''; // Clear text when unchecked
        } 
    }); 


    // "ยืนยันสิ้นสุดกิจ" button click listener
    endActivityButton.addEventListener('click', async () => {
        const selectedPatientId = patientSelect.value;
        if (!selectedPatientId) {
            alert("กรุณาเลือกผู้ป่วยก่อนสิ้นสุดกิจกรรม");
            endActivityCheckbox.checked = false; 
            endActivityButton.style.display = 'none';
            return;
        }

        // Alerts to deactivate when "สิ้นสุดกิจกรรม" is pressed
        // This includes all individual nurse alerts AND the grouped symptoms alert
        const alertsToDeactivateNurse = [].concat(individualNurseAlertNames, [GROUPED_SYMPTOMS_ALERT_NAME]);

        const success = await resolveSpecificAlerts(selectedPatientId, alertsToDeactivateNurse, "Nurse Alert");
        
        if (success) {
            alert("กิจกรรมการพยาบาลและ/หรือการออกนอกตึกสิ้นสุดลงแล้ว");
            
            // เมื่อสิ้นสุดกิจกรรม ให้รีเฟรชสถานะ Alert บน UI
            await loadPatientAlerts(selectedPatientId); 
            endActivityCheckbox.checked = false; // Uncheck after refresh
            endActivityButton.style.display = 'none'; // Hide button after refresh
        }
    });


    // Form Submission (สำหรับบันทึก/อัปเดต Physical/Nurse Alerts ทั่วไป)
    if (alertForm) {
        alertForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const selectedPatientId = patientSelect.value;
            if (!selectedPatientId) {
                alert("กรุณาเลือกผู้ป่วยก่อนบันทึก Alert");
                return;
            }

            const batch = writeBatch(db); 
            const now = serverTimestamp();

            // === 1. Handle Physical Alerts (unchanged) ===
            const physicalCheckboxes = document.querySelectorAll('input[name="physicalStatus"]');
            const selectedPhysicalAlertNames = Array.from(physicalCheckboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);

            // ตรวจสอบว่ามีการเลือก "ทำกายภาพเรียบร้อย" หรือไม่
            const isPhysicalCompletedSelected = selectedPhysicalAlertNames.includes("ทำกายภาพเรียบร้อย");

            // Fetch current active physical alerts to compare
            const existingPhysicalAlertsSnapshot = await getDocs(query(
                patientAlertsCollection,
                where("patientId", "==", selectedPatientId),
                where("alertCategory", "==", "Physical Alert"),
                where("isActive", "==", true)
            ));

            if (isPhysicalCompletedSelected) {
                // เมื่อเลือก "ทำกายภาพเรียบร้อย" จะไปปิด "เตรียมทำกายภาพ อีก30นาที" เท่านั้น
                const physicalAlertsToDeactivate = ["เตรียมทำกายภาพ อีก30นาที"];

                const snapshotToResolvePhysical = await getDocs(query(
                    patientAlertsCollection,
                    where("patientId", "==", selectedPatientId),
                    where("alertName", "in", physicalAlertsToDeactivate), 
                    where("isActive", "==", true)
                ));
                snapshotToResolvePhysical.forEach(docSnap => {
                    batch.update(doc(db, "patient_alerts", docSnap.id), {
                        isActive: false,
                        resolvedAt: now
                    });
                });
                
                alert("การทำกายภาพเรียบร้อยแล้ว");

            } 
            
            // อัปเดต Physical Alerts อื่นๆ (ที่ไม่ใช่ "ทำกายภาพเรียบร้อย")
            for (const alertName of physicalAlertNames) {
                // ข้าม "ทำกายภาพเรียบร้อย" เพราะถูกจัดการแยกต่างหากเมื่อเลือก
                if (alertName === "ทำกายภาพเรียบร้อย") continue; 

                const isSelectedOnForm = selectedPhysicalAlertNames.includes(alertName);
                const existingAlertDoc = existingPhysicalAlertsSnapshot.docs.find(
                    doc => doc.data().alertName === alertName
                );

                if (isSelectedOnForm) {
                    if (existingAlertDoc) { 
                        if (!existingAlertDoc.data().isActive) {
                             batch.update(doc(db, "patient_alerts", existingAlertDoc.id), {
                                isActive: true, 
                                resolvedAt: null, 
                                lastUpdated: now
                            });
                        }
                    } else {
                        batch.set(doc(patientAlertsCollection), { 
                            patientId: selectedPatientId,
                            alertCategory: "Physical Alert",
                            alertName: alertName,
                            alertType: alertTypeMapping[alertName],
                            isActive: true, 
                            triggeredAt: now
                        });
                    }
                } else { // ไม่ได้ถูกเลือกในฟอร์ม
                    if (existingAlertDoc && existingAlertDoc.data().isActive) {
                        batch.update(doc(db, "patient_alerts", existingAlertDoc.id), {
                            isActive: false,
                            resolvedAt: now
                        });
                    }
                }
            }


            // === 3. Handle Nurse Alerts (Refactored for grouping) ===

            // Process individual nurse alerts (e.g., "pain", "ออกนอกตึก", "มีกิจกรรมการพยาบาล", "พร้อมทำกายภาพ")
            for (const alertName of individualNurseAlertNames) {
                const checkbox = document.querySelector(`input[name="nurseStatus"][value="${alertName}"]`);
                const isSelectedOnForm = checkbox ? checkbox.checked : false;

                const existingAlertDoc = (await getDocs(query(
                    patientAlertsCollection,
                    where("patientId", "==", selectedPatientId),
                    where("alertCategory", "==", "Nurse Alert"),
                    where("alertName", "==", alertName)
                ))).docs[0]; // Get the single existing document if any

                if (isSelectedOnForm) {
                    if (existingAlertDoc) { 
                        if (!existingAlertDoc.data().isActive) {
                            batch.update(doc(db, "patient_alerts", existingAlertDoc.id), {
                                isActive: true, 
                                resolvedAt: null, 
                                lastUpdated: now
                            });
                        }
                    } else {
                        batch.set(doc(patientAlertsCollection), { 
                            patientId: selectedPatientId,
                            alertCategory: "Nurse Alert",
                            alertName: alertName,
                            alertType: alertTypeMapping[alertName],
                            isActive: true, 
                            triggeredAt: now
                        });
                    }
                } else { // Not selected on form
                    if (existingAlertDoc && existingAlertDoc.data().isActive) {
                        batch.update(doc(db, "patient_alerts", existingAlertDoc.id), {
                            isActive: false,
                            resolvedAt: now
                        });
                    }
                }
            }

            // Process grouped symptom alerts
            const selectedGroupedSymptoms = [];
            for (const symptomName of groupedSymptomAlertNames) {
                const checkbox = document.querySelector(`input[name="nurseStatus"][value="${symptomName}"]`);
                if (checkbox && checkbox.checked) {
                    selectedGroupedSymptoms.push(symptomName);
                }
            }

            const otherSymptomDetail = otherNurseAlertText.value.trim();

            // Find existing grouped symptoms document
            const existingGroupedSymptomsDoc = (await getDocs(query(
                patientAlertsCollection,
                where("patientId", "==", selectedPatientId),
                where("alertCategory", "==", "Nurse Alert"),
                where("alertName", "==", GROUPED_SYMPTOMS_ALERT_NAME)
            ))).docs[0];

            if (selectedGroupedSymptoms.length > 0) {
                let alertData = {
                    patientId: selectedPatientId,
                    alertCategory: "Nurse Alert",
                    alertName: GROUPED_SYMPTOMS_ALERT_NAME,
                    alertType: alertTypeMapping[GROUPED_SYMPTOMS_ALERT_NAME],
                    isActive: true, 
                    triggeredAt: now,
                    selected_symptoms: selectedGroupedSymptoms,
                    other_symptom_detail: selectedGroupedSymptoms.includes("อื่นๆ ระบุ") ? otherSymptomDetail : ''
                };

                if (existingGroupedSymptomsDoc) { 
                    batch.update(doc(db, "patient_alerts", existingGroupedSymptomsDoc.id), {
                        ...alertData, // Spread all new data
                        lastUpdated: now,
                        resolvedAt: null // Ensure it's active and unresolved
                    });
                } else {
                    batch.set(doc(patientAlertsCollection), alertData);
                }
            } else { // No grouped symptoms selected
                if (existingGroupedSymptomsDoc && existingGroupedSymptomsDoc.data().isActive) {
                    batch.update(doc(db, "patient_alerts", existingGroupedSymptomsDoc.id), {
                        isActive: false,
                        resolvedAt: now,
                        selected_symptoms: [], // Clear symptoms when deactivated
                        other_symptom_detail: '' // Clear detail
                    });
                }
            }

            try {
                await batch.commit(); 

                // ข้อ 1: แจ้งเตือนเมื่อบันทึกทั่วไปสำเร็จ
                alert("บันทึก Alert สำเร็จ"); 
                
                // ข้อ 2: เมื่อกดส่งฟอร์ม ฟอร์มจะรีเซต (เสมอ)
                alertForm.reset(); 
                buildingSelect.value = ""; // Clear building selection
                patientSelect.innerHTML = '<option value="">-- เลือกผู้ป่วย --</option>'; // Clear patient dropdown
                patientStatusDisplay.textContent = ''; // Clear status display
                patientStatusDisplay.style.display = 'block'; // Ensure it's reset to block when form is reset
                endActivityCheckbox.checked = false; // Ensure checkbox is reset
                endActivityButton.style.display = 'none'; // Ensure button is hidden
                
                otherNurseAlertText.style.display = 'none'; // Hide "อื่นๆ ระบุ" text area
                otherNurseAlertText.value = ''; // Clear its content

                // Re-fetch buildings for a clean start
                await fetchBuildings();

            } catch (error) {
                console.error("Error saving alerts: ", error);
                alert("เกิดข้อผิดพลาดในการบันทึก Alert: " + error.message);
            }
        });
    }

    // === Initial Load ===
    await fetchBuildings();
});

// === Active Link Logic (ปรับให้เข้ากับ overlay menu) ===
document.addEventListener('DOMContentLoaded', () => {
    const activeNavLinks = document.querySelectorAll('.overlay-menu .nav-list a');
    const currentPath = window.location.pathname.split('/').pop();
    activeNavLinks.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        } else if (currentPath === '' && link.getAttribute('href') === 'index.html') {
            link.classList.add('active');
        }
    });
});
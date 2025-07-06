import { db } from './firebase.js';
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    doc,
    getDoc,
    orderBy, 
    limit,   
    serverTimestamp,
    deleteDoc, 
    writeBatch 
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
    const patientAlertsCollection = collection(db, "patient_alerts"); // This collection will now store all submissions

    // Define the list of grouped symptom alerts
    const groupedSymptomAlertNames = [
        "dyspnea",
        "delirium",
        "ขาอ่อนแรง",
        "anemia transfusion",
        "fear of fall",
        "อ่อนเพลีย เวียนศีรษะ",
        "อื่นๆ ระบุ"
    ];

    // === Functions ===

    // Fetch Buildings (ตอนนี้จะดึงทุกตึกจากผู้ป่วยทั้งหมด ไม่ได้กรอง isActive หรืออะไรอีก)
    async function fetchBuildings() {
        console.log('Fetching buildings...');
        buildingSelect.innerHTML = '<option value="">-- เลือกตึก --</option>';
        try {
            const q = query(patientsCollection, where("isActive", "==", true));
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
            console.log('Buildings fetched successfully.');
        } catch (error) {
            console.error("Error fetching buildings: ", error);
            alert("เกิดข้อผิดพลาดในการดึงข้อมูลตึก: " + error.message);
        }
    }

    // Fetch Patients (ตอนนี้จะดึงผู้ป่วยทั้งหมดที่อยู่ในตึกที่เลือก ไม่ได้กรอง isActive)
    async function fetchPatients(building) {
        console.log(`Fetching patients for building: ${building}`);
        patientSelect.innerHTML = '<option value="">-- เลือกผู้ป่วย --</option>';
        if (!building) return;

        let q;
        try {
            q = query(patientsCollection, where("building", "==", building), where("isActive", "==", true));

            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((doc) => {
                const patient = doc.data();
                const option = document.createElement('option');
                option.value = doc.id; // ใช้ Document ID เป็น value
                option.textContent = patient.name;
                patientSelect.appendChild(option);
            });
            console.log(`Patients for building ${building} fetched successfully.`);
        } catch (error) {
            console.error("Error fetching patients: ", error);
            alert("เกิดข้อผิดพลาดในการดึงข้อมูลผู้ป่วย: " + error.message);
        }
    }

    // Load existing alerts for selected patient and update form checkboxes/radios
    async function loadPatientAlerts(patientId) {
        console.log(`Loading alerts for patient ID: ${patientId}`);
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

        try {
            // Fetch patient's main status and display it
            const patientDocRef = doc(db, "patients", patientId);
            const patientDoc = await getDoc(patientDocRef);
            if (patientDoc.exists()) {
                const patientData = patientDoc.data();
                const patientStatus = patientData.patient_status;
                if (patientStatus && (patientStatus === 'Discharged' || patientStatus === 'จำหน่าย')) {
                    patientStatusDisplay.textContent = '';
                    patientStatusDisplay.style.display = 'none';
                } else {
                    patientStatusDisplay.textContent = 'สถานะผู้ป่วย: ' + (patientStatus || 'ไม่ระบุ');
                    patientStatusDisplay.style.display = 'block';
                }
            } else {
                patientStatusDisplay.textContent = 'สถานะผู้ป่วย: ไม่พบข้อมูล';
                patientStatusDisplay.style.display = 'block';
                console.warn(`Patient with ID ${patientId} not found for status display.`);
            }

            // Fetch the LATEST patient alert document from the patient_alerts collection
            const q = query(patientAlertsCollection,
                            where("patientId", "==", patientId),
                            orderBy("submittedAt", "desc"),
                            limit(1));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const alerts = querySnapshot.docs[0].data();
                console.log('Latest alerts fetched:', alerts);

                // Check for specific alert fields and set checkboxes based on their _isActive status
                if (alerts.alertName1_isActive && alerts.alertName1 === "เตรียมทำกายภาพ อีก30นาที") {
                    document.querySelector('input[name="physicalStatus"][value="เตรียมทำกายภาพ อีก30นาที"]').checked = true;
                }
                if (alerts.alertName6_isActive && alerts.alertName6 === "ผู้ป่วยยังไม่พร้อมกายภาพ") {
                    document.querySelector('input[name="physicalStatus"][value="ผู้ป่วยยังไม่พร้อมกายภาพ"]').checked = true;
                }
                if (alerts.alertName7_isActive && alerts.alertName7 === "ทำกายภาพเรียบร้อย") {
                    document.querySelector('input[name="physicalStatus"][value="ทำกายภาพเรียบร้อย"]').checked = true;
                }
                if (alerts.alertName2_isActive && alerts.alertName2 === "พร้อมทำกายภาพ") {
                    document.querySelector('input[name="nurseStatus"][value="พร้อมทำกายภาพ"]').checked = true;
                }
                if (alerts.alertName3_isActive && alerts.alertName3 === "ออกนอกตึก") {
                    document.querySelector('input[name="nurseStatus"][value="ออกนอกตึก"]').checked = true;
                }
                if (alerts.alertName4_isActive && alerts.alertName4 === "pain") {
                    document.querySelector('input[name="nurseStatus"][value="pain"]').checked = true;
                }
                if (alerts.alertName5_isActive && alerts.alertName5 === "ผู้ป่วยมีกิจกรรมการพยาบาล") {
                    document.querySelector('input[name="nurseStatus"][value="มีกิจกรรมการพยาบาล"]').checked = true;
                }

                // Handle grouped symptoms
                if (alerts.symptoms_isActive && Array.isArray(alerts.selected_symptoms)) {
                    alerts.selected_symptoms.forEach(symptom => {
                        const symptomCheckbox = document.querySelector(`input[name="nurseStatus"][value="${symptom}"]`);
                        if (symptomCheckbox) {
                            symptomCheckbox.checked = true;
                        }
                    });
                    if (alerts.selected_symptoms.includes("อื่นๆ ระบุ") && alerts.other_symptom_detail) {
                        otherNurseAlertCheckbox.checked = true;
                        otherNurseAlertText.value = alerts.other_symptom_detail;
                        otherNurseAlertText.style.display = 'block';
                    }
                }
            } else {
                console.log(`No previous alerts found for patient ID: ${patientId}`);
            }
        } catch (error) {
            console.error("Error loading patient alerts: ", error);
            alert("เกิดข้อผิดพลาดในการโหลด Alert ของผู้ป่วย: " + error.message);
        }
    }

    // Function to "resolve" specific alerts by creating a new submission with their isActive status set to false
    async function resolveSpecificAlerts(patientId, alertsToResolve) {
        console.log(`Attempting to resolve alerts for patient ID: ${patientId}`, alertsToResolve);
        if (!patientId) {
            console.error("No patient selected for resolution.");
            return false;
        }

        const now = serverTimestamp();
        let newSubmissionData = { patientId: patientId, submittedAt: now };

        try {
            // 1. Load the current (latest) state of alerts for the patient
            const q = query(patientAlertsCollection,
                            where("patientId", "==", patientId),
                            orderBy("submittedAt", "desc"),
                            limit(1));
            const querySnapshot = await getDocs(q);

            let currentAlerts = {};
            let previousDocId = null; // Store ID of the document to be deleted

            if (!querySnapshot.empty) {
                const latestDoc = querySnapshot.docs[0];
                currentAlerts = latestDoc.data();
                previousDocId = latestDoc.id; // Get the ID of the document to potentially delete
                console.log('Current alerts for resolution:', currentAlerts, 'ID:', previousDocId);

                // Copy all current data except patientId and submittedAt
                for (const key in currentAlerts) {
                    if (key !== "patientId" && key !== "submittedAt") {
                        newSubmissionData[key] = currentAlerts[key];
                    }
                }
            } else {
                console.log("No previous alerts to copy for resolution. Starting fresh.");
            }

            // 2. Deactivate specified alerts by setting their _isActive to false and adding _resolvedAt
            if (alertsToResolve.includes("พร้อมทำกายภาพ") && newSubmissionData.alertName2_isActive) {
                newSubmissionData.alertName2_isActive = false;
                newSubmissionData.alertName2_resolvedAt = now;
            }
            if (alertsToResolve.includes("ออกนอกตึก") && newSubmissionData.alertName3_isActive) {
                newSubmissionData.alertName3_isActive = false;
                newSubmissionData.alertName3_resolvedAt = now;
            }
            if (alertsToResolve.includes("pain") && newSubmissionData.alertName4_isActive) {
                newSubmissionData.alertName4_isActive = false;
                newSubmissionData.alertName4_resolvedAt = now;
            }
            if (alertsToResolve.includes("มีกิจกรรมการพยาบาล") && newSubmissionData.alertName5_isActive) {
                newSubmissionData.alertName5_isActive = false;
                newSubmissionData.alertName5_resolvedAt = now;
            }
            // Handle grouped symptoms deactivation
            if (alertsToResolve.includes("symptoms_grouped_placeholder") && newSubmissionData.symptoms_isActive) {
                newSubmissionData.symptoms_isActive = false;
                newSubmissionData.symptoms_resolvedAt = now;
                newSubmissionData.selected_symptoms = []; // Clear the list of symptoms
                delete newSubmissionData.other_symptom_detail; // Clear detail
            }

            // Start a batch operation
            const batch = writeBatch(db);

            // If a previous document exists and needs to be deleted
            if (previousDocId) {
                console.log(`Adding document ${previousDocId} to batch for deletion.`);
                const docRefToDelete = doc(db, "patient_alerts", previousDocId);
                batch.delete(docRefToDelete);
            }

            // Add the new submission document to the batch
            console.log('Adding new submission to batch:', newSubmissionData);
            const newDocRef = doc(patientAlertsCollection); // Generate a new doc ref with a unique ID
            batch.set(newDocRef, newSubmissionData); // Use set with a generated ID for new document

            // Commit the batch
            await batch.commit();
            console.log(`Alerts resolved by batch operation (delete old, create new) for patient ${patientId}.`);
            return true;
        } catch (error) {
            console.error("Error resolving alerts by batch operation: ", error);
            alert("เกิดข้อผิดพลาดในการอัปเดตสถานะ: " + error.message);
            return false;
        }
    }

    // === Event Listeners ===

    // Building dropdown change
    buildingSelect.addEventListener('change', async () => {
        console.log('Building selection changed.');
        const selectedBuilding = buildingSelect.value;
        await fetchPatients(selectedBuilding);
        patientSelect.value = ""; // Clear patient selection
        loadPatientAlerts(""); // Clear alerts display and patient status display
    });

    // Patient dropdown change
    patientSelect.addEventListener('change', async () => {
        console.log('Patient selection changed.');
        const selectedPatientId = patientSelect.value;
        await loadPatientAlerts(selectedPatientId);
    });

    // "สิ้นสุดกิจกรรม" checkbox change listener to show/hide button
    endActivityCheckbox.addEventListener('change', () => {
        console.log('End activity checkbox changed.');
        if (endActivityCheckbox.checked) {
            endActivityButton.style.display = 'inline-block';
        } else {
            endActivityButton.style.display = 'none';
        }
    });

    // Toggle "อื่นๆ ระบุ" text area visibility
    otherNurseAlertCheckbox.addEventListener('change', () => {
        console.log('Other nurse alert checkbox changed.');
        if (otherNurseAlertCheckbox.checked) {
            otherNurseAlertText.style.display = 'block';
        } else {
            otherNurseAlertText.style.display = 'none';
            otherNurseAlertText.value = ''; // Clear text when unchecked
        }
    });

    // "ยืนยันสิ้นสุดกิจ" button click listener
    endActivityButton.addEventListener('click', async () => {
        console.log('End activity button clicked.');
        const selectedPatientId = patientSelect.value;
        if (!selectedPatientId) {
            alert("กรุณาเลือกผู้ป่วยก่อนสิ้นสุดกิจกรรม");
            endActivityCheckbox.checked = false;
            endActivityButton.style.display = 'none';
            console.warn("Attempted to end activity without selecting a patient.");
            return;
        }

        const alertsToDeactivateNurse = [
            "พร้อมทำกายภาพ",
            "ออกนอกตึก",
            "มีกิจกรรมการพยาบาล",
            "pain",
            "symptoms_grouped_placeholder" // Placeholder to trigger symptom clearing in resolveSpecificAlerts
        ];

        const success = await resolveSpecificAlerts(selectedPatientId, alertsToDeactivateNurse);

        if (success) {
            alert("กิจกรรมการพยาบาลและ/หรือการออกนอกตึกสิ้นสุดลงแล้ว");
            console.log("Activity ended successfully.");

            // เมื่อสิ้นสุดกิจกรรม ให้รีเฟรชสถานะ Alert บน UI
            await loadPatientAlerts(selectedPatientId);
            endActivityCheckbox.checked = false; // Uncheck after refresh
            endActivityButton.style.display = 'none'; // Hide button after refresh
        } else {
            console.error("Failed to end activity.");
        }
    });


    // Form Submission (สำหรับบันทึก/อัปเดต Alerts ทั่วไป)
    if (alertForm) {
        alertForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Alert form submitted.');

            const selectedPatientId = patientSelect.value;
            console.log('Selected Patient ID:', selectedPatientId);
            if (!selectedPatientId) {
                alert("กรุณาเลือกผู้ป่วยก่อนบันทึก Alert");
                console.warn("Attempted to submit form without selecting a patient.");
                return;
            }

            const now = serverTimestamp();
            let submissionData = {
                patientId: selectedPatientId,
                submittedAt: now
            };
            console.log('Initial submissionData:', submissionData);

            let previousDocId = null; // Variable to store the ID of the document to be deleted

            try {
                // 1. Fetch the current (latest) state of alerts for the patient
                console.log('Fetching latest alerts for patient before submission...');
                const latestQuery = query(patientAlertsCollection,
                                          where("patientId", "==", selectedPatientId),
                                          orderBy("submittedAt", "desc"),
                                          limit(1));
                const latestSnapshot = await getDocs(latestQuery);

                let previousAlerts = {};
                if (!latestSnapshot.empty) {
                    const latestDoc = latestSnapshot.docs[0];
                    previousAlerts = latestDoc.data();
                    previousDocId = latestDoc.id; // Get the ID of the document to potentially delete
                    console.log('Previous alerts found:', previousAlerts, 'ID:', previousDocId);

                    // Copy all existing alert data, except patientId and submittedAt which will be new
                    for (const key in previousAlerts) {
                        if (key !== "patientId" && key !== "submittedAt") {
                            submissionData[key] = previousAlerts[key];
                        }
                    }
                } else {
                    console.log('No previous alerts found for this patient. Starting new submission data from scratch.');
                }
                console.log('submissionData after copying previous alerts:', submissionData);

                // === Handle Physical Alerts ===
                const checkbox1 = document.querySelector('input[name="physicalStatus"][value="เตรียมทำกายภาพ อีก30นาที"]');
                const checkbox6 = document.querySelector('input[name="physicalStatus"][value="ผู้ป่วยยังไม่พร้อมกายภาพ"]');
                const checkbox7 = document.querySelector('input[name="physicalStatus"][value="ทำกายภาพเรียบร้อย"]');

                // "เตรียมทำกายภาพ อีก30นาที" -> alertName1
                if (checkbox1 && checkbox1.checked) {
                    submissionData.alertName1 = "เตรียมทำกายภาพ อีก30นาที";
                    if (!previousAlerts.alertName1_isActive) { // Only set triggeredAt if it's newly active
                         submissionData.alertName1_triggeredAt = now;
                    }
                    submissionData.alertName1_isActive = true;
                    delete submissionData.alertName1_resolvedAt; // Clear resolvedAt if re-activating
                } else if (submissionData.alertName1_isActive) { // If it was active but is now unchecked
                    submissionData.alertName1_isActive = false;
                    submissionData.alertName1_resolvedAt = now;
                } else { // If it was never active or already inactive and remains unchecked, ensure clean state
                    delete submissionData.alertName1;
                    delete submissionData.alertName1_triggeredAt;
                    delete submissionData.alertName1_isActive;
                    delete submissionData.alertName1_resolvedAt;
                }

                // "ผู้ป่วยยังไม่พร้อมกายภาพ" -> alertName6
                if (checkbox6 && checkbox6.checked) {
                    submissionData.alertName6 = "ผู้ป่วยยังไม่พร้อมกายภาพ";
                    if (!previousAlerts.alertName6_isActive) {
                        submissionData.alertName6_triggeredAt = now;
                    }
                    submissionData.alertName6_isActive = true;
                    delete submissionData.alertName6_resolvedAt;
                } else if (submissionData.alertName6_isActive) {
                    submissionData.alertName6_isActive = false;
                    submissionData.alertName6_resolvedAt = now;
                } else {
                    delete submissionData.alertName6;
                    delete submissionData.alertName6_triggeredAt;
                    delete submissionData.alertName6_isActive;
                    delete submissionData.alertName6_resolvedAt;
                }

                // "ทำกายภาพเรียบร้อย" -> alertName7
                if (checkbox7 && checkbox7.checked) {
                    submissionData.alertName7 = "ทำกายภาพเรียบร้อย";
                    if (!previousAlerts.alertName7_isActive) {
                        submissionData.alertName7_triggeredAt = now;
                    }
                    submissionData.alertName7_isActive = true;
                    delete submissionData.alertName7_resolvedAt;

                    // When "ทำกายภาพเรียบร้อย" is checked, set alertName1_isActive to false
                    // This will be reflected in the NEW document.
                    if (submissionData.alertName1_isActive === true) {
                        submissionData.alertName1_isActive = false;
                        submissionData.alertName1_resolvedAt = now;
                    }
                    // Also resolve alertName2 if it was active
                    if (submissionData.alertName2_isActive === true) {
                        submissionData.alertName2_isActive = false;
                        submissionData.alertName2_resolvedAt = now;
                    }

                    // *** MODIFICATION HERE: If checkbox7 is checked, prepare to delete the previous document ***
                    // This action will be part of the batch commit.
                    // The previousDocId is already captured above.

                } else if (submissionData.alertName7_isActive) {
                    submissionData.alertName7_isActive = false;
                    submissionData.alertName7_resolvedAt = now;
                } else {
                    delete submissionData.alertName7;
                    delete submissionData.alertName7_triggeredAt;
                    delete submissionData.alertName7_isActive;
                    delete submissionData.alertName7_resolvedAt;
                }

                // === Handle Individual Nurse Alerts ===
                const checkbox2 = document.querySelector('input[name="nurseStatus"][value="พร้อมทำกายภาพ"]');
                const checkbox3 = document.querySelector('input[name="nurseStatus"][value="ออกนอกตึก"]');
                const checkbox4 = document.querySelector('input[name="nurseStatus"][value="pain"]');
                const checkbox5 = document.querySelector('input[name="nurseStatus"][value="มีกิจกรรมการพยาบาล"]');

                // "พร้อมทำกายภาพ" -> alertName2
                if (checkbox2 && checkbox2.checked) {
                    submissionData.alertName2 = "พร้อมทำกายภาพ";
                    if (!previousAlerts.alertName2_isActive) {
                        submissionData.alertName2_triggeredAt = now;
                    }
                    submissionData.alertName2_isActive = true;
                    delete submissionData.alertName2_resolvedAt;
                } else if (submissionData.alertName2_isActive && !(checkbox7 && checkbox7.checked)) { // Only deactivate if not resolved by checkbox7
                    submissionData.alertName2_isActive = false;
                    submissionData.alertName2_resolvedAt = now;
                } else if (!(checkbox7 && checkbox7.checked)) { // Ensure clean state if not active and not resolved by checkbox7
                    delete submissionData.alertName2;
                    delete submissionData.alertName2_triggeredAt;
                    delete submissionData.alertName2_isActive;
                    delete submissionData.alertName2_resolvedAt;
                }

                // "ผู้ป่วยออกนอกตึก" -> alertName3
                if (checkbox3 && checkbox3.checked) {
                    submissionData.alertName3 = "ออกนอกตึก";
                    if (!previousAlerts.alertName3_isActive) {
                        submissionData.alertName3_triggeredAt = now;
                    }
                    submissionData.alertName3_isActive = true;
                    delete submissionData.alertName3_resolvedAt;
                } else if (submissionData.alertName3_isActive) {
                    submissionData.alertName3_isActive = false;
                    submissionData.alertName3_resolvedAt = now;
                } else {
                    delete submissionData.alertName3;
                    delete submissionData.alertName3_triggeredAt;
                    delete submissionData.alertName3_isActive;
                    delete submissionData.alertName3_resolvedAt;
                }

                // "pain" -> alertName4
                if (checkbox4 && checkbox4.checked) {
                    submissionData.alertName4 = "pain";
                    if (!previousAlerts.alertName4_isActive) {
                        submissionData.alertName4_triggeredAt = now;
                    }
                    submissionData.alertName4_isActive = true;
                    delete submissionData.alertName4_resolvedAt;
                } else if (submissionData.alertName4_isActive) {
                    submissionData.alertName4_isActive = false;
                    submissionData.alertName4_resolvedAt = now;
                } else {
                    delete submissionData.alertName4;
                    delete submissionData.alertName4_triggeredAt;
                    delete submissionData.alertName4_isActive;
                    delete submissionData.alertName4_resolvedAt;
                }

                // "ผู้ป่วยมีกิจกรรมการพยาบาล" -> alertName5
                if (checkbox5 && checkbox5.checked) {
                    submissionData.alertName5 = "ผู้ป่วยมีกิจกรรมการพยาบาล";
                    if (!previousAlerts.alertName5_isActive) {
                        submissionData.alertName5_triggeredAt = now;
                    }
                    submissionData.alertName5_isActive = true;
                    delete submissionData.alertName5_resolvedAt;
                } else if (submissionData.alertName5_isActive) {
                    submissionData.alertName5_isActive = false;
                    submissionData.alertName5_resolvedAt = now;
                } else {
                    delete submissionData.alertName5;
                    delete submissionData.alertName5_triggeredAt;
                    delete submissionData.alertName5_isActive;
                    delete submissionData.alertName5_resolvedAt;
                }

                // === Handle Grouped Symptoms ===
                const selectedSymptoms = [];
                for (const symptomName of groupedSymptomAlertNames) {
                    const checkbox = document.querySelector(`input[name="nurseStatus"][value="${symptomName}"]`);
                    if (checkbox && checkbox.checked) {
                        selectedSymptoms.push(symptomName);
                    }
                }
                const otherSymptomDetail = otherNurseAlertText.value.trim();

                if (selectedSymptoms.length > 0) {
                    submissionData.selected_symptoms = selectedSymptoms;
                    if (!previousAlerts.symptoms_isActive) {
                        submissionData.symptoms_triggeredAt = now;
                    }
                    submissionData.symptoms_isActive = true;
                    delete submissionData.symptoms_resolvedAt;
                    if (selectedSymptoms.includes("อื่นๆ ระบุ")) {
                        submissionData.other_symptom_detail = otherSymptomDetail;
                    } else {
                        delete submissionData.other_symptom_detail; // Clear if "อื่นๆ ระบุ" is unchecked
                    }
                } else if (submissionData.symptoms_isActive) { // If no symptoms selected but it was previously active
                    submissionData.symptoms_isActive = false;
                    submissionData.symptoms_resolvedAt = now;
                    submissionData.selected_symptoms = []; // Ensure symptoms array is empty
                    delete submissionData.other_symptom_detail; // Clear detail
                } else {
                     // If no symptoms were selected and it wasn't previously active, ensure fields are not present
                    delete submissionData.selected_symptoms;
                    delete submissionData.symptoms_triggeredAt;
                    delete submissionData.symptoms_isActive;
                    delete submissionData.symptoms_resolvedAt;
                    delete submissionData.other_symptom_detail;
                }
                console.log('Final submissionData before addDoc/batch:', submissionData);

                // --- Start Batch Operation for form submission ---
                const batch = writeBatch(db);

                // If there was a previous document for this patient, delete it
                if (previousDocId) {
                    console.log(`Adding document ${previousDocId} to batch for deletion (main form submission).`);
                    const docRefToDelete = doc(db, "patient_alerts", previousDocId);
                    batch.delete(docRefToDelete);
                }

                // Add the new submission document to the batch
                console.log('Adding new submission to batch (main form submission):', submissionData);
                const newDocRef = doc(patientAlertsCollection); // Generate a new doc ref with a unique ID
                batch.set(newDocRef, submissionData); // Use set with a generated ID for new document

                // Commit the batch
                await batch.commit();
                console.log("บันทึก Alert สำเร็จ - Batch committed (delete old, create new).");


                alert("บันทึก Alert สำเร็จ");

                // เมื่อกดส่งฟอร์ม ฟอร์มจะรีเซต
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
                console.log("Form reset and buildings re-fetched.");

            } catch (error) {
                console.error("Error saving alerts during batch operation: ", error);
                alert("เกิดข้อผิดพลาดในการบันทึก Alert: " + error.message);
            }
        });
    } else {
        console.error("Error: alertForm element not found!");
    }

    // === Initial Load ===
    console.log("Initial fetch of buildings triggered.");
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
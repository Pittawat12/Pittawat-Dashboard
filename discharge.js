// discharge.js

import { db } from './firebase.js';
import { collection, addDoc, getDocs, query, where, doc, getDoc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded. Initializing scripts for discharge.html.');

    // === Hamburger Menu Functionality ===
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const overlayMenu = document.getElementById('overlayMenu');
    const closeMenuBtn = document.getElementById('closeMenu');
    // Select all nav links regardless of where they are (desktop-nav or overlay-menu)
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

        // Close overlay when a navigation link inside the OVERLAY is clicked
        document.querySelectorAll('.overlay-menu .nav-list a').forEach(link => {
            link.addEventListener('click', () => {
                overlayMenu.classList.remove('open');
                body.classList.remove('no-scroll');
            });
        });

        // Close overlay if user clicks outside the menu content
        overlayMenu.addEventListener('click', (event) => {
            if (event.target === overlayMenu) {
                overlayMenu.classList.remove('open');
                body.classList.remove('no-scroll');
            }
        });
    }

    // === Active Link Logic ===
    const currentPath = window.location.pathname.split('/').pop();
    allNavLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        } else if (currentPath === '' && link.getAttribute('href') === 'progress.html') {
            link.classList.add('active');
        }
    });

    // === Form Logic for Register Process ===
    const buildingFilterSelect = document.getElementById('buildingFilter');
    const patientFilterSelect = document.getElementById('patientFilter');
    const registerProcessForm = document.getElementById('registerProcessForm');

    const patientNameDisplay = document.getElementById('patientNameDisplay');

    const sittingStatusCheckbox = document.getElementById('sittingStatus');
    const sittingTextSpan = document.getElementById('sittingText');
    const sittingTimeStatusSpan = document.getElementById('sittingTimeStatus');
    const sittingDelayReasonSelect = document.getElementById('sittingDelayReason'); // Changed to select
    const sittingOtherReasonTextarea = document.getElementById('sittingOtherReason'); // New textarea for 'Other'

    const standingStatusCheckbox = document.getElementById('standingStatus');
    const standingTextSpan = document.getElementById('standingText');
    const standingTimeStatusSpan = document.getElementById('standingTimeStatus');
    const standingDelayReasonSelect = document.getElementById('standingDelayReason'); // Changed to select
    const standingOtherReasonTextarea = document.getElementById('standingOtherReason'); // New textarea for 'Other'

    const goalStatusCheckbox = document.getElementById('goalStatus');
    const goalTextSpan = document.getElementById('goalText');
    const goalTimeStatusSpan = document.getElementById('goalTimeStatus');
    const goalDelayReasonSelect = document.getElementById('goalDelayReason'); // Changed to select
    const goalOtherReasonTextarea = document.getElementById('goalOtherReason'); // New textarea for 'Other'


    let currentPatientOperationDate = null; // Store operation date of selected patient
    let currentPatientName = ''; // Store the name of the selected patient

    // Function to fetch unique building IDs from the 'patients' collection
    const fetchBuildings = async () => {
        console.log("Fetching unique building IDs from 'patients' collection...");
        try {
            // Filter by isActive: true
            const patientsQuery = query(collection(db, "patients"), where("isActive", "==", true));
            const patientsSnapshot = await getDocs(patientsQuery);
            buildingFilterSelect.innerHTML = '<option value="">-- เลือกตึก --</option>'; // Clear existing options

            const uniqueBuildings = new Set();
            if (patientsSnapshot.empty) {
                console.log("No active 'patients' documents found.");
                const noBuildingOption = document.createElement('option');
                noBuildingOption.value = '';
                noBuildingOption.textContent = 'ไม่มีตึกในระบบ (ยังไม่มีผู้ป่วยลงทะเบียน)';
                buildingFilterSelect.appendChild(noBuildingOption);
            } else {
                patientsSnapshot.forEach(doc => {
                    const buildingId = doc.data().building;
                    if (buildingId) {
                        uniqueBuildings.add(buildingId);
                    }
                });

                if (uniqueBuildings.size === 0) {
                    const noBuildingOption = document.createElement('option');
                    noBuildingOption.value = '';
                    noBuildingOption.textContent = 'ไม่มีตึกในระบบ (ข้อมูลผู้ป่วยไม่สมบูรณ์)';
                    buildingFilterSelect.appendChild(noBuildingOption);
                } else {
                    const sortedBuildings = Array.from(uniqueBuildings).sort();
                    sortedBuildings.forEach(buildingId => {
                        const option = document.createElement('option');
                        option.value = buildingId;
                        option.textContent = ` ${buildingId}`;
                        buildingFilterSelect.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error("Error fetching unique buildings from patients: ", error);
            alert("เกิดข้อผิดพลาดในการดึงข้อมูลตึก: " + error.message);
        }
    };

    // Function to fetch and populate patients based on selected building
    const fetchPatientsByBuilding = async (buildingId) => {
        patientFilterSelect.innerHTML = '<option value="">-- เลือกผู้ป่วย --</option>'; // Clear existing options
        if (!buildingId) {
            clearPatientStatusAndInfo();
            return;
        }

        try {
            // Filter by building and isActive: true
            const patientsQuery = query(collection(db, "patients"), where("building", "==", buildingId), where("isActive", "==", true));
            const patientsSnapshot = await getDocs(patientsQuery);

            if (patientsSnapshot.empty) {
                const noPatientsOption = document.createElement('option');
                noPatientsOption.value = '';
                noPatientsOption.textContent = 'ไม่มีผู้ป่วยในตึกนี้';
                patientFilterSelect.appendChild(noPatientsOption);
                clearPatientStatusAndInfo();
            } else {
                patientsSnapshot.forEach(doc => {
                    const option = document.createElement('option');
                    option.value = doc.id;
                    option.textContent = doc.data().name || doc.id; // Display patient name if available, else ID
                    patientFilterSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error("Error fetching patients for building: ", error);
            alert("เกิดข้อผิดพลาดในการดึงข้อมูลผู้ป่วย: " + error.message);
        }
    };

    // Function to display selected patient's information (only name) and update status checkboxes
    const displayPatientNameAndStatus = async (patientId) => {
        clearPatientStatusAndInfo(); // Clear previous info and reset checkboxes

        if (!patientId) {
            patientNameDisplay.textContent = '';
            return;
        }

        try {
            const patientDocRef = doc(db, "patients", patientId);
            const patientDocSnap = await getDoc(patientDocRef);

            if (patientDocSnap.exists()) {
                const data = patientDocSnap.data();
                patientNameDisplay.textContent = `ชื่อผู้ป่วย: ${data.name || 'N/A'}`;
                currentPatientOperationDate = data.operationDate; // Store operation date
                currentPatientName = data.name || 'N/A'; // Store patient name
                updateStatusDisplay(); // Update display based on new patient's operation date
            } else {
                console.log("No such patient document!");
                patientNameDisplay.textContent = '';
                currentPatientName = '';
                currentPatientOperationDate = null;
            }
        } catch (error) {
            console.error("Error fetching patient details: ", error);
            alert("เกิดข้อผิดพลาดในการดึงข้อมูลผู้ป่วย: " + error.message);
        }
    };

    // Helper to clear patient name and reset checkboxes and delay reasons
    const clearPatientStatusAndInfo = () => {
        patientNameDisplay.textContent = '';
        currentPatientOperationDate = null;
        currentPatientName = '';

        sittingStatusCheckbox.checked = false;
        sittingTextSpan.style.color = '';
        sittingTimeStatusSpan.textContent = '';
        sittingDelayReasonSelect.style.display = 'none';
        sittingDelayReasonSelect.value = ''; // Reset select
        sittingOtherReasonTextarea.style.display = 'none'; // Hide other reason
        sittingOtherReasonTextarea.value = ''; // Clear other reason

        standingStatusCheckbox.checked = false;
        standingTextSpan.style.color = '';
        standingTimeStatusSpan.textContent = '';
        standingDelayReasonSelect.style.display = 'none';
        standingDelayReasonSelect.value = ''; // Reset select
        standingOtherReasonTextarea.style.display = 'none'; // Hide other reason
        standingOtherReasonTextarea.value = ''; // Clear other reason

        goalStatusCheckbox.checked = false;
        goalTextSpan.style.color = '';
        goalTimeStatusSpan.textContent = '';
        goalDelayReasonSelect.style.display = 'none';
        goalDelayReasonSelect.value = ''; // Reset select
        goalOtherReasonTextarea.style.display = 'none'; // Hide other reason
        goalOtherReasonTextarea.value = ''; // Clear other reason
    };

    // Function to calculate time difference and update checkbox text colors and time status
    const updateStatusDisplay = () => {
        if (!currentPatientOperationDate) {
            console.log("No operation date available for status check.");
            sittingTextSpan.style.color = ''; sittingTimeStatusSpan.textContent = '';
            standingTextSpan.style.color = ''; standingTimeStatusSpan.textContent = '';
            goalTextSpan.style.color = ''; goalTimeStatusSpan.textContent = '';
            // Ensure delay reason fields are hidden
            sittingDelayReasonSelect.style.display = 'none'; sittingDelayReasonSelect.value = '';
            sittingOtherReasonTextarea.style.display = 'none'; sittingOtherReasonTextarea.value = '';
            standingDelayReasonSelect.style.display = 'none'; standingDelayReasonSelect.value = '';
            standingOtherReasonTextarea.style.display = 'none'; standingOtherReasonTextarea.value = '';
            goalDelayReasonSelect.style.display = 'none'; goalDelayReasonSelect.value = '';
            goalOtherReasonTextarea.style.display = 'none'; goalOtherReasonTextarea.value = '';
            return;
        }

        const operationDateTime = new Date(currentPatientOperationDate);
        const now = new Date();
        const diffMs = now.getTime() - operationDateTime.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        // --- Sitting: 24 hours ---
        if (diffHours <= 24) {
            sittingTextSpan.style.color = 'blue';
            sittingTimeStatusSpan.textContent = '(ทำได้ภายใน 24 ชม.)';
        } else {
            sittingTextSpan.style.color = 'red';
            sittingTimeStatusSpan.textContent = `(ทำได้ภายใน 24 ชม. เกิน ${Math.floor(diffHours - 24)} ชม.)`; // Adjusted text
        }
        sittingDelayReasonSelect.style.display = (diffHours > 24 && sittingStatusCheckbox.checked) ? 'block' : 'none';
        if (sittingDelayReasonSelect.style.display === 'none') sittingDelayReasonSelect.value = '';
        sittingOtherReasonTextarea.style.display = (sittingDelayReasonSelect.value === 'อื่นๆ' && sittingDelayReasonSelect.style.display === 'block') ? 'block' : 'none';
        if (sittingOtherReasonTextarea.style.display === 'none') sittingOtherReasonTextarea.value = '';


        // --- Standing: 24 hours (changed from 48) ---
        if (diffHours <= 24) {
            standingTextSpan.style.color = 'blue';
            standingTimeStatusSpan.textContent = '(ทำได้ภายใน 24 ชม.)'; // Changed text
        } else {
            standingTextSpan.style.color = 'red';
            standingTimeStatusSpan.textContent = `(ทำได้ภายใน 24 ชม. เกิน ${Math.floor(diffHours - 24)} ชม.)`; // Changed text
        }
        standingDelayReasonSelect.style.display = (diffHours > 24 && standingStatusCheckbox.checked) ? 'block' : 'none'; // Changed from 48 to 24
        if (standingDelayReasonSelect.style.display === 'none') standingDelayReasonSelect.value = '';
        standingOtherReasonTextarea.style.display = (standingDelayReasonSelect.value === 'อื่นๆ' && standingDelayReasonSelect.style.display === 'block') ? 'block' : 'none';
        if (standingOtherReasonTextarea.style.display === 'none') standingOtherReasonTextarea.value = '';

        // --- Goal Ambulation: 48 hours (remains the same) ---
        if (diffHours <= 48) {
            goalTextSpan.style.color = 'blue';
            goalTimeStatusSpan.textContent = '(ทำได้ภายใน 48 ชม.)';
        } else {
            goalTextSpan.style.color = 'red';
            goalTimeStatusSpan.textContent = `(ทำได้ภายใน 48 ชม. เกิน ${Math.floor(diffHours - 48)} ชม.)`; // Adjusted text
        }
        goalDelayReasonSelect.style.display = (diffHours > 48 && goalStatusCheckbox.checked) ? 'block' : 'none';
        if (goalDelayReasonSelect.style.display === 'none') goalDelayReasonSelect.value = '';
        goalOtherReasonTextarea.style.display = (goalDelayReasonSelect.value === 'อื่นๆ' && goalDelayReasonSelect.style.display === 'block') ? 'block' : 'none';
        if (goalOtherReasonTextarea.style.display === 'none') goalOtherReasonTextarea.value = '';
    };

    // Helper function to check if a status is "overdue" based on operation date
    const isOverdue = (thresholdHours) => {
        if (!currentPatientOperationDate) return false;
        const operationDateTime = new Date(currentPatientOperationDate);
        const now = new Date();
        const diffMs = now.getTime() - operationDateTime.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        return diffHours > thresholdHours;
    };


    // Initial load: Fetch buildings when the page loads
    await fetchBuildings();

    // Event listener for building selection change
    buildingFilterSelect.addEventListener('change', () => {
        const selectedBuildingId = buildingFilterSelect.value;
        fetchPatientsByBuilding(selectedBuildingId);
        // Clear patient info and reset checkboxes when building changes
        clearPatientStatusAndInfo();
    });

    // Event listener for patient selection change
    patientFilterSelect.addEventListener('change', () => {
        const selectedPatientId = patientFilterSelect.value;
        displayPatientNameAndStatus(selectedPatientId);
    });

    // --- Event Listeners for Checkbox Changes ---
    sittingStatusCheckbox.addEventListener('change', updateStatusDisplay);
    standingStatusCheckbox.addEventListener('change', updateStatusDisplay);
    goalStatusCheckbox.addEventListener('change', updateStatusDisplay);

    // --- Event Listeners for Delay Reason Select Changes ---
    const setupDelayReasonListener = (selectElement, otherTextareaElement) => { // Removed thresholdHours as it's not directly used here
        selectElement.addEventListener('change', () => {
            if (selectElement.value === 'อื่นๆ') {
                otherTextareaElement.style.display = 'block';
            } else {
                otherTextareaElement.style.display = 'none';
                otherTextareaElement.value = '';
            }
            updateStatusDisplay(); // Re-evaluate display
        });
    };

    setupDelayReasonListener(sittingDelayReasonSelect, sittingOtherReasonTextarea);
    setupDelayReasonListener(standingDelayReasonSelect, standingOtherReasonTextarea);
    setupDelayReasonListener(goalDelayReasonSelect, goalOtherReasonTextarea);


    // Form submission for Register Process
    registerProcessForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const selectedBuildingId = buildingFilterSelect.value;
        const selectedPatientId = patientFilterSelect.value;

        if (!selectedBuildingId || !selectedPatientId) {
            alert("กรุณาเลือกตึกและผู้ป่วย");
            return;
        }

        // ตรวจสอบว่ามีชื่อผู้ป่วยหรือไม่
        if (!currentPatientName) {
            alert("ไม่สามารถดึงชื่อผู้ป่วยได้ กรุณาลองเลือกผู้ป่วยใหม่อีกครั้ง");
            return;
        }

        const patientDataForSave = {
            patientId: selectedPatientId,
            patientName: currentPatientName,
            buildingId: selectedBuildingId,
            timestamp: new Date(),
            isActive: true // เพิ่มช่องสุดท้ายเป็น active ตามที่ร้องขอ
        };

        const statuses = {};
        let hasError = false;

        // Function to get delay reason
        const getDelayReason = (selectElement, otherTextareaElement, isOverdueStatus, statusNameForAlert) => {
            if (isOverdueStatus) {
                const selectedReason = selectElement.value;
                if (selectedReason === '') {
                    alert(`กรุณาเลือกเหตุผลล่าช้าสำหรับสถานะ ${statusNameForAlert} (หากเกินเวลา)`);
                    hasError = true;
                    return null;
                }
                if (selectedReason === 'อื่นๆ') {
                    const otherReason = otherTextareaElement.value.trim();
                    if (otherReason === '') {
                        alert(`กรุณาระบุเหตุผลอื่นๆ สำหรับสถานะ ${statusNameForAlert} (หากเกินเวลา)`);
                        hasError = true;
                        return null;
                    }
                    return `อื่นๆ: ${otherReason}`;
                }
                return selectedReason;
            }
            return null; // Not overdue or not applicable
        };

        // Sitting Status
        if (sittingStatusCheckbox.checked) {
            const isSittingOverdue = isOverdue(24);
            const delayReason = getDelayReason(sittingDelayReasonSelect, sittingOtherReasonTextarea, isSittingOverdue, 'Sitting');
            if (hasError) return; // Stop if there was an alert
            statuses.sitting = {
                completed: true,
                delayReason: delayReason
            };
        } else {
            statuses.sitting = { completed: false };
        }


        // Standing Status (threshold changed to 24 hours)
        if (standingStatusCheckbox.checked) {
            const isStandingOverdue = isOverdue(24); // Changed from 48 to 24
            const delayReason = getDelayReason(standingDelayReasonSelect, standingOtherReasonTextarea, isStandingOverdue, 'Standing');
            if (hasError) return;
            statuses.standing = {
                completed: true,
                delayReason: delayReason
            };
        } else {
            statuses.standing = { completed: false };
        }

        // Goal Ambulation Status
        if (goalStatusCheckbox.checked) {
            const isGoalOverdue = isOverdue(48);
            const delayReason = getDelayReason(goalDelayReasonSelect, goalOtherReasonTextarea, isGoalOverdue, 'Goal Ambulation');
            if (hasError) return;
            statuses.goal_ambulation = {
                completed: true,
                delayReason: delayReason
            };
        } else {
            statuses.goal_ambulation = { completed: false };
        }

        if (hasError) {
            return;
        }

        // Check if at least one checkbox is checked for submission
        if (!sittingStatusCheckbox.checked && !standingStatusCheckbox.checked && !goalStatusCheckbox.checked) {
            alert("กรุณาเลือกสถานะการทำกายภาพอย่างน้อยหนึ่งรายการ");
            return;
        }


        patientDataForSave.statuses = statuses;

        try {
            // สร้าง Batch สำหรับการดำเนินการหลายอย่างพร้อมกัน
            const batch = writeBatch(db);

            // 1. ค้นหาเอกสาร 'register_process_statuses' ที่มี patientId เดียวกันและ isActive เป็น true
            const existingStatusesQuery = query(
                collection(db, "register_process_statuses"),
                where("patientId", "==", selectedPatientId),
                where("isActive", "==", true)
            );
            const existingStatusesSnapshot = await getDocs(existingStatusesQuery);

            // 2. ตั้งค่า isActive: false สำหรับเอกสารเก่าที่พบ
            existingStatusesSnapshot.forEach((doc) => {
                batch.update(doc.ref, { isActive: false });
            });

            // 3. เพิ่มเอกสารใหม่ด้วย isActive: true
            const newDocRef = doc(collection(db, "register_process_statuses")); // สร้าง reference สำหรับเอกสารใหม่
            batch.set(newDocRef, patientDataForSave); // ใช้ batch.set เพื่อเพิ่มเอกสารใหม่

            // 4. Commit batch เพื่อบันทึกการเปลี่ยนแปลงทั้งหมด
            await batch.commit();

            alert("บันทึกสถานะการทำกายภาพสำเร็จ!");
            registerProcessForm.reset();
            clearPatientStatusAndInfo(); // Clear info after submission
            await fetchBuildings(); // Re-fetch buildings in case new patient added earlier
        } catch (error) {
            console.error("Error saving document: ", error);
            alert("เกิดข้อผิดพลาดในการบันทึกสถานะ: " + error.message);
        }
    });
});
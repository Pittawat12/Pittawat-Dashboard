// discharge.js

import { db } from './firebase.js';
import { collection, addDoc, getDocs, query, where, doc, getDoc, updateDoc, writeBatch, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

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
    const sittingDelayReasonSelect = document.getElementById('sittingDelayReason');
    const sittingOtherReasonTextarea = document.getElementById('sittingOtherReason');

    const standingStatusCheckbox = document.getElementById('standingStatus');
    const standingTextSpan = document.getElementById('standingText');
    const standingTimeStatusSpan = document.getElementById('standingTimeStatus');
    const standingDelayReasonSelect = document.getElementById('standingDelayReason');
    const standingOtherReasonTextarea = document.getElementById('standingOtherReason');

    const goalStatusCheckbox = document.getElementById('goalStatus');
    const goalTextSpan = document.getElementById('goalText');
    const goalTimeStatusSpan = document.getElementById('goalTimeStatus');
    const goalDelayReasonSelect = document.getElementById('goalDelayReason');
    const goalOtherReasonTextarea = document.getElementById('goalOtherReason');


    let currentPatientOperationDate = null;
    let currentPatientName = '';

    const fetchBuildings = async () => {
        console.log("Fetching unique building IDs from 'patients' collection...");
        try {
            const patientsQuery = query(collection(db, "patients"), where("isActive", "==", true));
            const patientsSnapshot = await getDocs(patientsQuery);
            buildingFilterSelect.innerHTML = '<option value="">-- เลือกตึก --</option>';

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

    const fetchPatientsByBuilding = async (buildingId) => {
        patientFilterSelect.innerHTML = '<option value="">-- เลือกผู้ป่วย --</option>';
        if (!buildingId) {
            clearPatientStatusAndInfo();
            return;
        }

        try {
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
                    option.textContent = doc.data().name || doc.id;
                    patientFilterSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error("Error fetching patients for building: ", error);
            alert("เกิดข้อผิดพลาดในการดึงข้อมูลผู้ป่วย: " + error.message);
        }
    };

    const displayPatientNameAndStatus = async (patientId) => {
        clearPatientStatusAndInfo();

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
                currentPatientOperationDate = data.operationDate;
                currentPatientName = data.name || 'N/A';

                const registerStatusQuery = query(
                    collection(db, "register_process_statuses"),
                    where("patientId", "==", patientId),
                    where("isActive", "==", true),
                    orderBy("timestamp", "desc"),
                    limit(1)
                );

                const registerStatusSnapshot = await getDocs(registerStatusQuery);

                if (!registerStatusSnapshot.empty) {
                    const latestStatusData = registerStatusSnapshot.docs[0].data();

                    if (latestStatusData.statuses && latestStatusData.statuses.sitting) {
                        sittingStatusCheckbox.checked = latestStatusData.statuses.sitting.completed;
                        if (latestStatusData.statuses.sitting.completed && latestStatusData.statuses.sitting.delayReason) {
                            if (latestStatusData.statuses.sitting.delayReason.startsWith('อื่นๆ: ')) {
                                sittingDelayReasonSelect.value = 'อื่นๆ';
                                sittingOtherReasonTextarea.value = latestStatusData.statuses.sitting.delayReason.substring(6);
                            } else {
                                sittingDelayReasonSelect.value = latestStatusData.statuses.sitting.delayReason;
                            }
                        }
                    }

                    if (latestStatusData.statuses && latestStatusData.statuses.standing) {
                        standingStatusCheckbox.checked = latestStatusData.statuses.standing.completed;
                        if (latestStatusData.statuses.standing.completed && latestStatusData.statuses.standing.delayReason) {
                             if (latestStatusData.statuses.standing.delayReason.startsWith('อื่นๆ: ')) {
                                standingDelayReasonSelect.value = 'อื่นๆ';
                                standingOtherReasonTextarea.value = latestStatusData.statuses.standing.delayReason.substring(6);
                            } else {
                                standingDelayReasonSelect.value = latestStatusData.statuses.standing.delayReason;
                            }
                        }
                    }

                    if (latestStatusData.statuses && latestStatusData.statuses.goal_ambulation) {
                        goalStatusCheckbox.checked = latestStatusData.statuses.goal_ambulation.completed;
                        if (latestStatusData.statuses.goal_ambulation.completed && latestStatusData.statuses.goal_ambulation.delayReason) {
                            if (latestStatusData.statuses.goal_ambulation.delayReason.startsWith('อื่นๆ: ')) {
                                goalDelayReasonSelect.value = 'อื่นๆ';
                                goalOtherReasonTextarea.value = latestStatusData.statuses.goal_ambulation.delayReason.substring(6);
                            } else {
                                goalDelayReasonSelect.value = latestStatusData.statuses.goal_ambulation.delayReason;
                            }
                        }
                    }
                }

                updateStatusDisplay();
                const event = new Event('change');
                sittingDelayReasonSelect.dispatchEvent(event);
                standingDelayReasonSelect.dispatchEvent(event);
                goalDelayReasonSelect.dispatchEvent(event);

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

    const clearPatientStatusAndInfo = () => {
        patientNameDisplay.textContent = '';
        currentPatientOperationDate = null;
        currentPatientName = '';

        sittingStatusCheckbox.checked = false;
        sittingTextSpan.style.color = '';
        sittingTimeStatusSpan.textContent = '';
        sittingDelayReasonSelect.style.display = 'none';
        sittingDelayReasonSelect.value = '';
        sittingOtherReasonTextarea.style.display = 'none';
        sittingOtherReasonTextarea.value = '';

        standingStatusCheckbox.checked = false;
        standingTextSpan.style.color = '';
        standingTimeStatusSpan.textContent = '';
        standingDelayReasonSelect.style.display = 'none';
        standingDelayReasonSelect.value = '';
        standingOtherReasonTextarea.style.display = 'none';
        standingOtherReasonTextarea.value = '';

        goalStatusCheckbox.checked = false;
        goalTextSpan.style.color = '';
        goalTimeStatusSpan.textContent = '';
        goalDelayReasonSelect.style.display = 'none';
        goalDelayReasonSelect.value = '';
        goalOtherReasonTextarea.style.display = 'none';
        goalOtherReasonTextarea.value = '';
    };

    const updateStatusDisplay = () => {
        if (!currentPatientOperationDate) {
            console.log("No operation date available for status check.");
            sittingTextSpan.style.color = ''; sittingTimeStatusSpan.textContent = '';
            standingTextSpan.style.color = ''; standingTimeStatusSpan.textContent = '';
            goalTextSpan.style.color = ''; goalTimeStatusSpan.textContent = '';

            sittingDelayReasonSelect.style.display = (sittingStatusCheckbox.checked && isOverdue(24)) ? 'block' : 'none';
            if (sittingDelayReasonSelect.style.display === 'none') sittingDelayReasonSelect.value = '';
            sittingOtherReasonTextarea.style.display = (sittingDelayReasonSelect.value === 'อื่นๆ' && sittingDelayReasonSelect.style.display === 'block') ? 'block' : 'none';
            if (sittingOtherReasonTextarea.style.display === 'none') sittingOtherReasonTextarea.value = '';

            standingDelayReasonSelect.style.display = (standingStatusCheckbox.checked && isOverdue(24)) ? 'block' : 'none';
            if (standingDelayReasonSelect.style.display === 'none') standingDelayReasonSelect.value = '';
            standingOtherReasonTextarea.style.display = (standingDelayReasonSelect.value === 'อื่นๆ' && standingDelayReasonSelect.style.display === 'block') ? 'block' : 'none';
            if (standingOtherReasonTextarea.style.display === 'none') standingOtherReasonTextarea.value = '';

            goalDelayReasonSelect.style.display = (goalStatusCheckbox.checked && isOverdue(48)) ? 'block' : 'none';
            if (goalDelayReasonSelect.style.display === 'none') goalDelayReasonSelect.value = '';
            goalOtherReasonTextarea.style.display = (goalDelayReasonSelect.value === 'อื่นๆ' && goalDelayReasonSelect.style.display === 'block') ? 'block' : 'none';
            if (goalOtherReasonTextarea.style.display === 'none') goalOtherReasonTextarea.value = '';
            return;
        }

        const operationDateTime = new Date(currentPatientOperationDate);
        const now = new Date();
        const diffMs = now.getTime() - operationDateTime.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours <= 24) {
            sittingTextSpan.style.color = 'blue';
            sittingTimeStatusSpan.textContent = '(ทำได้ภายใน 24 ชม.)';
        } else {
            sittingTextSpan.style.color = 'red';
            sittingTimeStatusSpan.textContent = `(ทำได้ภายใน 24 ชม. เกิน ${Math.floor(diffHours - 24)} ชม.)`;
        }
        sittingDelayReasonSelect.style.display = (sittingStatusCheckbox.checked && diffHours > 24) ? 'block' : 'none';
        if (sittingDelayReasonSelect.style.display === 'none') sittingDelayReasonSelect.value = '';
        sittingOtherReasonTextarea.style.display = (sittingDelayReasonSelect.value === 'อื่นๆ' && sittingDelayReasonSelect.style.display === 'block') ? 'block' : 'none';
        if (sittingOtherReasonTextarea.style.display === 'none') sittingOtherReasonTextarea.value = '';


        if (diffHours <= 24) {
            standingTextSpan.style.color = 'blue';
            standingTimeStatusSpan.textContent = '(ทำได้ภายใน 24 ชม.)';
        } else {
            standingTextSpan.style.color = 'red';
            standingTimeStatusSpan.textContent = `(ทำได้ภายใน 24 ชม. เกิน ${Math.floor(diffHours - 24)} ชม.)`;
        }
        standingDelayReasonSelect.style.display = (standingStatusCheckbox.checked && diffHours > 24) ? 'block' : 'none';
        if (standingDelayReasonSelect.style.display === 'none') standingDelayReasonSelect.value = '';
        standingOtherReasonTextarea.style.display = (standingDelayReasonSelect.value === 'อื่นๆ' && standingDelayReasonSelect.style.display === 'block') ? 'block' : 'none';
        if (standingOtherReasonTextarea.style.display === 'none') standingOtherReasonTextarea.value = '';

        if (diffHours <= 48) {
            goalTextSpan.style.color = 'blue';
            goalTimeStatusSpan.textContent = '(ทำได้ภายใน 48 ชม.)';
        } else {
            goalTextSpan.style.color = 'red';
            goalTimeStatusSpan.textContent = `(ทำได้ภายใน 48 ชม. เกิน ${Math.floor(diffHours - 48)} ชม.)`;
        }
        goalDelayReasonSelect.style.display = (goalStatusCheckbox.checked && diffHours > 48) ? 'block' : 'none';
        if (goalDelayReasonSelect.style.display === 'none') goalDelayReasonSelect.value = '';
        goalOtherReasonTextarea.style.display = (goalDelayReasonSelect.value === 'อื่นๆ' && goalDelayReasonSelect.style.display === 'block') ? 'block' : 'none';
        if (goalOtherReasonTextarea.style.display === 'none') goalOtherReasonTextarea.value = '';
    };

    const isOverdue = (thresholdHours) => {
        if (!currentPatientOperationDate) return false;
        const operationDateTime = new Date(currentPatientOperationDate);
        const now = new Date();
        const diffMs = now.getTime() - operationDateTime.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        return diffHours > thresholdHours;
    };


    await fetchBuildings();

    buildingFilterSelect.addEventListener('change', () => {
        const selectedBuildingId = buildingFilterSelect.value;
        fetchPatientsByBuilding(selectedBuildingId);
        clearPatientStatusAndInfo();
    });

    patientFilterSelect.addEventListener('change', () => {
        const selectedPatientId = patientFilterSelect.value;
        displayPatientNameAndStatus(selectedPatientId);
    });

    sittingStatusCheckbox.addEventListener('change', updateStatusDisplay);
    standingStatusCheckbox.addEventListener('change', updateStatusDisplay);
    goalStatusCheckbox.addEventListener('change', updateStatusDisplay);

    const setupDelayReasonListener = (selectElement, otherTextareaElement) => {
        selectElement.addEventListener('change', () => {
            if (selectElement.value === 'อื่นๆ') {
                otherTextareaElement.style.display = 'block';
            } else {
                otherTextareaElement.style.display = 'none';
                otherTextareaElement.value = '';
            }
            updateStatusDisplay();
        });
    };

    setupDelayReasonListener(sittingDelayReasonSelect, sittingOtherReasonTextarea);
    setupDelayReasonListener(standingDelayReasonSelect, standingOtherReasonTextarea);
    setupDelayReasonListener(goalDelayReasonSelect, goalOtherReasonTextarea);


    registerProcessForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const selectedBuildingId = buildingFilterSelect.value;
        const selectedPatientId = patientFilterSelect.value;

        if (!selectedBuildingId || !selectedPatientId) {
            alert("กรุณาเลือกตึกและผู้ป่วย");
            return;
        }

        if (!currentPatientName) {
            alert("ไม่สามารถดึงชื่อผู้ป่วยได้ กรุณาลองเลือกผู้ป่วยใหม่อีกครั้ง");
            return;
        }

        const patientDataForSave = {
            patientId: selectedPatientId,
            patientName: currentPatientName,
            buildingId: selectedBuildingId,
            timestamp: new Date(),
            isActive: true
        };

        const statuses = {};
        let hasError = false;

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
            return null;
        };

        if (sittingStatusCheckbox.checked) {
            const isSittingOverdue = isOverdue(24);
            const delayReason = getDelayReason(sittingDelayReasonSelect, sittingOtherReasonTextarea, isSittingOverdue, 'Sitting');
            if (hasError) return;
            statuses.sitting = {
                completed: true,
                delayReason: delayReason
            };
        } else {
            statuses.sitting = { completed: false };
        }


        if (standingStatusCheckbox.checked) {
            const isStandingOverdue = isOverdue(24);
            const delayReason = getDelayReason(standingDelayReasonSelect, standingOtherReasonTextarea, isStandingOverdue, 'Standing');
            if (hasError) return;
            statuses.standing = {
                completed: true,
                delayReason: delayReason
            };
        } else {
            statuses.standing = { completed: false };
        }

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

        if (!sittingStatusCheckbox.checked && !standingStatusCheckbox.checked && !goalStatusCheckbox.checked) {
            alert("กรุณาเลือกสถานะการทำกายภาพอย่างน้อยหนึ่งรายการ");
            return;
        }

        patientDataForSave.statuses = statuses;

        try {
            const batch = writeBatch(db);

            const existingStatusesQuery = query(
                collection(db, "register_process_statuses"),
                where("patientId", "==", selectedPatientId),
                where("isActive", "==", true)
            );
            const existingStatusesSnapshot = await getDocs(existingStatusesQuery);

            existingStatusesSnapshot.forEach((doc) => {
                batch.update(doc.ref, { isActive: false });
            });

            const newDocRef = doc(collection(db, "register_process_statuses"));
            batch.set(newDocRef, patientDataForSave);

            await batch.commit();

            alert("บันทึกสถานะการทำกายภาพสำเร็จ!");
            registerProcessForm.reset();
            clearPatientStatusAndInfo();
            await fetchBuildings();
        } catch (error) {
            console.error("Error saving document: ", error);
            alert("เกิดข้อผิดพลาดในการบันทึกสถานะ: " + error.message);
        }
    });
});
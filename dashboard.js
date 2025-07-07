import { db } from './firebase.js'; // นำเข้า db จากไฟล์ firebase.js
import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot, // สำหรับการอัปเดตแบบเรียลไทม์
    getDocs,    // สำหรับดึงข้อมูลครั้งเดียว (ใช้เฉพาะกรณีที่ไม่ต้องการ real-time)
    Timestamp,  // สำหรับจัดการเวลา
    updateDoc,  // สำหรับการอัปเดตเอกสาร
    doc         // สำหรับการอ้างอิงเอกสาร
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Dashboard DOM Content Loaded. Initializing scripts.');

    // === Element References ===
    const totalPatientsCountElem = document.getElementById('totalPatientsCount');
    const dischargeTodayListElem = document.getElementById('dischargeTodayList');
    const dischargeTomorrowListElem = document.getElementById('dischargeTomorrowList');
    const physicalPrepAlertListElem = document.getElementById('physicalPrepAlertList');
    const readyPhysicalAlertListElem = document.getElementById('readyPhysicalAlertList');
    const painProblemAlertListElem = document.getElementById('painProblemAlertList');
    const outOfBuildingAlertListElem = document.getElementById('outOfBuildingAlertList');
    const complicationAlertListElem = document.getElementById('complicationAlertList');

    const ambulateBarChartCanvas = document.getElementById('ambulateBarChart');
    const goalAmbulationPieChartCanvas = document.getElementById('goalAmbulationPieChart');
    const noAmbulateDataElem = document.getElementById('noAmbulateData');
    const noGoalDataElem = document.getElementById('noGoalData');
    const goalAmbulationSummaryElem = document.getElementById('goalAmbulationSummary');


    // === Firebase Collection References ===
    const patientsCollection = collection(db, "patients");
    const patientAlertsCollection = collection(db, "patient_alerts");
    const dataCollection = collection(db, "data"); // Collection สำหรับ D/C Today/Tomorrow
    const registerProcessStatusesCollection = collection(db, "register_process_statuses"); // Collection สำหรับ Goal Ambulation

    // === Global Map for Patient Names (Cache) ===
    const patientDetailsMap = new Map(); // patientId -> {name, building, patient_status, isActive}

    // === Helper Function: Fetch Patient Details (Name & Building) ===
    async function fetchAllPatientDetails() {
        console.log("Fetching all patient details (name, building, status)...");
        try {
            const q = query(patientsCollection);
            onSnapshot(q, (snapshot) => {
                console.log("Real-time patient details update received for patientDetailsMap!");
                patientDetailsMap.clear(); // Clear existing map
                let activePatientsCount = 0;
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.isActive) { // Only add active patients to the map
                        patientDetailsMap.set(doc.id, {
                            name: data.name,
                            building: data.building,
                            patient_status: data.patient_status,
                            isActive: data.isActive // Store isActive for direct check
                        });
                        activePatientsCount++;
                    }
                });
                totalPatientsCountElem.textContent = activePatientsCount; // Update total active patients here
                console.log(`Total active patients: ${activePatientsCount}`);
            }, (error) => {
                console.error("Error listening to patient details:", error);
                totalPatientsCountElem.textContent = 'N/A';
            });

        } catch (error) {
            console.error("Error setting up patient details listener:", error);
            totalPatientsCountElem.textContent = 'N/A';
        }
    }


    // === Helper Function: Render List Item ===
    function renderListItem(containerElem, patientId, alertDetail = null) {
        const patientInfo = patientDetailsMap.get(patientId);
        // Check if the patient is still active in patientDetailsMap
        if (!patientInfo) {
            console.warn(`Patient details not found or patient is inactive for ID: ${patientId}. Not rendering alert.`);
            return;
        }

        const listItem = document.createElement('div');
        listItem.className = 'alert-item';
        listItem.innerHTML = `
            <p><strong>ชื่อ:</strong> ${patientInfo.name || 'ไม่ระบุ'}</p>
            <p><strong>ตึก:</strong> ${patientInfo.building || 'ไม่ระบุ'}</p>
            ${alertDetail ? `<p><strong>รายละเอียด:</strong> ${alertDetail}</p>` : ''}
        `;
        containerElem.appendChild(listItem);
    }

    // === 2-6. กรอบ: แจ้งทำกายภาพ, พร้อมทำกายภาพ, Pain, ออกนอกตึก, มีภาวะแทรกซ้อน (Real-time) ===
    function setupAlertsListener() {
        console.log("Setting up real-time alerts listener...");
        const q = query(patientAlertsCollection);
const previousPhysicalPrepIds = new Set(); // ⭐ ใช้เก็บ patientId ที่เคยแจ้งแล้ว
        onSnapshot(q, (snapshot) => {
            console.log("Real-time alert update received for patient_alerts!");

            // Clear existing alerts from all relevant containers
            [physicalPrepAlertListElem, readyPhysicalAlertListElem,
             painProblemAlertListElem, outOfBuildingAlertListElem,
             complicationAlertListElem].forEach(elem => {
                elem.innerHTML = '';
                elem.innerHTML = '<p class="no-data-message">ไม่มีผู้ป่วยที่อยู่ในสถานะนี้</p>';
             });

            const displayedPhysicalPrep = new Set();
let newPhysioAlertAdded = false; // ⭐ ตรวจจับว่ามีข้อมูลใหม่หรือไม่
            const displayedReadyPhysical = new Set();
            const displayedPainProblem = new Set();
            const displayedOutOfBuilding = new Set();
            const displayedComplication = new Set();

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const patientId = data.patientId;

                if (!patientId) {
                    console.warn("Alert document missing patientId:", doc.id);
                    return;
                }

                // Before displaying any alert, check if the patient is actually active.
                const patientIsActiveInMap = patientDetailsMap.has(patientId);
                if (!patientIsActiveInMap) {
                    return; // Skip rendering alerts for inactive patients
                }


                // 2. เตรียมทำกายภาพ อีก 30 นาที
                if (data.alertName1_isActive && data.alertName1 === "เตรียมทำกายภาพ อีก30นาที") {
                    if (!displayedPhysicalPrep.has(patientId)) {
                        renderListItem(physicalPrepAlertListElem, patientId);
                        displayedPhysicalPrep.add(patientId);
                        if (!previousPhysicalPrepIds.has(patientId)) {
            newPhysioAlertAdded = true; // มีข้อมูลใหม่จริง
        }
                    }
                }

                // 3. พร้อมทำกายภาพ
                if (data.alertName2_isActive && data.alertName2 === "พร้อมทำกายภาพ") {
                    if (!displayedReadyPhysical.has(patientId)) {
                        renderListItem(readyPhysicalAlertListElem, patientId);
                        displayedReadyPhysical.add(patientId);
                    }
                }

                // 4. Pain Problem
                if (data.alertName4_isActive && data.alertName4 === "pain") {
                    if (!displayedPainProblem.has(patientId)) {
                        renderListItem(painProblemAlertListElem, patientId);
                        displayedPainProblem.add(patientId);
                    }
                }

                // 5. ผู้ป่วยออกนอกตึก AND ผู้ป่วยมีกิจกรรมการพยาบาล
                // รวมเงื่อนไขของ alertName3 และ alertName5 เข้าด้วยกัน
                if ((data.alertName3_isActive && data.alertName3 === "ออกนอกตึก") ||
                    (data.alertName5_isActive && data.alertName5 === "ผู้ป่วยมีกิจกรรมการพยาบาล")) {
                    if (!displayedOutOfBuilding.has(patientId)) {
                        let alertDetail = [];
                        if (data.alertName3_isActive && data.alertName3 === "ออกนอกตึก") {
                            alertDetail.push("ออกนอกตึก");
                        }
                        if (data.alertName5_isActive && data.alertName5 === "ผู้ป่วยมีกิจกรรมการพยาบาล") {
                            alertDetail.push("มีกิจกรรมการพยาบาล");
                        }
                        renderListItem(outOfBuildingAlertListElem, patientId, alertDetail.join(', '));
                        displayedOutOfBuilding.add(patientId);
                    }
                }

                // 6. มีภาวะแทรกซ้อนอื่นๆ (ตรวจสอบว่าเป็น Array และมีข้อมูล)
                if (data.symptoms_isActive && Array.isArray(data.selected_symptoms) && data.selected_symptoms.length > 0) {
                    if (!displayedComplication.has(patientId)) { // ตรวจสอบการซ้ำเฉพาะ patientId เพื่อแสดง alert ประเภทนี้แค่ครั้งเดียวต่อผู้ป่วย
                        let symptomDetail = data.selected_symptoms.join(', ');
                        if (data.selected_symptoms.includes("อื่นๆ ระบุ") && data.other_symptom_detail) {
                            symptomDetail += ` (${data.other_symptom_detail})`;
                        }
                        renderListItem(complicationAlertListElem, patientId, symptomDetail);
                        displayedComplication.add(patientId);
                    }
                }
            });

            // Show/hide "no data" messages for each list
            if (newPhysioAlertAdded) {
    const physioAlertSound = document.getElementById('physioAlertSound');
    if (physioAlertSound) {
        physioAlertSound.play().catch(error => {
            console.warn("ไม่สามารถเล่นเสียงแจ้งเตือนได้:", error);
        });
    }
}
            [physicalPrepAlertListElem, readyPhysicalAlertListElem,
             painProblemAlertListElem, outOfBuildingAlertListElem,
             complicationAlertListElem].forEach(elem => {
                const hasAlertItems = elem.querySelectorAll('.alert-item').length > 0;
                const noDataMsg = elem.querySelector('.no-data-message');
                if (noDataMsg) {
                    noDataMsg.style.display = hasAlertItems ? 'none' : 'block';
                }
             });

        }, (error) => {
            console.error("Error listening to real-time alerts:", error);
            alert("เกิดข้อผิดพลาดในการรับการแจ้งเตือน Alert: " + error.message);
        });
    }

    // === Function to deactivate all alerts for a given patientId ===
    async function deactivatePatientAlerts(patientId) {
        console.log(`Deactivating alerts for patient: ${patientId}`);
        try {
            const q = query(patientAlertsCollection, where("patientId", "==", patientId));
            const querySnapshot = await getDocs(q);

            const updatePromises = [];
            querySnapshot.forEach(alertDoc => {
                const alertDocRef = doc(db, "patient_alerts", alertDoc.id);
                const updateData = {
                    alertName1_isActive: false,
                    alertName2_isActive: false,
                    alertName3_isActive: false,
                    alertName4_isActive: false,
                    alertName5_isActive: false, // <--- เพิ่มตรงนี้
                    symptoms_isActive: false
                };
                updatePromises.push(updateDoc(alertDocRef, updateData));
            });
            await Promise.all(updatePromises);
            console.log(`All alerts for patient ${patientId} deactivated successfully.`);
        } catch (error) {
            console.error(`Error deactivating alerts for patient ${patientId}:`, error);
        }
    }

    // === Listener for Patient isActive status changes ===
    function setupPatientStatusListener() {
        console.log("Setting up real-time patient status listener (for deactivating alerts)...");
        const q = query(patientsCollection);

        onSnapshot(q, (snapshot) => {
            console.log("Real-time patient status update received for alert deactivation!");
            snapshot.docChanges().forEach(change => {
                if (change.type === 'modified') {
                    if (change.oldDoc && change.doc) {
                        const newDocData = change.doc.data();
                        const oldDocData = change.oldDoc.data();

                        // Check if isActive changed from true to false
                        if (oldDocData.isActive === true && newDocData.isActive === false) {
                            const patientId = change.doc.id;
                            console.log(`Patient ${patientId} changed isActive from true to false. Triggering alert deactivation in patient_alerts.`);
                            deactivatePatientAlerts(patientId);
                        }
                    } else {
                        console.warn("Received a 'modified' change type but oldDoc or newDoc was undefined.", change);
                    }
                }
            });
        }, (error) => {
            console.error("Error listening to patient status changes for alert deactivation:", error);
        });
    }


    // === 7 & 8. กรอบ: D/C Today & D/C Tomorrow (Real-time) ===
    function setupDischargeListeners() {
        console.log("Setting up real-time discharge listeners...");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const dayAfterTomorrow = new Date(today);
        dayAfterTomorrow.setDate(today.getDate() + 2);

        // --- D/C Today ---
        const qToday = query(
            dataCollection,
            where('dischargeOption', '==', 'today'),
            where('isActive', '==', true),
            where('timestamp', '>=', Timestamp.fromDate(today)),
            where('timestamp', '<', Timestamp.fromDate(tomorrow))
        );

        onSnapshot(qToday, (snapshot) => {
            console.log("Real-time D/C Today update received!");
            dischargeTodayListElem.innerHTML = '';
            if (snapshot.empty) {
                dischargeTodayListElem.innerHTML = '<p class="no-data-message">ไม่มีผู้ป่วย D/C today</p>';
            } else {
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const patientId = data.patientId;
                    if (patientId && patientDetailsMap.has(patientId)) {
                        renderListItem(dischargeTodayListElem, patientId);
                    }
                });
            }
        }, (error) => {
            console.error("Error listening to D/C Today alerts:", error);
        });

        // --- D/C Tomorrow ---
        const qTomorrow = query(
            dataCollection,
            where('dischargeOption', '==', 'tomorrow'),
            where('isActive', '==', true)
        );

        onSnapshot(qTomorrow, (snapshot) => {
            console.log("Real-time D/C Tomorrow update received!");
            dischargeTomorrowListElem.innerHTML = '';
            if (snapshot.empty) {
                dischargeTomorrowListElem.innerHTML = '<p class="no-data-message">ไม่มีผู้ป่วย D/C tomorrow</p>';
            } else {
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const patientId = data.patientId;
                    if (patientId && patientDetailsMap.has(patientId)) {
                        renderListItem(dischargeTomorrowListElem, patientId);
                    }
                });
            }
        }, (error) => {
            console.error("Error listening to D/C Tomorrow alerts:", error);
        });
    }

    // === 10. กราฟแท่ง Ambulate (Real-time) ===
    let ambulateBarChartInstance;

    function setupAmbulateBarChartListener() {
        console.log("Setting up real-time Ambulate Bar Chart listener...");
        const q = query(registerProcessStatusesCollection);

        onSnapshot(q, (snapshot) => {
            console.log("Real-time Ambulate Bar Chart update received!");

            let sittingCount = 0;
            let standingCount = 0;
            let goalAmbulationCount = 0;

            if (!snapshot.empty) {
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const patientId = data.patientId;

                    if (patientDetailsMap.has(patientId)) {
                        if (data.statuses && data.statuses.sitting && data.statuses.sitting.completed === true) {
                            sittingCount++;
                        }
                        if (data.statuses && data.statuses.standing && data.statuses.standing.completed === true) {
                            standingCount++;
                        }
                        if (data.statuses && data.statuses.goal_ambulation && data.statuses.goal_ambulation.completed === true) {
                            goalAmbulationCount++;
                        }
                    }
                });
                noAmbulateDataElem.style.display = (sittingCount === 0 && standingCount === 0 && goalAmbulationCount === 0) ? 'block' : 'none';
            } else {
                noAmbulateDataElem.style.display = 'block';
            }

            const ctx = ambulateBarChartCanvas.getContext('2d');
            if (ambulateBarChartInstance) {
                ambulateBarChartInstance.destroy();
            }

            ambulateBarChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Sitting', 'Standing', 'Goal Ambulation'],
                    datasets: [{
                        label: 'จำนวนผู้ป่วย',
                        data: [sittingCount, standingCount, goalAmbulationCount],
                        backgroundColor: [
                            'rgba(75, 192, 192, 0.7)',
                            'rgba(54, 162, 235, 0.7)',
                            'rgba(153, 102, 255, 0.7)'
                        ],
                        borderColor: [
                            'rgba(75, 192, 192, 1)',
                            'rgba(54, 162, 235, 1)',
                            'rgba(153, 102, 255, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                precision: 0
                            },
                            title: {
                                display: true,
                                text: 'จำนวนคน'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: false,
                        }
                    }
                }
            });
            console.log("Ambulate Bar Chart rendered.");
        }, (error) => {
            console.error("Error listening to Ambulate Bar Chart data:", error);
            noAmbulateDataElem.style.display = 'block';
        });
    }

    // === 11. แผนภูมิรูปวงกลม Goal Ambulation (Delay/ไม่ Delay) (Real-time) ===
    let goalAmbulationPieChartInstance;

    function setupGoalAmbulationPieChartListener() {
        console.log("Setting up real-time Goal Ambulation Pie Chart listener...");
        const q = query(registerProcessStatusesCollection); // ดึงข้อมูลทั้งหมดมาประมวลผลในโค้ด

        onSnapshot(q, (snapshot) => {
            console.log("Real-time Goal Ambulation Pie Chart update received!");

            let delayedCount = 0;
            let notDelayedCount = 0;

            if (!snapshot.empty) {
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const patientId = data.patientId;

                    const isActivePatient = patientDetailsMap.has(patientId);

                    if (isActivePatient) {
                        console.log(`Patient ${patientId} is active. Checking ambulation statuses for form submissions.`);

                        const stages = ['sitting', 'standing', 'goal_ambulation'];

                        for (const stage of stages) {
                            if (data.statuses && data.statuses[stage] && data.statuses[stage].completed === true) {
                                const delayReason = data.statuses[stage].delayReason;
                                const delayReasonNormalized = (typeof delayReason === 'string' && delayReason.toLowerCase() === 'null') ? null : delayReason;

                                if (delayReasonNormalized !== null && delayReasonNormalized !== undefined && delayReasonNormalized !== "") {
                                    delayedCount++;
                                    console.log(`- ${stage} completed and DELAYED for patient ${patientId}. Total delayed forms: ${delayedCount}`);
                                } else {
                                    notDelayedCount++;
                                    console.log(`- ${stage} completed and NOT DELAYED for patient ${patientId}. Total not delayed forms: ${notDelayedCount}`);
                                }
                            } else {
                                console.log(`- ${stage} not completed for patient ${patientId}. Not included in pie chart counts.`);
                            }
                        }
                    } else {
                        console.log(`Patient ${patientId} is NOT active in 'patients' collection. Not included in pie chart.`);
                    }
                });

                console.log(`Final counts for Pie Chart (form submissions): Delayed = ${delayedCount}, Not Delayed = ${notDelayedCount}`);
                noGoalDataElem.style.display = (delayedCount === 0 && notDelayedCount === 0) ? 'block' : 'none';
            } else {
                console.log("register_process_statuses collection is empty or no data found for Pie Chart.");
                noGoalDataElem.style.display = 'block';
            }

            const totalGoalPatients = delayedCount + notDelayedCount;
            let delayedPercentage = 0;
            let notDelayedPercentage = 0;

            if (totalGoalPatients > 0) {
                delayedPercentage = (delayedCount / totalGoalPatients * 100).toFixed(1);
                notDelayedPercentage = (notDelayedCount / totalGoalPatients * 100).toFixed(1);
            }

            const ctx = goalAmbulationPieChartCanvas.getContext('2d');
            if (goalAmbulationPieChartInstance) {
                goalAmbulationPieChartInstance.destroy();
            }

            goalAmbulationPieChartInstance = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: ['ล่าช้า (Delay)', 'ไม่ล่าช้า (Not Delay)'],
                    datasets: [{
                        data: [delayedCount, notDelayedCount],
                        backgroundColor: [
                            'rgba(255, 99, 132, 0.8)',
                            'rgba(75, 192, 192, 0.8)'
                        ],
                        borderColor: [
                            'rgba(255, 99, 132, 1)',
                            'rgba(75, 192, 192, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.parsed;
                                    const total = context.dataset.data.reduce((sum, current) => sum + current, 0);
                                    const percentage = (value / total * 100).toFixed(1);
                                    return `${label}: ${value} ครั้ง (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
            console.log("Goal Ambulation Pie Chart rendered.");
        }, (error) => {
            console.error("Error listening to Goal Ambulation Pie Chart data:", error);
            noGoalDataElem.style.display = 'block';
        });
    }


    // === Initial Load & Setup Listeners ===
    async function initializeDashboard() {
        await fetchAllPatientDetails();
        setupAlertsListener();
        setupDischargeListeners();
        setupPatientStatusListener();
        setupAmbulateBarChartListener();
        setupGoalAmbulationPieChartListener();
    }

    initializeDashboard();

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

    // === Active Link Logic ===
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


// process.js

// Import db from your firebase.js file
import { db } from './firebase.js';
import { collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded. Initializing scripts for process.html.');

    // === Hamburger Menu Functionality (โค้ดนี้ยังคงอยู่) ===
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const overlayMenu = document.getElementById('overlayMenu');
    const closeMenuBtn = document.getElementById('closeMenu');
    const allNavLinks = document.querySelectorAll('.nav-list a');
    const body = document.body;

    console.log('DOM Content Loaded. Initializing scripts for process.html.');

    if (hamburgerMenu && overlayMenu && closeMenuBtn) {
        console.log('Hamburger menu elements found. Attaching event listeners.');

        hamburgerMenu.addEventListener('click', (event) => {
            event.stopPropagation();
            console.log('Hamburger menu clicked! Opening overlay.');
            overlayMenu.classList.add('open');
            body.classList.add('no-scroll');
        });

        closeMenuBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            console.log('Close button clicked! Closing overlay.');
            overlayMenu.classList.remove('open');
            body.classList.remove('no-scroll');
        });

        allNavLinks.forEach(link => {
            if (link.closest('.overlay-menu')) {
                link.addEventListener('click', (event) => {
                    event.stopPropagation();
                    console.log('Overlay link clicked:', link.href);
                    overlayMenu.classList.remove('open');
                    body.classList.remove('no-scroll');
                });
            }
        });

        overlayMenu.addEventListener('click', (event) => {
            if (event.target === overlayMenu) {
                console.log('Clicked on overlay background, closing overlay.');
                overlayMenu.classList.remove('open');
                body.classList.remove('no-scroll');
            }
        });
    } else {
        console.warn("Hamburger menu elements not found. This is expected on desktop view (sidebar is present).");
    }

    // === Active Link Logic (โค้ดนี้ยังคงอยู่) ===
    const currentPath = window.location.pathname.split('/').pop();
    allNavLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        } else if (currentPath === '' && link.getAttribute('href') === 'progress.html') { // Assuming 'progress.html' is your HOME
            link.classList.add('active');
        }
    });

    // === Form Logic for Physical Preparation ===
    const buildingSelect = document.getElementById('building');
    const patientSelect = document.getElementById('patient');
    const prepForm = document.getElementById('prepForm');

    // Function to fetch unique building IDs from the 'patients' collection
    const fetchBuildings = async () => {
        console.log("Attempting to fetch unique building IDs from 'patients' collection...");
        try {
            const patientsSnapshot = await getDocs(collection(db, "patients"));
            buildingSelect.innerHTML = '<option value="">-- เลือกตึก --</option>'; // Clear and add default option

            const uniqueBuildings = new Set();
            if (patientsSnapshot.empty) {
                console.log("No 'patients' documents found. Cannot populate buildings dropdown.");
                const noBuildingOption = document.createElement('option');
                noBuildingOption.value = '';
                noBuildingOption.textContent = 'ไม่มีตึกในระบบ (ยังไม่มีผู้ป่วยลงทะเบียน)';
                buildingSelect.appendChild(noBuildingOption);
            } else {
                patientsSnapshot.forEach(doc => {
                    const buildingId = doc.data().building;
                    if (buildingId) { // Ensure buildingId exists and is not empty
                        uniqueBuildings.add(buildingId);
                    }
                });

                if (uniqueBuildings.size === 0) {
                    console.log("No 'building' field found or all are empty in patient documents.");
                    const noBuildingOption = document.createElement('option');
                    noBuildingOption.value = '';
                    noBuildingOption.textContent = 'ไม่มีตึกในระบบ (ข้อมูลผู้ป่วยไม่สมบูรณ์)';
                    buildingSelect.appendChild(noBuildingOption);
                } else {
                    // Convert Set to Array and sort alphabetically
                    const sortedBuildings = Array.from(uniqueBuildings).sort();

                    sortedBuildings.forEach(buildingId => {
                        const option = document.createElement('option');
                        option.value = buildingId;
                        option.textContent = `ตึก ${buildingId}`; // Display "ตึก A", "ตึก B"
                        buildingSelect.appendChild(option);
                    });
                    console.log(`Successfully fetched ${sortedBuildings.length} unique buildings from patients.`);
                }
            }
        } catch (error) {
            console.error("Error fetching unique buildings from patients: ", error);
            alert("เกิดข้อผิดพลาดในการดึงข้อมูลตึก: " + error.message);
        }
    };

    // Function to fetch and populate patients based on selected building
    const fetchPatientsByBuilding = async (buildingId) => {
        patientSelect.innerHTML = '<option value="">-- เลือกผู้ป่วย --</option>'; // Clear existing options
        if (!buildingId) {
            console.log("No building selected, not fetching patients.");
            return;
        }

        console.log(`Attempting to fetch patients for building ID: ${buildingId}`);
        try {
            // Query patients based on the selected building ID
            // สมมติว่ามี field 'building' ใน collection 'patients' ที่ตรงกับ doc.id ของ 'buildings'
            const patientsQuery = query(collection(db, "patients"), where("building", "==", buildingId));
            const patientsSnapshot = await getDocs(patientsQuery);

            if (patientsSnapshot.empty) {
                console.log(`No patients found for building ID: ${buildingId}`);
                const noPatientsOption = document.createElement('option');
                noPatientsOption.value = '';
                noPatientsOption.textContent = 'ไม่มีผู้ป่วยในตึกนี้';
                patientSelect.appendChild(noPatientsOption);
            } else {
                patientsSnapshot.forEach(doc => {
                    const option = document.createElement('option');
                    option.value = doc.id; // ใช้ doc.id เป็น value
                    option.textContent = doc.data().name || doc.id; // ใช้ field 'name' ถ้ามี, ไม่งั้นใช้ doc.id
                    patientSelect.appendChild(option);
                });
                console.log(`Successfully fetched ${patientsSnapshot.size} patients for building ID: ${buildingId}`);
            }
        } catch (error) {
            console.error("Error fetching patients for building: ", error);
            alert("เกิดข้อผิดพลาดในการดึงข้อมูลผู้ป่วย: " + error.message);
        }
    };

    // Initial load: Fetch buildings when the page loads
    await fetchBuildings();

    // Event listener for building selection change
    if (buildingSelect) {
        buildingSelect.addEventListener('change', () => {
            const selectedBuildingId = buildingSelect.value;
            fetchPatientsByBuilding(selectedBuildingId);
        });
    }

    // Form submission for physical preparation
    if (prepForm) {
        prepForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log("Form submitted for physical preparation.");

            const selectedBuildingId = buildingSelect.value;
            const selectedPatientId = patientSelect.value;
            const selectedStatuses = Array.from(document.querySelectorAll('.checkbox-group input[name="status"]:checked'))
                                            .map(checkbox => checkbox.value);

            if (!selectedBuildingId || !selectedPatientId || selectedStatuses.length === 0) {
                alert("กรุณาเลือกตึก, ผู้ป่วย, และสถานะการเตรียมกายภาพ");
                console.warn("Validation failed: Missing building, patient, or status.");
                return;
            }

            try {
                await addDoc(collection(db, "physicalPreps"), {
                    buildingId: selectedBuildingId,
                    patientId: selectedPatientId,
                    statuses: selectedStatuses,
                    timestamp: new Date()
                });

                alert("บันทึกสถานะการเตรียมกายภาพสำเร็จ");
                console.log("Physical preparation saved successfully.");
                prepForm.reset();
                // After successful submission, re-fetch buildings (in case a new patient with new building was added)
                // and clear patient dropdown
                await fetchBuildings();
                patientSelect.innerHTML = '<option value="">-- เลือกผู้ป่วย --</option>'; // Clear patient dropdown
            } catch (error) {
                console.error("Error saving physical preparation: ", error);
                alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + error.message);
            }
        });
    }
});
import { db } from './firebase.js';
import {
    collection, query, where, getDocs, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// เพิ่มตัวแปรสำหรับเก็บข้อมูลผู้ป่วยที่แสดงผลอยู่เพื่อใช้ในการส่งออก Excel
let currentPatientsData = [];

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Delay Process Dashboard loaded.');

    // Hamburger Menu
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const overlayMenu = document.getElementById('overlayMenu');
    const closeMenuBtn = document.getElementById('closeMenu');
    const allNavLinks = document.querySelectorAll('.nav-list a');
    const body = document.body;

    if (hamburgerMenu && overlayMenu && closeMenuBtn) {
        hamburgerMenu.addEventListener('click', e => {
            e.stopPropagation();
            overlayMenu.classList.add('open');
            body.classList.add('no-scroll');
        });

        closeMenuBtn.addEventListener('click', e => {
            e.stopPropagation();
            overlayMenu.classList.remove('open');
            body.classList.remove('no-scroll');
        });

        allNavLinks.forEach(link => {
            if (link.closest('.overlay-menu')) {
                link.addEventListener('click', () => {
                    overlayMenu.classList.remove('open');
                    body.classList.remove('no-scroll');
                });
            }
        });

        overlayMenu.addEventListener('click', e => {
            if (e.target === overlayMenu) {
                overlayMenu.classList.remove('open');
                body.classList.remove('no-scroll');
            }
        });
    }

    // Active Menu Highlight
    const currentPath = window.location.pathname.split('/').pop();
    allNavLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === currentPath || (currentPath === '' && link.getAttribute('href') === 'progress.html')) {
            link.classList.add('active');
        }
    });

    const buildingSelect = document.getElementById('building');
    const patientListDiv = document.getElementById('patientList');
    const noPatientsMessage = document.getElementById('noPatientsMessage');
    const exportExcelBtn = document.getElementById('exportExcelBtn'); // อ้างอิงปุ่ม Export Excel

    let unsubscribePatients = null;

    const fetchBuildings = async () => {
        try {
            const snapshot = await getDocs(collection(db, "patients"));
            const buildings = new Set();
            snapshot.forEach(doc => {
                const b = doc.data().building;
                if (b) buildings.add(b);
            });

            buildingSelect.innerHTML = '<option value="all">ทั้งหมด</option>';
            Array.from(buildings).sort().forEach(b => {
                const opt = document.createElement('option');
                opt.value = b;
                opt.textContent = `ตึก ${b}`;
                buildingSelect.appendChild(opt);
            });
        } catch (err) {
            console.error("Error fetching buildings: ", err);
            alert("ดึงข้อมูลตึกล้มเหลว: " + err.message);
        }
    };

    // ฟังก์ชันคำนวณสีสถานะ delay (น้ำเงินหรือแดง)
    const calculateDelayColor = (operationDate, hours) => {
        if (!operationDate) return 'gray'; // หรือสีที่คุณต้องการสำหรับข้อมูลไม่มี
        const now = new Date();
        const diffHours = (now - new Date(operationDate)) / (1000 * 60 * 60);
        return diffHours <= hours ? 'blue' : 'red';
    };

    const calculatePostOpDay = (operationDate) => {
        if (!operationDate) return '-';
        const now = new Date();
        const opDate = new Date(operationDate);
        const diff = Math.floor((now - opDate) / (1000 * 60 * 60 * 24));
        return `${diff} วัน`;
    };

    const calculateLengthOfStay = (admissionDate) => {
        if (!admissionDate) return '-';
        const now = new Date();
        const adDate = new Date(admissionDate);
        const diff = Math.floor((now - adDate) / (1000 * 60 * 60 * 24));
        return `${diff} วัน`;
    };

    const renderPatients = async (selectedBuilding) => {
        if (unsubscribePatients) unsubscribePatients();

        patientListDiv.innerHTML = '';
        noPatientsMessage.style.display = 'none';

        let q = selectedBuilding === 'all'
            ? collection(db, "patients")
            : query(collection(db, "patients"), where("building", "==", selectedBuilding));

        unsubscribePatients = onSnapshot(q, async (snapshot) => {
            patientListDiv.innerHTML = '';
            currentPatientsData = []; // เคลียร์ข้อมูลเดิมก่อนที่จะดึงข้อมูลใหม่

            if (snapshot.empty) {
                noPatientsMessage.style.display = 'block';
                return;
            }

            const statusData = await Promise.all(snapshot.docs.map(async doc => {
                const data = doc.data();
                const id = doc.id;

                let sitting = { completed: false, delayReason: null, color: 'gray' };
                let standing = { completed: false, delayReason: null, color: 'gray' };
                let ambulation = { completed: false, delayReason: null, color: 'gray' };

                try {
                    const patientStatusesQuery = query(
                        collection(db, "register_process_statuses"),
                        where("patientId", "==", id)
                    );
                    const patientStatusesSnap = await getDocs(patientStatusesQuery);

                    if (!patientStatusesSnap.empty) {
                        const sortedStatuses = patientStatusesSnap.docs
                            .map(doc => doc.data())
                            .sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());

                        const latestStatusDocData = sortedStatuses[0];
                        const statuses = latestStatusDocData.statuses || {};

                        if (statuses.sitting) {
                            sitting.completed = statuses.sitting.completed;
                            sitting.delayReason = statuses.sitting.delayReason;
                        }
                        if (statuses.standing) {
                            standing.completed = statuses.standing.completed;
                            standing.delayReason = statuses.standing.delayReason;
                        }
                        if (statuses.goal_ambulation) {
                            ambulation.completed = statuses.goal_ambulation.completed;
                            ambulation.delayReason = statuses.goal_ambulation.delayReason;
                        }
                    }
                } catch (err) {
                    console.error(`Error processing status for patient ${id}:`, err);
                }

                const opDate = data.operationDate;

                // สีจะถูกกำหนดตามการ delay เท่านั้น ไม่ว่าสถานะจะ completed หรือไม่
                sitting.color = calculateDelayColor(opDate, 24);
                standing.color = calculateDelayColor(opDate, 48);
                ambulation.color = calculateDelayColor(opDate, 48);

                // เตรียมข้อมูลสำหรับ Excel โดยตรง
                return {
                    name: data.name || 'ไม่ระบุชื่อ',
                    building: data.building || 'N/A',
                    operationDate: opDate,
                    admissionDate: data.admissionDate,
                    postOpDay: calculatePostOpDay(opDate),
                    lengthOfStay: calculateLengthOfStay(data.admissionDate),
                    sittingStatus: sitting.completed ? 'Completed' : 'Pending', // เพิ่มสถานะ Sitting
                    sittingDelayReason: sitting.color === 'red' ? (sitting.delayReason || '-') : '-', // เพิ่มเหตุผล Sitting
                    standingStatus: standing.completed ? 'Completed' : 'Pending', // เพิ่มสถานะ Standing
                    standingDelayReason: standing.color === 'red' ? (standing.delayReason || '-') : '-', // เพิ่มเหตุผล Standing
                    ambulationStatus: ambulation.completed ? 'Completed' : 'Pending', // เพิ่มสถานะ Ambulation
                    ambulationDelayReason: ambulation.color === 'red' ? (ambulation.delayReason || '-') : '-', // เพิ่มเหตุผล Ambulation
                };
            }));

            // เก็บข้อมูลที่ประมวลผลแล้วและจัดเรียงใน currentPatientsData เพื่อใช้ในการส่งออก Excel
            currentPatientsData = statusData.sort((a, b) => a.name.localeCompare(b.name));

            currentPatientsData.forEach(p => {
                const card = document.createElement('div');
                card.className = 'patient-card';
                card.innerHTML = `
                    <h3>${p.name}</h3>
                    <p>ตึก: ${p.building}</p>
                    <p>Post-op Day: ${p.postOpDay}</p>
                    <p>Length of Stay: ${p.lengthOfStay}</p>
                    <hr style="margin: 10px 0; border: 0; border-top: 1px solid #eee;">

                    <div class="status-item">
                        <label class="status-row">
                            <input type="checkbox" disabled class="status-checkbox ${p.sittingDelayReason !== '-' ? 'red' : 'blue'}" ${p.sittingStatus === 'Completed' ? 'checked' : ''}>
                            <span>Sitting</span>
                        </label>
                        ${(p.sittingDelayReason !== '-')
                            ? `<p class="delay-reason-text">เหตุผล: ${p.sittingDelayReason}</p>` : ''}
                    </div>

                    <div class="status-item">
                        <label class="status-row">
                            <input type="checkbox" disabled class="status-checkbox ${p.standingDelayReason !== '-' ? 'red' : 'blue'}" ${p.standingStatus === 'Completed' ? 'checked' : ''}>
                            <span>Standing</span>
                        </label>
                        ${(p.standingDelayReason !== '-')
                            ? `<p class="delay-reason-text">เหตุผล: ${p.standingDelayReason}</p>` : ''}
                    </div>

                    <div class="status-item">
                        <label class="status-row">
                            <input type="checkbox" disabled class="status-checkbox ${p.ambulationDelayReason !== '-' ? 'red' : 'blue'}" ${p.ambulationStatus === 'Completed' ? 'checked' : ''}>
                            <span>Goal Ambulation</span>
                        </label>
                        ${(p.ambulationDelayReason !== '-')
                            ? `<p class="delay-reason-text">เหตุผล: ${p.ambulationDelayReason}</p>` : ''}
                    </div>
                `;
                patientListDiv.appendChild(card);
            });


        }, err => {
            console.error("Error:", err);
            alert("โหลดข้อมูลผู้ป่วยล้มเหลว: " + err.message);
        });
    };

    // ฟังก์ชันสำหรับ Export Excel
    const exportPatientsToExcel = () => {
        if (currentPatientsData.length === 0) {
            alert('ไม่พบข้อมูลผู้ป่วยที่จะส่งออก.');
            return;
        }

        // สร้าง WorkSheet จากข้อมูลผู้ป่วย
        const ws = XLSX.utils.json_to_sheet(currentPatientsData);
        // สร้าง WorkBook ใหม่
        const wb = XLSX.utils.book_new();
        // เพิ่ม WorkSheet เข้าไปใน WorkBook
        XLSX.utils.book_append_sheet(wb, ws, "DelayPatients");

        // กำหนดชื่อไฟล์ Excel โดยมีวันที่ปัจจุบันต่อท้าย
        const filename = `Delay_Patients_${new Date().toISOString().slice(0, 10)}.xlsx`;
        // ดาวน์โหลดไฟล์ Excel
        XLSX.writeFile(wb, filename);
    };

    // Event Listener สำหรับปุ่ม Export Excel
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', exportPatientsToExcel);
    }


    await fetchBuildings();
    renderPatients('all');
    buildingSelect.addEventListener('change', e => renderPatients(e.target.value));
});
// 🔧 แก้ไขตามคำสั่ง (โดยผู้เชี่ยวชาญ):
// 1. ใน collection 'patients' → set isActive: false (ห้ามแก้ field อื่น เช่น patient_status)
// 2. ใน collection 'register_process_statuses' → ห้ามลบ document, set isActive: false แทน
// 3. เพิ่มเงื่อนไข isActive: true ในการโหลดตึกและผู้ป่วย

import { db } from './firebase.js';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  query,
  where,
  updateDoc,
  writeBatch,
  serverTimestamp,
  orderBy, // <-- เพิ่มการนำเข้า orderBy
  limit    // <-- เพิ่มการนำเข้า limit
} from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

// --- ส่วนควบคุมเมนู (ไม่เปลี่ยนแปลง) ---
const hamburgerMenu = document.getElementById('hamburgerMenu');
const overlayMenu = document.getElementById('overlayMenu');
const closeMenu = document.getElementById('closeMenu');
// --- จบส่วนควบคุมเมนู ---

const buildingFilter = document.getElementById('buildingFilter');
const patientFilter = document.getElementById('patientFilter');
const dischargeForm = document.getElementById('dischargeForm');
const submitDischargeButton = document.getElementById('submitDischarge');

const dischargeOptionGroup = document.getElementById('dischargeOptionGroup'); // สำหรับ Today/Tomorrow
const finalDischargeOptionGroup = document.getElementById('finalDischargeOptionGroup'); // สำหรับ Discharge
const dischargeCriteriaGroup = document.getElementById('dischargeCriteriaGroup');
const equipmentGroup = document.getElementById('equipmentGroup');
const equipmentOtherCheckbox = document.getElementById('equipmentOther');
const equipmentOtherReasonTextarea = document.getElementById('equipmentOtherReason');

// โหลดรายการตึก
async function loadBuildings() {
  // Query only patients where isActive is true
  const q = query(collection(db, 'patients'), where('isActive', '==', true));
  const snapshot = await getDocs(q);
  const buildings = new Set();

  if (buildingFilter) {
      buildingFilter.innerHTML = `<option value="">-- เลือกตึก --</option>`;
      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = '-- ตึกทั้งหมด --';
      buildingFilter.appendChild(allOption);
  }


  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.building) buildings.add(data.building);
  });

  Array.from(buildings).sort().forEach(building => { // Sort buildings alphabetically
    const option = document.createElement('option');
    option.value = building;
    option.textContent = ` ${building}`;
    if (buildingFilter) buildingFilter.appendChild(option);
  });
}

// โหลดผู้ป่วยตามตึก หรือโหลดทั้งหมดหากเลือก 'all'
async function loadPatientsByBuilding(buildingId) {
    if (patientFilter) {
        patientFilter.innerHTML = `<option value="">-- เลือกผู้ป่วย --</option>`;
        patientFilter.disabled = true;
    }
    enableDischargeForm(false); // ปิดฟอร์มไว้ก่อน

    if (!buildingId) {
        return;
    }

    let q;
    if (buildingId === 'all') {
        // Query all active patients
        q = query(collection(db, 'patients'), where('isActive', '==', true));
    } else {
        // Query active patients in a specific building
        q = query(collection(db, 'patients'), where('building', '==', buildingId), where('isActive', '==', true));
    }

    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            const noPatientsOption = document.createElement('option');
            noPatientsOption.value = '';
            noPatientsOption.textContent = 'ไม่พบผู้ป่วย';
            if (patientFilter) patientFilter.appendChild(noPatientsOption);
        } else {
            if (patientFilter) patientFilter.disabled = false;
            querySnapshot.forEach(doc => {
                const data = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = data.name || 'ไม่ระบุชื่อ';
                if (patientFilter) patientFilter.appendChild(option);
            });
        }
    } catch (error) {
        console.error("Error loading patients: ", error);
        alert("เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ป่วย: " + error.message);
    }
}

// แสดงรายละเอียดผู้ป่วยและโหลดข้อมูลเก่าเข้าฟอร์ม
async function showPatientDetails(patientId) {
    // 1. ล้างข้อมูลที่แสดงผู้ป่วยทั้งหมดและรีเซ็ตค่าในฟอร์มทั้งหมดให้เป็นค่าเริ่มต้น
    const patientNameDisplay = document.getElementById('patientNameDisplay');
    if (patientNameDisplay) patientNameDisplay.textContent = '';
    const patientIdDisplay = document.getElementById('patientIdDisplay');
    if (patientIdDisplay) patientIdDisplay.textContent = '';
    const buildingDisplay = document.getElementById('buildingDisplay');
    if (buildingDisplay) buildingDisplay.textContent = '';
    const roomDisplay = document.getElementById('roomDisplay');
    if (roomDisplay) roomDisplay.textContent = '';
    const postOpDayDisplay = document.getElementById('postOpDayDisplay');
    if (postOpDayDisplay) postOpDayDisplay.textContent = 'N/A';
    const lengthOfStayDisplay = document.getElementById('lengthOfStayDisplay');
    if (lengthOfStayDisplay) lengthOfStayDisplay.textContent = 'N/A';

    resetAllFormFieldsToDefault();

    if (!patientId) {
        enableDischargeForm(false); // ปิดฟอร์มถ้าไม่มีผู้ป่วยถูกเลือก
        return;
    }

    // 2. เปิดใช้งานฟอร์มทันทีเมื่อผู้ป่วยถูกเลือก
    enableDischargeForm(true);

    // 3. Fetch patient base info
    const patientDocRef = doc(db, 'patients', patientId);
    let patientData = {};
    try {
        const docSnap = await getDoc(patientDocRef);
        if (docSnap.exists()) {
            patientData = docSnap.data();
            if (patientNameDisplay) patientNameDisplay.textContent = patientData.name;
            if (patientIdDisplay) patientIdDisplay.textContent = patientData.patientId;
            if (buildingDisplay) buildingDisplay.textContent = patientData.building;
            if (roomDisplay) roomDisplay.textContent = patientData.room;

            // Calculate Post-Op Day
            let postOpDay = 'N/A';
            if (patientData.operationDate) {
                try {
                    const opDate = new Date(patientData.operationDate);
                    const today = new Date();
                    opDate.setHours(0, 0, 0, 0);
                    today.setHours(0, 0, 0, 0);
                    const diffTime = Math.abs(today.getTime() - opDate.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    postOpDay = `${diffDays} วัน`;
                } catch (e) {
                    console.error("Invalid operationDate format:", patientData.operationDate, e);
                }
            }
            if (postOpDayDisplay) postOpDayDisplay.textContent = postOpDay;

            // Calculate Length of Stay
            let lengthOfStay = 'N/A';
            if (patientData.admissionDate) {
                try {
                    const admDate = new Date(patientData.admissionDate);
                    const today = new Date();
                    admDate.setHours(0, 0, 0, 0);
                    today.setHours(0, 0, 0, 0);
                    const diffTime = Math.abs(today.getTime() - admDate.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    lengthOfStay = `${diffDays} วัน`;
                } catch (e) {
                    console.error("Invalid admissionDate format:", patientData.admissionDate, e);
                }
            }
            if (lengthOfStayDisplay) lengthOfStayDisplay.textContent = lengthOfStay;

        } else {
            console.log('No such patient document!');
            alert('ไม่พบข้อมูลผู้ป่วย');
            enableDischargeForm(false);
            return;
        }
    } catch (error) {
        console.error('Error fetching patient document:', error);
        alert('เกิดข้อผิดพลาดในการดึงข้อมูลผู้ป่วย');
        enableDischargeForm(false);
        return;
    }

    // 4. Fetch latest 'data' document for this patient that is isActive: true
    // *** แก้ไขตรงนี้: เพิ่ม orderBy และ limit เพื่อดึงข้อมูลล่าสุดจริงๆ ***
    const dataQuery = query(
        collection(db, 'data'),
        where('patientId', '==', patientId),
        where('isActive', '==', true),
        orderBy('timestamp', 'desc'), // เรียงจากเวลาล่าสุดไปเก่าสุด
        limit(1)                     // เอาแค่เอกสารเดียว (ล่าสุด)
    );

    let latestDischargeData = null;
    try {
        const dataSnapshot = await getDocs(dataQuery);
        if (!dataSnapshot.empty) {
            latestDischargeData = dataSnapshot.docs[0].data();
            console.log("Loaded latest discharge data:", latestDischargeData); // เพิ่ม console.log เพื่อตรวจสอบ
        } else {
            console.log("No active discharge data found for patient:", patientId); // เพิ่ม console.log
        }
    } catch (error) {
        console.error('Error fetching latest data document:', error);
    }

    // 5. Populate form fields if latestDischargeData exists
    if (latestDischargeData) {
        // Populate discharge options (Today/Tomorrow/Discharge)
        const dischargeToday = document.getElementById('dischargeToday');
        if (dischargeToday && latestDischargeData.dischargeOption === 'today') {
            dischargeToday.checked = true;
        }
        const dischargeTomorrow = document.getElementById('dischargeTomorrow');
        if (dischargeTomorrow && latestDischargeData.dischargeOption === 'tomorrow') {
            dischargeTomorrow.checked = true;
        }
        const dischargePermanently = document.getElementById('dischargePermanently');
        if (dischargePermanently && latestDischargeData.dischargeOption === 'discharge') {
            dischargePermanently.checked = true;
        }


        // Populate discharge criteria checkboxes and times
        if (latestDischargeData.dischargeCriteria && dischargeCriteriaGroup) {
            dischargeCriteriaGroup.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                const criterion = latestDischargeData.dischargeCriteria[checkbox.value];
                checkbox.checked = criterion ? criterion.checked : false;

                const timeInputId = `time${checkbox.id.replace('criteria', '')}`;
                const timeInput = document.getElementById(timeInputId);
                if (timeInput && criterion && criterion.checked && criterion.time) {
                    timeInput.value = criterion.time;
                }
                // Trigger change event to show/hide time input correctly based on its checked state
                const event = new Event('change');
                checkbox.dispatchEvent(event);
            });
        }

        // Populate equipment checkboxes and other reason
        if (latestDischargeData.equipment && equipmentGroup) {
            equipmentGroup.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                // ตรวจสอบค่าใน latestDischargeData.equipment ว่าเป็น true หรือเป็น string (สำหรับ 'other')
                if (typeof latestDischargeData.equipment[checkbox.value] === 'boolean') {
                    checkbox.checked = latestDischargeData.equipment[checkbox.value];
                } else if (checkbox.value === 'other' && typeof latestDischargeData.equipment[checkbox.value] === 'string') {
                    checkbox.checked = true; // ถ้าเป็น 'other' และมีค่า string แสดงว่าถูกติ๊ก
                } else {
                    checkbox.checked = false;
                }
            });

            // Handle 'other' equipment specifically
            if (typeof latestDischargeData.equipment.other === 'string' && latestDischargeData.equipment.other.trim() !== '') {
                if (equipmentOtherCheckbox) equipmentOtherCheckbox.checked = true;
                if (equipmentOtherReasonTextarea) equipmentOtherReasonTextarea.value = latestDischargeData.equipment.other;
                // ต้องเรียก dispatchEvent เสมอ เพื่อให้ logic การแสดงผลทำงาน
                const event = new Event('change');
                if (equipmentOtherCheckbox) equipmentOtherCheckbox.dispatchEvent(event);
            } else {
                if (equipmentOtherCheckbox) equipmentOtherCheckbox.checked = false;
                // ต้องเรียก dispatchEvent เสมอ เพื่อให้ logic การแสดงผลทำงาน
                const event = new Event('change');
                if (equipmentOtherCheckbox) equipmentOtherCheckbox.dispatchEvent(event);
            }
        }
    }
}

// เปิด/ปิดฟอร์มจำหน่าย
// ฟังก์ชันนี้ควรควบคุมแค่ disabled/enabled เท่านั้น
function enableDischargeForm(enable) {
    if (!dischargeForm) return;
    const formElements = dischargeForm.elements;
    for (let i = 0; i < formElements.length; i++) {
        // ยกเว้น buildingFilter และ patientFilter เพราะถูกจัดการแยกต่างหาก
        // และยกเว้น submitDischargeButton เพราะจัดการแยกต่างหาก
        if (formElements[i].id !== 'buildingFilter' && formElements[i].id !== 'patientFilter' && formElements[i].id !== 'submitDischarge') {
            formElements[i].disabled = !enable;
        }
    }
    if (submitDischargeButton) submitDischargeButton.disabled = !enable;
}


// Event listener for "อื่นๆ ระบุ" checkbox in Equipment (ไม่เปลี่ยนแปลง)
if (equipmentOtherCheckbox) {
    equipmentOtherCheckbox.addEventListener('change', () => {
        if (equipmentOtherCheckbox.checked) {
            if (equipmentOtherReasonTextarea) {
                equipmentOtherReasonTextarea.style.display = 'block';
                equipmentOtherReasonTextarea.required = true;
            }
        } else {
            if (equipmentOtherReasonTextarea) {
                equipmentOtherReasonTextarea.style.display = 'none';
                equipmentOtherReasonTextarea.required = false;
                equipmentOtherReasonTextarea.value = '';
            }
        }
    });
}


// Event listener for Discharge Criteria checkboxes to show/hide time input (ไม่เปลี่ยนแปลง)
if (dischargeCriteriaGroup) {
    dischargeCriteriaGroup.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (event) => {
            const timeInputId = `time${event.target.id.replace('criteria', '')}`;
            const timeInput = document.getElementById(timeInputId);
            if (timeInput) {
                if (event.target.checked && (event.target.value === 'orthopedist' || event.target.value === 'geriatic' || event.target.value === 'physical_therapist')) {
                    timeInput.style.display = 'block';
                    timeInput.required = true;
                } else {
                    timeInput.style.display = 'none';
                    timeInput.required = false;
                    timeInput.value = '';
                }
            }
        });
    });
}


// ************************************************************
// Logic ใหม่: จัดการ Checkbox ใน dischargeOptionGroup (Today/Tomorrow) ให้เลือกได้เพียงอันเดียวและสามารถยกเลิกได้ (ไม่เปลี่ยนแปลง)
// ************************************************************
if (dischargeOptionGroup) {
    dischargeOptionGroup.addEventListener('change', (event) => {
        // ตรวจสอบว่าเป็น checkbox ในกลุ่ม dischargeOptionGroup
        if (event.target.type === 'checkbox' && event.target.name === 'dischargeOption') {
            // ถ้า checkbox ที่คลิกถูกติ๊ก
            if (event.target.checked) {
                // ยกเลิกการติ๊ก checkbox อื่นๆ ทั้งหมดในกลุ่มเดียวกัน
                dischargeOptionGroup.querySelectorAll('input[name="dischargeOption"]').forEach(checkbox => {
                    if (checkbox !== event.target) {
                        checkbox.checked = false;
                    }
                });
                // ตรวจสอบและยกเลิกการติ๊ก Discharge checkbox หากถูกเลือก
                const dischargePermanentlyCheckbox = document.getElementById('dischargePermanently');
                if (dischargePermanentlyCheckbox) {
                    if (dischargePermanentlyCheckbox.checked) {
                        dischargePermanentlyCheckbox.checked = false;
                    }
                }
            }
        }
    });
}


// ************************************************************
// Logic ใหม่: จัดการ Checkbox ใน finalDischargeOptionGroup (Discharge) ให้สามารถยกเลิกได้และยกเลิกตัวเลือก Today/Tomorrow (ไม่เปลี่ยนแปลง)
// ************************************************************
if (finalDischargeOptionGroup) {
    finalDischargeOptionGroup.addEventListener('change', (event) => {
        // ตรวจสอบว่าเป็น checkbox ในกลุ่ม finalDischargeOptionGroup (Discharge)
        if (event.target.type === 'checkbox' && event.target.name === 'finalDischargeOption') {
            // ถ้า Discharge ถูกติ๊ก
            if (event.target.checked) {
                // ยกเลิกการติ๊ก checkbox ใน dischargeOptionGroup (Today/Tomorrow) ทั้งหมด
                if (dischargeOptionGroup) {
                    dischargeOptionGroup.querySelectorAll('input[name="dischargeOption"]').forEach(checkbox => {
                        checkbox.checked = false;
                    });
                }
            }
            // ถ้า Discharge ถูกยกเลิกการติ๊ก ไม่ต้องทำอะไร
        }
    });
}


// Handle form submission (ปรับ Logic การตรวจสอบ selectedDischargeOption และจัดการ isActive)
async function handleDischargeSubmit(event) {
    event.preventDefault();

    const selectedPatientId = patientFilter ? patientFilter.value : null;
    if (!selectedPatientId) {
        alert("กรุณาเลือกผู้ป่วยก่อนส่งฟอร์ม");
        return;
    }

    // ปิดการใช้งานฟอร์มและแสดงสถานะกำลังส่ง
    if (submitDischargeButton) {
        submitDischargeButton.disabled = true;
        submitDischargeButton.textContent = 'กำลังส่งข้อมูล...';
    }


    // ดึงค่าของ checkbox ที่ถูกเลือก
    const dischargeToday = document.getElementById('dischargeToday');
    const selectedDischargeToday = dischargeToday && dischargeToday.checked ? 'today' : null;

    const dischargeTomorrow = document.getElementById('dischargeTomorrow');
    const selectedDischargeTomorrow = dischargeTomorrow && dischargeTomorrow.checked ? 'tomorrow' : null;

    const dischargePermanently = document.getElementById('dischargePermanently');
    const selectedDischargePermanently = dischargePermanently && dischargePermanently.checked ? 'discharge' : null;


    let selectedDischargeOption = null;

    if (selectedDischargeToday) {
        selectedDischargeOption = selectedDischargeToday;
    } else if (selectedDischargeTomorrow) {
        selectedDischargeOption = selectedDischargeTomorrow;
    } else if (selectedDischargePermanently) {
        selectedDischargeOption = selectedDischargePermanently;
    }

    const dischargeCriteria = {};
    let allRequiredCriteriaTimeFilled = true;

    if (dischargeCriteriaGroup) {
        const criteriaCheckboxes = dischargeCriteriaGroup.querySelectorAll('input[name="dischargeCriteria"]');
        criteriaCheckboxes.forEach(checkbox => {
            const criteriaValue = checkbox.value;
            const timeInputId = `time${checkbox.id.replace('criteria', '')}`;
            const timeInput = document.getElementById(timeInputId);

            if (checkbox.checked) {
                dischargeCriteria[criteriaValue] = { checked: true };
                if (timeInput && (criteriaValue === 'orthopedist' || criteriaValue === 'geriatic' || criteriaValue === 'physical_therapist')) {
                    dischargeCriteria[criteriaValue].time = timeInput.value;
                    if (!timeInput.value) {
                        allRequiredCriteriaTimeFilled = false;
                    }
                }
            } else {
                dischargeCriteria[criteriaValue] = { checked: false };
                if (timeInput) {
                    timeInput.value = '';
                }
            }
        });
    }


    const equipment = {};
    let equipmentCheckedCount = 0;
    if (equipmentGroup) {
        const equipmentCheckboxes = equipmentGroup.querySelectorAll('input[name="equipment"]');
        for (const checkbox of equipmentCheckboxes) {
            if (checkbox.checked) {
                equipmentCheckedCount++;
                if (checkbox.value === 'other') {
                    const otherReason = equipmentOtherReasonTextarea ? equipmentOtherReasonTextarea.value.trim() : '';
                    if (otherReason === '') {
                        alert("กรุณาระบุข้อความสำหรับ 'อื่นๆ ระบุ' ในส่วนอุปกรณ์");
                        if (submitDischargeButton) {
                            submitDischargeButton.disabled = false;
                            submitDischargeButton.textContent = 'บันทึกข้อมูล';
                        }
                        return;
                    }
                    equipment[checkbox.value] = otherReason;
                } else {
                    equipment[checkbox.value] = true;
                }
            } else {
                if (checkbox.value === 'other') {
                    if (equipmentOtherReasonTextarea) equipmentOtherReasonTextarea.value = '';
                }
            }
        }
    }


    // ตรวจสอบเงื่อนไขเฉพาะเมื่อ 'Discharge' ถูกเลือก
    if (selectedDischargeOption === 'discharge') {
        const requiredCriteriaForDischarge = ['orthopedist', 'geriatic', 'physical_therapist'];
        let allRequiredCriteriaForDischargeChecked = true;
        for (const criteria of requiredCriteriaForDischarge) {
            if (!dischargeCriteria[criteria] || !dischargeCriteria[criteria].checked) {
                allRequiredCriteriaForDischargeChecked = false;
                break;
            }
        }

        if (!allRequiredCriteriaForDischargeChecked) {
            alert("หากเลือก 'Discharge' ต้องเลือก Discharge Criteria ทั้ง 3 ข้อ (Orthopedist, Geriatric, Physical Therapist).");
            if (submitDischargeButton) {
                submitDischargeButton.disabled = false;
                submitDischargeButton.textContent = 'บันทึกข้อมูล';
            }
            return;
        }

        if (!allRequiredCriteriaTimeFilled) {
            alert("หากเลือก 'Discharge' ต้องระบุเวลาสำหรับ Orthopedist, Geriatric, และ Physical Therapist ทุกข้อ.");
            if (submitDischargeButton) {
                submitDischargeButton.disabled = false;
                submitDischargeButton.textContent = 'บันทึกข้อมูล';
            }
            return;
        }

        if (equipmentCheckedCount === 0) {
            alert("หากเลือก 'Discharge' ต้องเลือกอุปกรณ์อย่างน้อยหนึ่งรายการ.");
            if (submitDischargeButton) {
                submitDischargeButton.disabled = false;
                submitDischargeButton.textContent = 'บันทึกข้อมูล';
            }
            return;
        }
    } else {
        // Logic ที่ทำงานเมื่อไม่ได้เลือก 'Discharge' แต่ยังต้องตรวจสอบ 'อื่นๆ ระบุ'
        if (equipmentOtherCheckbox && equipmentOtherCheckbox.checked && (equipmentOtherReasonTextarea ? equipmentOtherReasonTextarea.value.trim() === '' : true)) {
            alert("กรุณาระบุข้อความสำหรับ 'อื่นๆ ระบุ' ในส่วนอุปกรณ์");
            if (submitDischargeButton) {
                submitDischargeButton.disabled = false;
                submitDischargeButton.textContent = 'บันทึกข้อมูล';
            }
            return;
        }
    }

    const patientName = patientFilter ? patientFilter.options[patientFilter.selectedIndex].text : 'Unknown Patient';


    try {
        const batch = writeBatch(db); // เริ่มต้น batch operation

        // --- ขั้นตอนที่ 1: ตั้งค่า isActive: false ให้กับเอกสารเก่าทั้งหมดสำหรับ patientId นี้ ---
        // สำหรับ collection 'data' (เฉพาะที่ isActive: true)
        const dataCollectionRef = collection(db, 'data');
        const oldDataQuery = query(dataCollectionRef, where('patientId', '==', selectedPatientId), where('isActive', '==', true));
        const oldDataSnapshot = await getDocs(oldDataQuery);
        oldDataSnapshot.forEach(docToUpdate => {
            batch.update(docToUpdate.ref, { isActive: false });
            console.log(`Deactivating old data record: ${docToUpdate.id} for patient ${selectedPatientId}`);
        });

        // สำหรับ collection 'register_process_statuses' (เฉพาะที่ isActive: true)
        const statusCollectionRef = collection(db, 'register_process_statuses');
        const oldStatusQuery = query(statusCollectionRef, where('patientId', '==', selectedPatientId), where('isActive', '==', true));
        const oldStatusSnapshot = await getDocs(oldStatusQuery);
        oldStatusSnapshot.forEach(docToUpdate => {
            batch.update(docToUpdate.ref, { isActive: false });
            console.log(`Deactivating old status record: ${docToUpdate.id} for patient ${selectedPatientId}`);
        });


        // --- ขั้นตอนที่ 2: เตรียมข้อมูลสำหรับฟอร์มที่ส่งใหม่ และเพิ่มเข้าไปใน batch ---
        const newDischargeData = {
            patientId: selectedPatientId,
            patientName: patientName,
            dischargeOption: selectedDischargeOption,
            dischargeCriteria: dischargeCriteria,
            equipment: equipment,
            timestamp: serverTimestamp(), // ใช้ serverTimestamp เพื่อความแม่นยำ
            isActive: true // <-- สำคัญ: ตั้งค่าเรคคอร์ดใหม่นี้ให้เป็น active เสมอ
        };
        batch.set(doc(dataCollectionRef), newDischargeData); // เพิ่มเรคคอร์ดข้อมูลใหม่

        // หากมีการอัปเดต register_process_statuses ด้วยฟอร์มนี้ ก็เพิ่มเข้า batch เช่นกัน
        if (selectedDischargeOption !== 'discharge') {
            // สร้าง document ใหม่ใน register_process_statuses ให้ isActive: true
            const newRegisterStatusData = {
                patientId: selectedPatientId,
                timestamp: serverTimestamp(),
                // เพิ่มข้อมูลสถานะอื่นๆ ที่เกี่ยวข้องที่ต้องการให้เป็น active ที่นี่
                // เช่น process_type: "Discharge Process", status: "Ongoing"
                isActive: true
            };
            batch.set(doc(statusCollectionRef), newRegisterStatusData);
            console.log(`Adding new active record to 'register_process_statuses' for patient ${selectedPatientId}.`);
        }


        // --- ขั้นตอนที่ 3: Commit batch operation ---
        await batch.commit();

        alert('บันทึกข้อมูลผู้ป่วยเรียบร้อยแล้ว และอัปเดตสถานะ isActive ของข้อมูลเก่า');

        // --- Logic เฉพาะเมื่อเลือก 'Discharge' อย่างถาวร ---
        if (selectedDischargeOption === 'discharge') {
            // Update patient status in 'patients' collection to isActive: false
            const patientRef = doc(db, "patients", selectedPatientId);
            await updateDoc(patientRef, {
                isActive: false
            });
            console.log(`Patient ${selectedPatientId} status updated to 'false' in 'patients' collection.`);

            // อัปเดต isActive: false ใน patient_alerts
            const collectionsToUpdateStatusOnDischarge = [
                "patient_alerts"
            ];

            for (const colName of collectionsToUpdateStatusOnDischarge) {
                const q = query(collection(db, colName), where("patientId", "==", selectedPatientId));
                const snapshot = await getDocs(q);
                const updatePromises = [];
                snapshot.forEach(docToUpdate => {
                    const updateField = 'isActive'; // Assume 'isActive' for 'patient_alerts'
                    updatePromises.push(updateDoc(doc(db, colName, docToUpdate.id), { [updateField]: false }));
                });
                await Promise.all(updatePromises);
                console.log(`Updated ${snapshot.size} documents in '${colName}' to isActive: false for patient ${selectedPatientId} during discharge.`);
            }

            alert(`ผู้ป่วย ${patientName} ได้รับการจำหน่ายและข้อมูลที่เกี่ยวข้องถูกอัปเดตแล้ว`);
        }

        // รีเซ็ตและโหลดข้อมูลใหม่หลังจากส่งฟอร์มสำเร็จ
        if (dischargeForm) dischargeForm.reset();
        clearPatientDetailsAndForm();
        await loadBuildings();
        if (buildingFilter) buildingFilter.value = '';
        loadPatientsByBuilding('');

    } catch (error) {
        console.error("Error saving/updating data: ", error);
        alert("เกิดข้อผิดพลาดในการบันทึกหรืออัปเดตข้อมูล: " + error.message);
    } finally {
        if (submitDischargeButton) {
            submitDischargeButton.disabled = false;
            submitDischargeButton.textContent = 'บันทึกข้อมูล';
        }
    }
}

// ฟังก์ชันแยกสำหรับการรีเซ็ตค่าฟอร์มทั้งหมดให้เป็นค่าเริ่มต้น
function resetAllFormFieldsToDefault() {
    if (dischargeForm) {
        dischargeForm.querySelectorAll('input[type="text"], input[type="number"], textarea').forEach(input => {
            input.value = '';
        });
    }


    // รีเซ็ต checkbox/radio ในกลุ่ม Today/Tomorrow/Discharge
    const dischargeToday = document.getElementById('dischargeToday');
    if (dischargeToday) dischargeToday.checked = false;
    const dischargeTomorrow = document.getElementById('dischargeTomorrow');
    if (dischargeTomorrow) dischargeTomorrow.checked = false;
    const dischargePermanently = document.getElementById('dischargePermanently');
    if (dischargePermanently) dischargePermanently.checked = false;

    // รีเซ็ต Discharge Criteria checkboxes และ hidden time inputs
    if (dischargeCriteriaGroup) {
        dischargeCriteriaGroup.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
            const timeInputId = `time${checkbox.id.replace('criteria', '')}`;
            const timeInput = document.getElementById(timeInputId);
            if (timeInput) {
                timeInput.style.display = 'none';
                timeInput.required = false;
                timeInput.value = '';
            }
        });
    }


    // รีเซ็ต Equipment checkboxes และ "อื่นๆ ระบุ" textarea
    if (equipmentGroup) {
        equipmentGroup.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });
    }

    if (equipmentOtherCheckbox) equipmentOtherCheckbox.checked = false;
    if (equipmentOtherReasonTextarea) {
        equipmentOtherReasonTextarea.style.display = 'none';
        equipmentOtherReasonTextarea.required = false;
        equipmentOtherReasonTextarea.value = '';
    }
}


// ฟังก์ชันสำหรับล้างข้อมูลผู้ป่วยที่แสดงและปิดฟอร์มทั้งหมด
function clearPatientDetailsAndForm() {
    // Clear patient display info
    const patientNameDisplay = document.getElementById('patientNameDisplay');
    if (patientNameDisplay) patientNameDisplay.textContent = '';
    const patientIdDisplay = document.getElementById('patientIdDisplay');
    if (patientIdDisplay) patientIdDisplay.textContent = '';
    const buildingDisplay = document.getElementById('buildingDisplay');
    if (buildingDisplay) buildingDisplay.textContent = '';
    const roomDisplay = document.getElementById('roomDisplay');
    if (roomDisplay) roomDisplay.textContent = '';
    const postOpDayDisplay = document.getElementById('postOpDayDisplay');
    if (postOpDayDisplay) postOpDayDisplay.textContent = 'N/A';
    const lengthOfStayDisplay = document.getElementById('lengthOfStayDisplay');
    if (lengthOfStayDisplay) lengthOfStayDisplay.textContent = 'N/A';

    // Reset all form fields to their default empty/unchecked state
    resetAllFormFieldsToDefault();

    // Disable the form elements
    enableDischargeForm(false);

    // Reset patient filter dropdown
    if (patientFilter) {
        patientFilter.innerHTML = '<option value="">-- เลือกผู้ป่วย --</option>';
        patientFilter.disabled = true;
    }
}


// Event: เลือกตึก (ไม่เปลี่ยนแปลง)
if (buildingFilter) {
    buildingFilter.addEventListener('change', (e) => {
        const building = e.target.value;
        if (building) {
            loadPatientsByBuilding(building);
        } else {
            clearPatientDetailsAndForm();
        }
    });
}


// Event: เลือกผู้ป่วย (ไม่เปลี่ยนแปลง)
if (patientFilter) {
    patientFilter.addEventListener('change', (e) => {
        const patientId = e.target.value;
        if (patientId) {
            showPatientDetails(patientId);
        } else {
            clearPatientDetailsAndForm();
        }
    });
}


// เริ่มต้นโหลดเมื่อหน้าเว็บพร้อม (ไม่เปลี่ยนแปลง)
window.addEventListener('DOMContentLoaded', () => {
    loadBuildings();
    enableDischargeForm(false); // ปิดฟอร์มเริ่มต้น

    if (dischargeForm) {
        dischargeForm.addEventListener('submit', handleDischargeSubmit);
    }


    // --- เพิ่ม Event Listeners สำหรับควบคุมการเปิด-ปิดเมนู ---
    if (hamburgerMenu && overlayMenu && closeMenu) {
        hamburgerMenu.addEventListener('click', () => {
            overlayMenu.classList.add('open');
            document.body.classList.add('no-scroll');
        });

        closeMenu.addEventListener('click', () => {
            overlayMenu.classList.remove('open');
            document.body.classList.remove('no-scroll');
        });

        document.querySelectorAll('.overlay-menu .nav-list a').forEach(link => {
            link.addEventListener('click', () => {
                overlayMenu.classList.remove('open');
                document.body.classList.remove('no-scroll');
            });
        });

        overlayMenu.addEventListener('click', (event) => {
            if (event.target === overlayMenu) {
                overlayMenu.classList.remove('open');
                document.body.classList.remove('no-scroll');
            }
        });
    }
});
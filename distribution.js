import { db } from './firebase.js';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  updateDoc // Import updateDoc
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

// Collections to clear when a patient is 'Discharged' (excluding 'data' and 'patients')
const collectionsToClear = [
    "physicalPreps",
    "register_process_statuses",
    "delay_statuses"
];

// โหลดรายการตึก (ไม่เปลี่ยนแปลง)
async function loadBuildings() {
  const snapshot = await getDocs(collection(db, 'patients'));
  const buildings = new Set();

  buildingFilter.innerHTML = `<option value="">-- เลือกตึก --</option>`;
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = '-- ตึกทั้งหมด --';
  buildingFilter.appendChild(allOption);

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.building) buildings.add(data.building);
  });

  Array.from(buildings).sort().forEach(building => { // Sort buildings alphabetically
    const option = document.createElement('option');
    option.value = building;
    option.textContent = ` ${building}`;
    buildingFilter.appendChild(option);
  });
}

// โหลดผู้ป่วยตามตึก หรือโหลดทั้งหมดหากเลือก 'all' (ไม่เปลี่ยนแปลง)
async function loadPatientsByBuilding(buildingId) {
    patientFilter.innerHTML = `<option value="">-- เลือกผู้ป่วย --</option>`;
    patientFilter.disabled = true;
    enableDischargeForm(false);

    if (!buildingId) {
        return;
    }

    let q;
    if (buildingId === 'all') {
        q = collection(db, 'patients');
    } else {
        q = query(collection(db, 'patients'), where('building', '==', buildingId));
    }

    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            const noPatientsOption = document.createElement('option');
            noPatientsOption.value = '';
            noPatientsOption.textContent = 'ไม่พบผู้ป่วย';
            patientFilter.appendChild(noPatientsOption);
        } else {
            patientFilter.disabled = false;
            querySnapshot.forEach(doc => {
                const data = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = data.name || 'ไม่ระบุชื่อ';
                patientFilter.appendChild(option);
            });
        }
    } catch (error) {
        console.error("Error loading patients: ", error);
        alert("เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ป่วย: " + error.message);
    }
}

// แสดงรายละเอียดผู้ป่วย (ไม่เปลี่ยนแปลง)
async function showPatientDetails(patientId) {
  if (patientId) {
      enableDischargeForm(true); // Enable form when a patient is selected
  } else {
      enableDischargeForm(false);
  }
}

// เปิด/ปิดฟอร์มจำหน่าย (ไม่เปลี่ยนแปลง)
function enableDischargeForm(enable) {
  const formElements = dischargeForm.elements;
  for (let i = 0; i < formElements.length; i++) {
    if (formElements[i].id !== 'buildingFilter' && formElements[i].id !== 'patientFilter') {
        formElements[i].disabled = !enable;
    }
  }
  submitDischargeButton.disabled = !enable;

  document.querySelectorAll('.date-input').forEach(input => input.style.display = 'none');
  equipmentOtherReasonTextarea.style.display = 'none';
}

// Event listener for "อื่นๆ ระบุ" checkbox in Equipment (ไม่เปลี่ยนแปลง)
equipmentOtherCheckbox.addEventListener('change', () => {
    if (equipmentOtherCheckbox.checked) {
        equipmentOtherReasonTextarea.style.display = 'block';
        equipmentOtherReasonTextarea.required = true;
    } else {
        equipmentOtherReasonTextarea.style.display = 'none';
        equipmentOtherReasonTextarea.required = false;
        equipmentOtherReasonTextarea.value = '';
    }
});

// Event listener for Discharge Criteria checkboxes to show/hide time input (ไม่เปลี่ยนแปลง)
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

// ************************************************************
// Logic ใหม่: จัดการ Checkbox ใน dischargeOptionGroup (Today/Tomorrow) ให้เลือกได้เพียงอันเดียวและสามารถยกเลิกได้
// ************************************************************
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
            if (dischargePermanentlyCheckbox.checked) {
                dischargePermanentlyCheckbox.checked = false;
            }
        }
    }
});

// ************************************************************
// Logic ใหม่: จัดการ Checkbox ใน finalDischargeOptionGroup (Discharge) ให้สามารถยกเลิกได้และยกเลิกตัวเลือก Today/Tomorrow
// ************************************************************
finalDischargeOptionGroup.addEventListener('change', (event) => {
    // ตรวจสอบว่าเป็น checkbox ในกลุ่ม finalDischargeOptionGroup (Discharge)
    if (event.target.type === 'checkbox' && event.target.name === 'finalDischargeOption') {
        // ถ้า Discharge ถูกติ๊ก
        if (event.target.checked) {
            // ยกเลิกการติ๊ก checkbox ใน dischargeOptionGroup (Today/Tomorrow) ทั้งหมด
            dischargeOptionGroup.querySelectorAll('input[name="dischargeOption"]').forEach(checkbox => {
                checkbox.checked = false;
            });
        }
        // ถ้า Discharge ถูกยกเลิกการติ๊ก ไม่ต้องทำอะไร
    }
});


// Handle form submission (ปรับ Logic การตรวจสอบ selectedDischargeOption)
async function handleDischargeSubmit(event) {
  event.preventDefault();

  const selectedPatientId = patientFilter.value;
  if (!selectedPatientId) {
    alert("กรุณาเลือกผู้ป่วยที่ต้องการจัดการการจำหน่ายยา");
    return;
  }

  // ดึงค่าของ checkbox ที่ถูกเลือก
  const selectedDischargeToday = document.getElementById('dischargeToday').checked ? 'today' : null;
  const selectedDischargeTomorrow = document.getElementById('dischargeTomorrow').checked ? 'tomorrow' : null;
  const selectedDischargePermanently = document.getElementById('dischargePermanently').checked ? 'discharge' : null;

  let selectedDischargeOption = null;

  // กำหนดค่า selectedDischargeOption หากมีการเลือก
  if (selectedDischargeToday) {
      selectedDischargeOption = selectedDischargeToday;
  } else if (selectedDischargeTomorrow) {
      selectedDischargeOption = selectedDischargeTomorrow;
  } else if (selectedDischargePermanently) {
      selectedDischargeOption = selectedDischargePermanently;
  }

  const dischargeCriteria = {};
  let allRequiredCriteriaTimeFilled = true;
  
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

  const equipment = {};
  let equipmentCheckedCount = 0;
  const equipmentCheckboxes = equipmentGroup.querySelectorAll('input[name="equipment"]');
  for (const checkbox of equipmentCheckboxes) {
      if (checkbox.checked) {
          equipmentCheckedCount++;
          if (checkbox.value === 'other') {
              const otherReason = equipmentOtherReasonTextarea.value.trim();
              if (otherReason === '') {
                  alert("กรุณาระบุข้อความสำหรับ 'อื่นๆ ระบุ' ในส่วนอุปกรณ์");
                  return;
              }
              equipment[checkbox.value] = otherReason;
          } else {
              equipment[checkbox.value] = true;
          }
      } else {
          if (checkbox.value === 'other') {
              equipmentOtherReasonTextarea.value = '';
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
          return;
      }
      
      if (!allRequiredCriteriaTimeFilled) {
          alert("หากเลือก 'Discharge' ต้องระบุเวลาสำหรับ Orthopedist, Geriatric, และ Physical Therapist ทุกข้อ.");
          return;
      }
      
      if (equipmentCheckedCount === 0) {
          alert("หากเลือก 'Discharge' ต้องเลือกอุปกรณ์อย่างน้อยหนึ่งรายการ.");
          return;
      }
  } else {
      // Logic ที่ทำงานเมื่อไม่ได้เลือก 'Discharge' แต่ยังต้องตรวจสอบ 'อื่นๆ ระบุ'
      if (equipmentOtherCheckbox.checked && equipmentOtherReasonTextarea.value.trim() === '') {
          alert("กรุณาระบุข้อความสำหรับ 'อื่นๆ ระบุ' ในส่วนอุปกรณ์");
          return;
      }
  }

  const patientName = patientFilter.options[patientFilter.selectedIndex].text;
  const dischargeData = {
    patientId: selectedPatientId,
    patientName: patientName,
    dischargeOption: selectedDischargeOption, 
    dischargeCriteria: dischargeCriteria,
    equipment: equipment,
    timestamp: new Date(),
    isActive: selectedDischargeOption !== 'discharge' // Set isActive to true if not 'discharge'
  };

  try {
    await addDoc(collection(db, "data"), dischargeData);
    alert("บันทึกข้อมูลการจำหน่ายยาสำเร็จ!");

    if (selectedDischargeOption === 'discharge') {
        // Update patient status in 'patients' collection
        const patientRef = doc(db, "patients", selectedPatientId);
        await updateDoc(patientRef, {
            patient_status: "false" 
        });
        console.log(`Patient ${selectedPatientId} status updated to 'false' in 'patients' collection.`);

        // Update isActive/patient_status in other relevant collections
        const collectionsToUpdateStatus = [
            "data", // 'data' collection itself
            "patient_alerts"
        ];

        for (const colName of collectionsToUpdateStatus) {
            const q = query(collection(db, colName), where("patientId", "==", selectedPatientId));
            const snapshot = await getDocs(q);
            const updatePromises = [];
            snapshot.forEach(docToUpdate => {
                const updateField = colName === "patients" ? "patient_status" : "isActive";
                updatePromises.push(updateDoc(doc(db, colName, docToUpdate.id), { [updateField]: false }));
            });
            await Promise.all(updatePromises);
            console.log(`Updated ${snapshot.size} documents in '${colName}' to isActive/patient_status: false for patient ${selectedPatientId}.`);
        }

        // Clear other collections as before
        for (const colName of collectionsToClear) {
            const q = query(collection(db, colName), where("patientId", "==", selectedPatientId));
            const snapshot = await getDocs(q);
            const deletePromises = [];
            snapshot.forEach(docToDelete => {
                deletePromises.push(deleteDoc(doc(db, colName, docToDelete.id)));
            });
            await Promise.all(deletePromises);
            console.log(`Cleared ${snapshot.size} documents from '${colName}' for patient ${selectedPatientId}.`);
        }
        alert(`ผู้ป่วย ${patientName} ได้รับการจำหน่ายและข้อมูลที่เกี่ยวข้องถูกอัปเดตแล้ว`);
    }

    dischargeForm.reset();
    clearPatientDetailsAndForm();
    await loadBuildings();
    buildingFilter.value = '';
    loadPatientsByBuilding('');

  } catch (error) {
    console.error("Error saving/updating/deleting data: ", error);
    alert("เกิดข้อผิดพลาดในการบันทึกหรือลบข้อมูล: " + error.message);
  }
}

function clearPatientDetailsAndForm() {
    patientFilter.innerHTML = '<option value="">-- เลือกผู้ป่วย --</option>';
    patientFilter.disabled = true;
    enableDischargeForm(false);
    equipmentOtherReasonTextarea.style.display = 'none';
    equipmentOtherReasonTextarea.value = '';
    document.querySelectorAll('.date-input').forEach(input => {
        input.style.display = 'none';
        input.required = false;
        input.value = '';
    });
    // *** Reset all checkboxes in both groups ***
    document.querySelectorAll('input[name="dischargeOption"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    document.getElementById('dischargePermanently').checked = false;
    document.querySelectorAll('input[name="dischargeCriteria"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    document.querySelectorAll('input[name="equipment"]').forEach(checkbox => {
        checkbox.checked = false;
    });
}


// Event: เลือกตึก (ไม่เปลี่ยนแปลง)
buildingFilter.addEventListener('change', (e) => {
  const building = e.target.value;
  if (building) {
    loadPatientsByBuilding(building);
  } else {
    clearPatientDetailsAndForm();
  }
});

// Event: เลือกผู้ป่วย (ไม่เปลี่ยนแปลง)
patientFilter.addEventListener('change', (e) => {
  const patientId = e.target.value;
  if (patientId) {
    showPatientDetails(patientId);
  } else {
    clearPatientDetailsAndForm();
  }
});

// เริ่มต้นโหลดเมื่อหน้าเว็บพร้อม (ไม่เปลี่ยนแปลง)
window.addEventListener('DOMContentLoaded', () => {
  loadBuildings();
  enableDischargeForm(false);

  dischargeForm.addEventListener('submit', handleDischargeSubmit);

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
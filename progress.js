import { db } from './firebase.js'; 
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // === Hamburger Menu Functionality ===
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const overlayMenu = document.getElementById('overlayMenu');
    const closeMenuBtn = document.getElementById('closeMenu');
    const overlayNavLinks = document.querySelectorAll('#overlayMenu .nav-list a');
    const body = document.body; // อ้างอิงถึง body element

    console.log('DOM Content Loaded. Initializing scripts.');

    if (hamburgerMenu && overlayMenu && closeMenuBtn) {
        console.log('Hamburger menu elements found. Attaching event listeners.');

        hamburgerMenu.addEventListener('click', (event) => {
            event.stopPropagation(); // ป้องกัน event propagation ที่อาจทำให้เกิดปัญหา
            console.log('Hamburger menu clicked! Opening overlay.');
            overlayMenu.classList.add('open'); // เพิ่ม class 'open' เพื่อเปิดเมนู
            body.classList.add('no-scroll'); // เพิ่ม class เพื่อป้องกัน scroll ของ body
        });

        closeMenuBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // ป้องกัน event propagation
            console.log('Close button clicked! Closing overlay.');
            overlayMenu.classList.remove('open'); // ลบ class 'open' เพื่อปิดเมนู
            body.classList.remove('no-scroll'); // ลบ class เพื่ออนุญาตให้ body scroll ได้
        });

        // ปิดเมนูเมื่อคลิกที่ลิงก์ในเมนู
        overlayNavLinks.forEach(link => {
            link.addEventListener('click', (event) => {
                event.stopPropagation(); // ป้องกัน event propagation
                console.log('Overlay link clicked:', link.href);
                overlayMenu.classList.remove('open');
                body.classList.remove('no-scroll');
            });
        });

        // ปิดเมนูเมื่อผู้ใช้คลิกที่พื้นหลัง (นอกเหนือจากเมนูจริง ๆ)
        overlayMenu.addEventListener('click', (event) => {
            // ตรวจสอบว่า target ที่ถูกคลิกคือ overlayMenu เอง หรือเป็น child ที่มี class 'overlay-menu'
            // และไม่ใช่ nav-container หรือ child ของ nav-container
            if (event.target === overlayMenu) {
                console.log('Clicked on overlay background, closing overlay.');
                overlayMenu.classList.remove('open');
                body.classList.remove('no-scroll');
            }
        });

    } else {
        console.error("Hamburger menu elements not found. Check HTML IDs or script loading sequence.");
        if (!hamburgerMenu) console.error("Element #hamburgerMenu not found.");
        if (!overlayMenu) console.error("Element #overlayMenu not found.");
        if (!closeMenuBtn) console.error("Element #closeMenu not found.");
    }

    // === Form Submission Logic ===
    const form = document.getElementById('registerForm');
    if (!form) {
        console.error("Form with ID 'registerForm' not found.");
    } else {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('name').value.trim();
            const building = document.getElementById('building').value.trim();
            const bed = document.getElementById('bed').value.trim();
            const admissionDate = document.getElementById('admissionDate').value;
            const Diagnosis = document.getElementById('Diagnosis').value.trim();
            const operation = document.getElementById('operation').value.trim();
            const operationDate = document.getElementById('operationDate').value;
            const goal = document.getElementById('goal').value.trim();

            // ตรวจสอบข้อมูลเบื้องต้น
            if (!name || !building || !admissionDate || !Diagnosis) {
                alert("กรุณากรอกข้อมูล Name, ตึก, วันที่รับเข้า, และการวินิจฉ0ัย");
                return;
            }

            try {
                await addDoc(collection(db, "patients"), {
                    name,
                    building,
                    bed,
                    admissionDate,
                    Diagnosis,
                    operation,
                    operationDate,
                    goal,
                    isActive: true, // Changed from patient_status: "Active" to isActive: true
                    timestamp: serverTimestamp()
                });

                alert("บันทึกข้อมูลสำเร็จ");
                form.reset();
            } catch (error) {
                console.error("Error adding document: ", error);
                alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + error.message);
            }
        });
    }


    // === Active Link Logic (ปรับให้เข้ากับ overlay menu) ===
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
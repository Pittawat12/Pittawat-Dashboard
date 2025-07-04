// script.js

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginMessage = document.getElementById('loginMessage');
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const overlayMenu = document.getElementById('overlayMenu');
    const closeMenuBtn = document.getElementById('closeMenu');
    const navLinks = document.querySelectorAll('.overlay-menu .nav-list a');

    // --- User Management ---
    // กำหนดผู้ใช้ตามที่ต้องการ (อัปเดตตามคำสั่งใหม่)
    const users = {
        'Si1111': '98765',
        'Si1112': '98765',
        'Si1113': '98765',
        'Si1114': '98765',
        'Si1115': '98765',
    };

    // --- ตรวจสอบสถานะ Login เมื่อโหลดหน้า (สำหรับ Refresh) ---
    // ถ้ามีการ Login อยู่แล้วใน sessionStorage ให้ Redirect ไปยัง dashboard.html ทันที
    // ยกเว้นกรณีที่อยู่บนหน้า index.html (หน้า Login) เอง
    if (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/')) {
        // Do nothing, let the login form show
    } else {
        // If not on the login page, check login status
        if (sessionStorage.getItem('isLoggedIn') === 'true') {
            enableMenuLinks(); // Enable menu if already logged in
        } else {
            // If not logged in and not on index.html, redirect to login page
            window.location.href = 'index.html';
            return; // Stop further execution on this page
        }
    }


    // --- Login Logic ---
    if (loginForm) { // ตรวจสอบว่า loginForm มีอยู่จริงในหน้านี้ (เพื่อป้องกัน error ถ้า script ถูกใช้ในหน้าอื่น)
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault(); // Prevent default form submission

            const enteredUsername = usernameInput.value.trim();
            const enteredPassword = passwordInput.value.trim();

            // ตรวจสอบ username และ password (ไม่คำนึงถึง case ของ username ในการตรวจสอบ)
            if (users[enteredUsername] && users[enteredUsername] === enteredPassword) {
                loginMessage.textContent = 'Login Successful! Redirecting...';
                loginMessage.classList.remove('error');
                loginMessage.classList.add('success');

                // Store login status in sessionStorage
                sessionStorage.setItem('isLoggedIn', 'true');

                // เมื่อเข้าสู่ระบบได้แล้ว จะลิงค์ไปหน้า dashboard.html
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 500); // หน่วงเวลาเล็กน้อยก่อน redirect เพื่อให้เห็นข้อความ

            } else {
                // ถ้ากรอกรหัสไม่ผ่าน จะไม่สามารถเข้าสู่ระบบได้
                loginMessage.textContent = 'Invalid Username or Password.';
                loginMessage.classList.remove('success');
                loginMessage.classList.add('error');
                sessionStorage.setItem('isLoggedIn', 'false'); // Ensure login status is false
                alert('Invalid Username or Password. Please try again.'); // แจ้งเตือนทันที
                usernameInput.value = ''; // รีเซ็ตค่า username
                passwordInput.value = ''; // รีเซ็ตค่า password
            }
        });
    }


    // --- Menu Control Logic ---
    hamburgerMenu.addEventListener('click', () => {
        const isLoggedIn = sessionStorage.getItem('isLoggedIn') === 'true';

        if (!isLoggedIn) {
            // ถ้ายังไม่เข้าสู่ระบบ แล้วไปกดเมนู3ขีด จะขึ้นว่าให้loginก่อน
            alert('Please login first to access the menu.');
        } else {
            // เมื่อเข้าสู่ระบบแล้วสามารถเข้ามากด3ขีดได้
            overlayMenu.classList.toggle('open');
            document.body.classList.toggle('no-scroll'); // Prevent body scroll when menu is open
        }
    });

    closeMenuBtn.addEventListener('click', () => {
        overlayMenu.classList.remove('open');
        document.body.classList.remove('no-scroll');
    });

    // Function to enable menu links
    function enableMenuLinks() {
        navLinks.forEach(link => {
            link.classList.remove('disabled'); // Remove visual disabled state
            link.style.pointerEvents = 'auto'; // Re-enable pointer events
            link.style.opacity = '1'; // Ensure full opacity
        });
    }

    // Function to disable menu links (default state)
    function disableMenuLinks() {
        navLinks.forEach(link => {
            link.style.pointerEvents = 'none'; // Disable click events
            link.style.opacity = '0.6'; // Grey out visually
            link.classList.add('disabled'); // Add a class for specific styling if needed
        });
    }

    // Initial check on page load for menu links: disable links if not logged in
    // This part ensures that if you are on the login page, the menu links are disabled by default
    // until a successful login.
    if (sessionStorage.getItem('isLoggedIn') !== 'true') {
        disableMenuLinks();
    } else {
        enableMenuLinks();
    }

    // Add click event listener to all nav links in overlay menu
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // This check is redundant if disableMenuLinks is working, but acts as a safeguard.
            if (sessionStorage.getItem('isLoggedIn') !== 'true') {
                e.preventDefault(); // Prevent navigation if not logged in
            }
        });
    });
});
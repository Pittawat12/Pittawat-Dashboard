// dashboard.js

import { db } from './firebase.js'; // Assuming you have a firebase.js for database initialization
import { collection, getDocs, query, where, Timestamp } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded. Initializing scripts for dashboard.html.');

    // === Hamburger Menu Functionality (Copied from process.js/distribution.js) ===
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const overlayMenu = document.getElementById('overlayMenu');
    const closeMenuBtn = document.getElementById('closeMenu');
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

        // Close menu when clicking outside the nav-container but inside the overlay
        overlayMenu.addEventListener('click', (event) => {
            if (event.target === overlayMenu) {
                overlayMenu.classList.remove('open');
                body.classList.remove('no-scroll');
            }
        });

        // Close menu when a navigation link is clicked
        document.querySelectorAll('.overlay-menu .nav-list a').forEach(link => {
            link.addEventListener('click', (event) => {
                // event.stopPropagation(); // Might not be needed here if click on link
                overlayMenu.classList.remove('open');
                body.classList.remove('no-scroll');
            });
        });
    }

    // === Active Link Logic (Copied from process.js/distribution.js) ===
    const activeNavLinks = document.querySelectorAll('.overlay-menu .nav-list a');
    const currentPath = window.location.pathname.split('/').pop();
    activeNavLinks.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        } else if (currentPath === '' && link.getAttribute('href') === 'index.html') {
            // Special case for root path pointing to index.html
            link.classList.add('active');
        }
    });

    // === Dashboard Data Loading (Placeholder) ===
    // You'll need to implement the actual data fetching and display logic here
    const totalPatientsElem = document.getElementById('totalPatients');
    const dischargedTodayElem = document.getElementById('dischargedToday');
    const dischargedTomorrowElem = document.getElementById('dischargedTomorrow');
    const pendingRegistrationElem = document.getElementById('pendingRegistration');

    async function loadDashboardData() {
        try {
            // Fetch total patients (assuming 'patients' collection)
            const patientsSnapshot = await getDocs(collection(db, 'patients'));
            totalPatientsElem.textContent = patientsSnapshot.size;

            // Fetch discharged today/tomorrow (assuming 'data' collection with 'dischargeOption' and 'timestamp')
            const dataCollection = collection(db, 'data');
            
            // Get today's date (start and end of day)
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Start of today
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1); // Start of tomorrow
            const dayAfterTomorrow = new Date(today);
            dayAfterTomorrow.setDate(today.getDate() + 2); // Start of day after tomorrow

            const dischargedTodayQuery = query(
                dataCollection,
                where('dischargeOption', '==', 'today'),
                where('timestamp', '>=', Timestamp.fromDate(today)),
                where('timestamp', '<', Timestamp.fromDate(tomorrow))
            );
            const dischargedTodaySnapshot = await getDocs(dischargedTodayQuery);
            dischargedTodayElem.textContent = dischargedTodaySnapshot.size;

            const dischargedTomorrowQuery = query(
                dataCollection,
                where('dischargeOption', '==', 'tomorrow'),
                where('timestamp', '>=', Timestamp.fromDate(tomorrow)),
                where('timestamp', '<', Timestamp.fromDate(dayAfterTomorrow))
            );
            const dischargedTomorrowSnapshot = await getDocs(dischargedTomorrowQuery);
            dischargedTomorrowElem.textContent = dischargedTomorrowSnapshot.size;

            // Fetch pending registrations (example: from 'register_process_statuses' where status is 'pending')
            const pendingRegistrationQuery = query(
                collection(db, 'register_process_statuses'),
                where('status', '==', 'pending') // Adjust based on your actual status field
            );
            const pendingRegistrationSnapshot = await getDocs(pendingRegistrationQuery);
            pendingRegistrationElem.textContent = pendingRegistrationSnapshot.size;

        } catch (error) {
            console.error("Error loading dashboard data:", error);
            totalPatientsElem.textContent = 'N/A';
            dischargedTodayElem.textContent = 'N/A';
            dischargedTomorrowElem.textContent = 'N/A';
            pendingRegistrationElem.textContent = 'N/A';
        }
    }

    // Call the function to load data when the page loads
    await loadDashboardData();
});
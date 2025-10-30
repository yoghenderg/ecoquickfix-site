import { app } from "./firebase-config.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

// Helper: Capitalize the first letter of a string
function capitalizeFirst(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}
const db = getFirestore(app);
// App State
let currentUser = null;
let orders = JSON.parse(localStorage.getItem('handyfix_orders') || '[]');
// Ensure resident fields start empty (in no-login mode some browsers may keep autofill)
window.addEventListener('DOMContentLoaded', () => {
  const n = document.getElementById('residentName');
  const p = document.getElementById('residentPhone');
  if (n && n.value.trim() === '') n.value = '';
  if (p && p.value.trim() === '') p.value = '';
});
const ORDERS_PAGE_SIZE = 4;  // change page size here
let ordersCurrentPage = 1;

function sortOrdersChronologically(list){
  // Status priority: pending (0) → ongoing (1) → completed (2)
  const statusPriority = { pending: 0, ongoing: 1, completed: 2 };
  return list.slice().sort((a, b) => {
    const pa = statusPriority[a.status] ?? 99;
    const pb = statusPriority[b.status] ?? 99;
    if (pa !== pb) return pa - pb;

    // same status: compare by date/time
    const aDT = new Date(`${a.date} ${a.time}`);
    const bDT = new Date(`${b.date} ${b.time}`);

    // For completed, sort DESC (latest first). Others ASC (earliest first).
    if (a.status === 'completed' && b.status === 'completed') {
      return bDT - aDT; // latest completed first
    }
    return aDT - bDT; // earliest first for pending/ongoing
  });
}
let currentBooking = {};

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const loginForm = document.getElementById('loginForm');
const bookingForm = document.getElementById('bookingForm');
const homeTab = document.getElementById('homeTab');
const ordersTab = document.getElementById('ordersTab');
const homePage = document.getElementById('homePage');
const ordersPage = document.getElementById('ordersPage');
const logoutBtn = document.getElementById('logoutBtn');
/* === No-login mode: show app, hide login === */
if (mainApp) mainApp.classList.remove('hidden');
if (loginScreen) loginScreen.classList.add('hidden');

// Set minimum date to today (only if such an input exists)
const dateInput = document.getElementById('appointmentDate');
if (dateInput) {
  dateInput.min = new Date().toISOString().split('T')[0];
}

// Login functionality
if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value.trim();

      if (email === 'test@gmail.com' && password === 'ecoworld') {
          currentUser = email;
          if (loginScreen) loginScreen.classList.add('hidden');
          if (mainApp) mainApp.classList.remove('hidden');
          if (typeof showHome === 'function') showHome();
      } else {
          alert('Invalid credentials. Please use test@gmail.com and password: ecoworld');
      }
  });
}


// Navigation
if (homeTab) homeTab.addEventListener('click', showHome);
if (ordersTab && !ordersTab.classList.contains('hidden')) {
    ordersTab.addEventListener('click', showOrders);
  }
if (logoutBtn) logoutBtn.addEventListener('click', logout);

function showHome() {
    if (!homePage || !ordersPage) return;
    homePage.classList.remove('hidden');
    ordersPage.classList.add('hidden');
    if (homeTab) homeTab.classList.add('active');
    if (ordersTab) ordersTab.classList.remove('active');
    updateNavStyles();
}

function showOrders() {
    if (!homePage || !ordersPage) return;
    homePage.classList.add('hidden');
    ordersPage.classList.remove('hidden');
    if (homeTab) homeTab.classList.remove('active');
    if (ordersTab) ordersTab.classList.add('active');
    updateNavStyles();
    displayOrders();
}

function updateNavStyles() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    // If this tab is hidden, do not touch its classes (prevents un-hiding)
    if (tab.classList.contains('hidden')) return;

    // Reset only the color-related classes, keep everything else (rounded, spacing, etc.)
    tab.classList.remove('bg-primary', 'text-white', 'text-gray-600', 'hover:text-gray-900', 'hover:bg-gray-100');

    if (tab.classList.contains('active')) {
      tab.classList.add('bg-primary', 'text-white');
    } else {
      tab.classList.add('text-gray-600', 'hover:text-gray-900', 'hover:bg-gray-100');
    }
  });
}

function logout() {
    currentUser = null;
    loginScreen.classList.remove('hidden');
    mainApp.classList.add('hidden');
    document.getElementById('loginForm').reset();
}

// Calendar functionality
let currentDate = new Date();
let selectedDateElement = null;

// Remove localStorage bookedSlots; Firestore is source of truth

// Helper to compare calendar dates (ignores time)
function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
}

// Format a Date as YYYY-MM-DD in local time (no UTC shift)
function formatDateLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function initCalendar() {
    updateCalendarDisplay();
    generateTimeSlots();
}

function updateCalendarDisplay() {
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    
    document.getElementById('currentMonth').textContent = 
        `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const calendarDays = document.getElementById('calendarDays');
    calendarDays.innerHTML = '';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < 42; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);

        const dayElement = document.createElement('div');
        dayElement.className = 'text-center py-3 cursor-pointer rounded-lg transition-colors calendar-day';
        dayElement.textContent = date.getDate();
        // tag with ISO date for selection logic
        dayElement.dataset.date = formatDateLocal(date);

        const isCurrentMonth = date.getMonth() === currentDate.getMonth();
        const isPast = date < today;
        const isToday = date.getTime() === today.getTime();

        if (!isCurrentMonth) {
            dayElement.className += ' text-gray-300';
        } else if (isPast) {
            dayElement.className += ' text-gray-400 cursor-not-allowed';
        } else {
            dayElement.className += ' text-gray-900';
            const handler = () => selectDate(date, dayElement);
            dayElement.addEventListener('click', handler);
            dayElement.addEventListener('touchend', handler);
        }

        // Add dataset flag for today and tint only today's cell
        if (isToday && isCurrentMonth) {
            dayElement.dataset.today = 'true';
            dayElement.classList.add('today');  // custom style for today's date
        } else {
            dayElement.dataset.today = 'false';
        }

        calendarDays.appendChild(dayElement);
    }
}

function selectDate(date, element) {
    // Keep a single soft tint on today's cell unless it is the one selected
    const todayCell = document.querySelector('#calendarDays [data-today="true"]');

    // Reset previous selection (remove our custom class)
    if (selectedDateElement) {
        selectedDateElement.classList.remove('selected');
    }

    // Apply selection to the new element
    selectedDateElement = element;
    selectedDateElement.classList.add('selected');

    // Keep a soft tint on today's cell unless it is selected
    if (todayCell) {
        if (selectedDateElement === todayCell) {
            todayCell.classList.remove('today');
        } else {
            todayCell.classList.add('today');
        }
    }

    // Persist value and refresh slots
    const localIso = formatDateLocal(date);
    document.getElementById('selectedDate').value = localIso;

    // Clear previously picked time when changing dates
    const timeInput = document.getElementById('selectedTime');
    if (timeInput) timeInput.value = '';

    if (/Mobi|Android/i.test(navigator.userAgent)) {
      // Mobile: delay to ensure UI refreshes immediately on first tap
      setTimeout(() => updateTimeSlots(localIso), 0);
    } else {
      // Desktop: normal immediate update
      updateTimeSlots(localIso);
    }
}

function generateTimeSlots() {
    const container = document.getElementById('timeSlots');
    container.innerHTML = "";

    const times = [];
    for (let hour = 8; hour <= 22; hour++) {
        const suffix = hour >= 12 ? "PM" : "AM";
        const displayHour = hour % 12 === 0 ? 12 : hour % 12;
        times.push(`${displayHour}:00 ${suffix}`);
    }

    container.innerHTML = times.map(time => `
      <button type="button" class="time-slot px-4 py-3 rounded-lg text-center font-medium transition-colors bg-white hover:bg-primary hover:text-white" data-time="${time}">
        ${time}
      </button>
    `).join('');

    container.querySelectorAll('.time-slot').forEach(slot => {
        slot.addEventListener('click', () => selectTimeSlot(slot));
    });

    // Populate mobile dropdown
    const timeSelect = document.getElementById('timeSelect');
    if (timeSelect) {
        // Remove all except the default option
        timeSelect.innerHTML = '<option value="" selected disabled>-- Select a time --</option>';
        times.forEach(time => {
            const opt = document.createElement('option');
            opt.value = time;
            opt.textContent = time;
            timeSelect.appendChild(opt);
        });
    }
}

// Update time slots based ONLY on Firestore bookings for the selected date
async function updateTimeSlots(selectedDate) {
    const slots = document.querySelectorAll('.time-slot');

    // Query Firestore for bookings on this date
    let bookedTimes = [];
    try {
        const bookingsRef = collection(db, "bookings");
        const q = query(bookingsRef, where("date", "==", selectedDate));
        const querySnapshot = await getDocs(q);
        bookedTimes = querySnapshot.docs.map(doc => doc.data().time);
    } catch (err) {
        console.error("Error fetching booked slots from Firestore:", err);
        bookedTimes = [];
    }

    // Parse selectedDate into a Date object (local time)
    const selectedDateObj = new Date(selectedDate);
    const now = new Date();
    // Helper: is selected date today?
    const isToday =
        selectedDateObj.getFullYear() === now.getFullYear() &&
        selectedDateObj.getMonth() === now.getMonth() &&
        selectedDateObj.getDate() === now.getDate();

    slots.forEach(slot => {
        const time = slot.dataset.time;
        const isBooked = bookedTimes.includes(time);

        // Start clean
        slot.classList.remove('disabled', 'selected');
        slot.removeAttribute('disabled');

        let isPast = false;
        if (isToday) {
            // Parse slot time string to Date for today
            // time format: "8:00 AM", "12:00 PM", etc.
            const [hmm, ampm] = time.split(' ');
            let [hour, minute] = hmm.split(':').map(Number);
            if (ampm === 'PM' && hour !== 12) hour += 12;
            if (ampm === 'AM' && hour === 12) hour = 0;
            const slotDateTime = new Date(selectedDateObj);
            slotDateTime.setHours(hour, minute, 0, 0);
            if (slotDateTime < now) {
                isPast = true;
            }
        }

        if (isBooked || isPast) {
            // Mark as booked/disabled (greyed)
            slot.classList.add('disabled');
            slot.setAttribute('disabled', '');
        } else {
            // Ensure enabled/base appearance
            slot.className = 'time-slot px-4 py-3 rounded-lg text-center font-medium transition-colors bg-white';
        }
    });

    // Mobile dropdown: update <option> disabled/greyed status
    const timeSelect = document.getElementById('timeSelect');
    if (timeSelect) {
        // For each <option> (skip the first placeholder)
        for (let i = 1; i < timeSelect.options.length; i++) {
            const opt = timeSelect.options[i];
            const time = opt.value;
            const isBooked = bookedTimes.includes(time);
            let isPast = false;
            if (isToday) {
                const [hmm, ampm] = time.split(' ');
                let [hour, minute] = hmm.split(':').map(Number);
                if (ampm === 'PM' && hour !== 12) hour += 12;
                if (ampm === 'AM' && hour === 12) hour = 0;
                const slotDateTime = new Date(selectedDateObj);
                slotDateTime.setHours(hour, minute, 0, 0);
                if (slotDateTime < now) {
                    isPast = true;
                }
            }
            if (isBooked || isPast) {
                opt.disabled = true;
                opt.classList.add("text-gray-400");
            } else {
                opt.disabled = false;
                opt.classList.remove("text-gray-400");
            }
        }
    }
}

function selectTimeSlot(element) {
    if (element.disabled) return;

    // Remove selection from all enabled slots
    document.querySelectorAll('.time-slot').forEach(slot => {
        slot.classList.remove('selected');
        // restore base visuals for enabled slots
        if (!slot.disabled) {
            slot.classList.remove('bg-primary', 'text-white', 'hover:text-white', 'hover:bg-primary');
            slot.classList.add('bg-white');
        }
    });

    // Apply selected style
    element.classList.add('selected');
    element.classList.remove('bg-white');
    element.classList.add('bg-primary','text-white');

    document.getElementById('selectedTime').value = element.dataset.time;
    // Sync mobile dropdown if present
    const timeSelect = document.getElementById('timeSelect');
    if (timeSelect && timeSelect.value !== element.dataset.time) {
        timeSelect.value = element.dataset.time;
    }
}

// Listen for mobile dropdown changes and sync with time slot selection and hidden field
const timeSelectDropdown = document.getElementById('timeSelect');
if (timeSelectDropdown) {
    timeSelectDropdown.addEventListener('change', function(e) {
        const val = e.target.value;
        // Set hidden input value
        const hiddenTime = document.getElementById('selectedTime');
        if (hiddenTime) hiddenTime.value = val;
        // Sync grid selection if visible
        document.querySelectorAll('.time-slot').forEach(slot => {
            if (slot.dataset.time === val && !slot.disabled) {
                selectTimeSlot(slot);
            }
        });
    });
}

const prevMonthBtn = document.getElementById('prevMonth');
if (prevMonthBtn) prevMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    updateCalendarDisplay();
});

const nextMonthBtn = document.getElementById('nextMonth');
if (nextMonthBtn) nextMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    updateCalendarDisplay();
});

// Service selection (multiple, cards and mobile dropdown)
const serviceOptions = document.querySelectorAll('.service-option');
let selectedServices = [];

function updateSelectedServicesInput() {
  document.getElementById("selectedServices").value = JSON.stringify(selectedServices);
}

function highlightSelectedCards() {
  document.querySelectorAll(".service-option").forEach(opt => {
    opt.classList.toggle("selected", selectedServices.includes(opt.dataset.service));
  });
}

function setMobileCheckboxes() {
  const checkboxes = document.querySelectorAll('#mobileServiceDropdown .service-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = selectedServices.includes(cb.value);
  });
}

function setMobileDropdownBtnText() {
  const btnText = document.getElementById('mobileServiceDropdownBtnText');
  if (!btnText) return;
  if (selectedServices.length === 0) {
    btnText.textContent = "Select services";
  } else {
    btnText.textContent = `${selectedServices.length} service${selectedServices.length > 1 ? 's' : ''} selected`;
  }
}

function toggleService(serviceName) {
  if (selectedServices.includes(serviceName)) {
    selectedServices = selectedServices.filter(s => s !== serviceName);
  } else {
    selectedServices.push(serviceName);
  }
  updateSelectedServicesInput();
  highlightSelectedCards();
  setMobileCheckboxes();
  setMobileDropdownBtnText();
}

// Card clicks
if (serviceOptions && serviceOptions.length) {
  serviceOptions.forEach(option => {
    option.addEventListener('click', () => {
      toggleService(option.dataset.service);
    });
  });
}

// Mobile dropdown logic
const mobileDropdownBtn = document.getElementById('mobileServiceDropdownBtn');
const mobileDropdown = document.getElementById('mobileServiceDropdown');
if (mobileDropdownBtn && mobileDropdown) {
  // Toggle dropdown open/close
  mobileDropdownBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (mobileDropdown.classList.contains('hidden')) {
      mobileDropdown.classList.remove('hidden');
    } else {
      mobileDropdown.classList.add('hidden');
    }
  });
  // Service checkbox logic
  mobileDropdown.querySelectorAll('.service-checkbox').forEach(cb => {
    cb.addEventListener('change', function(e) {
      const val = e.target.value;
      if (e.target.checked) {
        if (!selectedServices.includes(val)) selectedServices.push(val);
      } else {
        selectedServices = selectedServices.filter(s => s !== val);
      }
      updateSelectedServicesInput();
      highlightSelectedCards();
      setMobileDropdownBtnText();
    });
  });
  // Close dropdown when clicking outside
  document.addEventListener('click', function(event) {
    if (!mobileDropdown.contains(event.target) && !mobileDropdownBtn.contains(event.target)) {
      mobileDropdown.classList.add('hidden');
    }
  });
}

// Keep dropdown button text updated on load
setMobileDropdownBtnText();

// Booking form submission
if (bookingForm) {
    bookingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name  = document.getElementById('residentName').value.trim();
        const phone = document.getElementById('residentPhone').value.trim();
        // Basic validations
        if (!name || name.length < 2) { 
          alert('Please enter your full name (at least 2 characters).'); 
          return; 
        }
        // allow digits, spaces, +, -, parentheses; 7–15 chars once non-digits are removed
        const digitsOnly = phone.replace(/\D/g, '');
        const phoneLooksOk = /^[0-9+\-\s()]{7,}$/.test(phone) && digitsOnly.length >= 7 && digitsOnly.length <= 15;
        if (!phoneLooksOk) { 
          alert('Please enter a valid phone number (digits, +, spaces allowed).'); 
          return; 
        }
        const services = JSON.parse(document.getElementById('selectedServices').value || "[]");
        const date = document.getElementById('selectedDate').value;
        const time = document.getElementById('selectedTime').value;
        const details = document.getElementById('additionalDetails').value;
        const address = document.getElementById('residentAddress').value.trim();
        if (!address) { alert('Please enter your address.'); return; }

        if (!services.length) { alert("Please select at least one service type"); return; }
        if (!date) { alert('Please select a date'); return; }
        if (!time) { alert('Please select a time slot'); return; }

        currentBooking = { 
          name: capitalizeFirst(name), 
          phone, 
          services: services.map(capitalizeFirst),
          date, 
          time, 
          details: capitalizeFirst(details), 
          address: capitalizeFirst(address) 
        };
      showBookingSummary();
  });
}

function showBookingSummary() {
    document.getElementById('summaryName').textContent  = currentBooking.name;
    document.getElementById('summaryPhone').textContent = currentBooking.phone;
    document.getElementById('summaryAddress').textContent = currentBooking.address;
    document.getElementById('summaryService').textContent = currentBooking.services.join(", ");
    document.getElementById('summaryDate').textContent = new Date(currentBooking.date).toLocaleDateString();
    document.getElementById('summaryTime').textContent = currentBooking.time;
    document.getElementById('summaryDetails').textContent = currentBooking.details || 'No additional details provided';
    document.getElementById('summaryModal').classList.remove('hidden');
}

// Summary modal actions
const cancelBookingBtn = document.getElementById('cancelBooking');
if (cancelBookingBtn) cancelBookingBtn.addEventListener('click', () => {
    document.getElementById('summaryModal').classList.add('hidden');
});

const confirmBookingBtn = document.getElementById('confirmBooking');
if (confirmBookingBtn) confirmBookingBtn.addEventListener('click', async () => {
    const order = {
        id: Date.now(),
        name: capitalizeFirst(currentBooking.name),
        phone: currentBooking.phone,
        services: currentBooking.services,
        date: currentBooking.date,
        time: currentBooking.time,
        details: capitalizeFirst(currentBooking.details),
        address: capitalizeFirst(currentBooking.address),
        status: 'pending',
        createdAt: new Date().toISOString()
    };

    // Firestore: check for existing booking in this slot
    try {
      const bookingsRef = collection(db, "bookings");
      const q = query(
        bookingsRef,
        where("date", "==", currentBooking.date),
        where("time", "==", currentBooking.time)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        alert("This slot is already booked, please pick another.");
        return;
      }
      // Save full booking details to bookings
      await addDoc(collection(db, "bookings"), {
        name: capitalizeFirst(currentBooking.name),
        phone: currentBooking.phone,
        services: currentBooking.services,
        date: formatDateLocal(new Date(currentBooking.date)),
        time: currentBooking.time,
        address: capitalizeFirst(currentBooking.address),
        remarks: capitalizeFirst(currentBooking.details) || "-",
        status: "pending",
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("❌ Firestore save failed", err);
    }

    // Save order ONLY to localStorage (not Firestore "bookings")
    orders.push(order);
    localStorage.setItem('handyfix_orders', JSON.stringify(orders));

    document.getElementById('summaryModal').classList.add('hidden');
    document.getElementById('successModal').classList.remove('hidden');

    // Reset form
    bookingForm.reset();
    // Explicitly clear resident fields (defensive)
    const nameEl = document.getElementById('residentName');
    const phoneEl = document.getElementById('residentPhone');
    if (nameEl) nameEl.value = '';
    if (phoneEl) phoneEl.value = '';
    document.querySelectorAll('.service-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    selectedServices = [];
    document.getElementById('selectedServices').value = '';

    // Reset calendar and time slots (re-render to restore today's tint)
    selectedDateElement = null;
    document.getElementById('selectedDate').value = '';
    document.getElementById('selectedTime').value = '';
    updateCalendarDisplay();
    generateTimeSlots();
});

const closeSuccessModalBtn = document.getElementById('closeSuccessModal');
if (closeSuccessModalBtn) closeSuccessModalBtn.addEventListener('click', () => {
    document.getElementById('successModal').classList.add('hidden');
});

// WhatsApp "Continue" button handler - redirect with booking details
// Use the correct button id if your "Continue" button is different
const continueBtn = document.getElementById("closeSuccessModal");
if (continueBtn) continueBtn.addEventListener("click", () => {
    const adminPhone = "60164201395"; // replace with your admin number without +

    const bookingDetails = `
  *This is your appointment details:*
    -------------------------
    *Name:*    ${currentBooking.name}
    *Phone:*   ${currentBooking.phone}
    *Services:* ${currentBooking.services.join(", ")}
    *Date:*    ${currentBooking.date}
    *Time:*    ${currentBooking.time}
    *Address:* ${currentBooking.address}
    *Remarks:* ${currentBooking.details || "-"}
    *Status:* Pending

  Our PIC will attend to you shortly. Replies may take a little time, thank you for your patience.
    `;

    const encodedMessage = encodeURIComponent(bookingDetails);
    window.open(`https://wa.me/${adminPhone}?text=${encodedMessage}`, "_blank");
});

// Display orders
function displayOrders() {
    const ordersListEl = document.getElementById('ordersList');
    const noOrdersEl   = document.getElementById('noOrders');
    const prevBtn      = document.getElementById('ordersPrev');
    const nextBtn      = document.getElementById('ordersNext');
    const pageInfo     = document.getElementById('ordersPageInfo');
  
    const sorted = sortOrdersChronologically(orders);
    const total  = sorted.length;
  
    if (total === 0) {
      ordersListEl.innerHTML = '';
      noOrdersEl.classList.remove('hidden');
      if (pageInfo) pageInfo.textContent = '';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }
    noOrdersEl.classList.add('hidden');
  
    const totalPages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
    if (ordersCurrentPage > totalPages) ordersCurrentPage = totalPages;
    if (ordersCurrentPage < 1) ordersCurrentPage = 1;
  
    const start = (ordersCurrentPage - 1) * ORDERS_PAGE_SIZE;
    const pageItems = sorted.slice(start, start + ORDERS_PAGE_SIZE);
  
    // render cards (unchanged design)
    ordersListEl.innerHTML = pageItems.map(order => {
      const statusColors = {
        pending:   'bg-yellow-50 text-yellow-700 border border-yellow-200',
        ongoing:   'bg-blue-50 text-blue-700 border border-blue-200',
        completed: 'bg-green-50 text-green-700 border border-green-200'
      };
      const statusIcons = {
        pending:   '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
        ongoing:   '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>',
        completed: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
      };

      return `
        <div class="order-card glass rounded-15 border border-gray-200 p-6 cursor-pointer hover:border-primary hover:shadow-md transition-all professional-shadow"
             onclick="showOrderDetails(${order.id})">
          <div class="flex justify-between items-start mb-4">
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900 mb-1">${order.service}</h3>
              <div class="flex items-center text-gray-600 text-sm mb-2">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                </svg>
                ${new Date(order.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
              <div class="flex items-center text-gray-600 text-sm">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                ${order.time}
              </div>
            </div>
            <div class="flex flex-col items-end">
              <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[order.status]} mb-2">
                ${statusIcons[order.status]}
                <span class="ml-1">${order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span>
              </span>
              <span class="text-xs text-gray-500">Order #${order.id}</span>
            </div>
          </div>
          <div class="flex items-center justify-between pt-4 border-t border-gray-100">
            <span class="text-sm text-gray-500">Booked on ${new Date(order.createdAt).toLocaleDateString()}</span>
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </div>
        </div>
      `;
    }).join('');

    // Keep the list height constant: fill with invisible spacers up to 4 rows
    const shown = pageItems.length;
    if (shown < ORDERS_PAGE_SIZE) {
      const need = ORDERS_PAGE_SIZE - shown;
      const spacers = Array.from({ length: need }, () => '<div class="order-spacer"></div>').join('');
      ordersListEl.insertAdjacentHTML('beforeend', spacers);
    }
  
    // pager UI
    if (pageInfo) pageInfo.textContent = `Page ${ordersCurrentPage} of ${totalPages}`;
    if (prevBtn) {
      prevBtn.disabled = ordersCurrentPage <= 1;
      prevBtn.onclick = () => { ordersCurrentPage--; displayOrders(); };
    }
    if (nextBtn) {
      nextBtn.disabled = ordersCurrentPage >= totalPages;
      nextBtn.onclick = () => { ordersCurrentPage++; displayOrders(); };
    }
  }

// Show order details
function showOrderDetails(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  // Status colors and icons for badge
  const statusColors = {
    pending:   'bg-yellow-50 text-yellow-700 border border-yellow-200',
    ongoing:   'bg-blue-50 text-blue-700 border border-blue-200',
    completed: 'bg-green-50 text-green-700 border border-green-200'
  };
  const statusIcons = {
    pending:   '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
    ongoing:   '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>',
    completed: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
  };

  // Fill values into the new summary-style fields
  const el = (id) => document.getElementById(id);
  el('od-id').textContent      = `#${order.id}`;
  el('od-service').textContent = order.service;
  el('od-date').textContent    = new Date(order.date).toLocaleDateString();
  el('od-time').textContent    = order.time;
  el('od-booked').textContent  = new Date(order.createdAt).toLocaleDateString();
  const statusEl = el('od-status');
  statusEl.innerHTML = `
    <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[order.status]}">
      ${statusIcons[order.status]}
      <span class="ml-1">${order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span>
    </span>
  `;

  document.getElementById('orderModal').classList.remove('hidden');
}

const closeOrderModalBtn = document.getElementById('closeOrderModal');
if (closeOrderModalBtn) closeOrderModalBtn.addEventListener('click', () => {
    document.getElementById('orderModal').classList.add('hidden');
});

// Initialize nav styles and calendar
updateNavStyles();
if (document.getElementById('calendarDays')) {
  initCalendar();
  // Auto-select today's date and update time slots
  const todayIso = formatDateLocal(new Date());
  const selDateEl = document.getElementById('selectedDate');
  if (selDateEl) {
    selDateEl.value = todayIso;
    updateTimeSlots(todayIso);
  }
}

// Simulate order status changes for demo
setTimeout(() => {
    if (orders.length > 0) {
        orders.forEach((order, index) => {
            if (order.status === 'pending') {
                setTimeout(() => {
                    order.status = 'ongoing';
                    localStorage.setItem('handyfix_orders', JSON.stringify(orders));
                    if (document.getElementById('ordersPage').classList.contains('hidden') === false) {
                        displayOrders();
                    }
                }, (index + 1) * 10000); // 10 seconds delay per order
                
                setTimeout(() => {
                    order.status = 'completed';
                    localStorage.setItem('handyfix_orders', JSON.stringify(orders));
                    if (document.getElementById('ordersPage').classList.contains('hidden') === false) {
                        displayOrders();
                    }
                }, (index + 1) * 20000); // 20 seconds delay per order
            }
        });
    }
}, 1000);
// Restrict admin dashboard on mobile devices
if (window.innerWidth < 1024) {
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:20px;">
      <div>
        <h2>📱 Mobile Access Restricted</h2>
        <p>The admin dashboard is not available on mobile devices.<br>
        Please access it from a desktop or laptop.</p>
      </div>
    </div>
  `;
}
// Export Bookings CSV button handler
const bookingExportBtn = document.getElementById("bookingExport");
if (bookingExportBtn) {
  bookingExportBtn.addEventListener("click", async () => {
    // Use allBookingsArr if loaded, else fetch from Firestore
    let bookings = [];
    if (allBookingsArr && allBookingsArr.length > 0) {
      bookings = allBookingsArr;
    } else {
      const querySnapshot = await getDocs(collection(db, "bookings"));
      querySnapshot.forEach((docSnap) => {
        bookings.push({
          id: docSnap.id,
          data: docSnap.data()
        });
      });
      sortBookingsArr(bookings);
    }
    // CSV headers
    let csv = "Customer,Appointment Date,Appointment Time,Booked On,Services,Address,Status\n";
    bookings.forEach(({ data: booking }) => {
      // Customer
      const customer = `"${(booking.name || "-").replace(/"/g, '""')}"`;
      // Appointment Date and Time
      const apptDate = booking.date || "-";
      const apptTime = booking.time || "-";
      // Booked On
      let bookedOn = "-";
      if (booking.createdAt?.toDate) {
        bookedOn = booking.createdAt.toDate().toLocaleDateString("en-US", { dateStyle: "medium" });
      }
      // Services
      let services = "-";
      if (Array.isArray(booking.services)) {
        services = booking.services.join("; ");
      } else if (booking.service) {
        services = booking.service;
      }
      services = `"${services.replace(/"/g, '""')}"`;
      // Address
      const address = `"${(booking.address || "-").replace(/"/g, '""')}"`;
      // Status
      const status = (booking.status || "pending");
      // Row
      csv += [
        customer,
        apptDate,
        apptTime,
        `"${bookedOn}"`,
        services,
        address,
        status
      ].join(",") + "\n";
    });
    // Download CSV
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "bookings-export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}
import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, collection, getDocs, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";


const auth = getAuth(app);
const db = getFirestore(app);

// Map each service to a fixed color for consistent UI
const serviceColors = {
  "Electrical": "#9966FF",                        // Purple
  "Plumbing": "#36A2EB",                          // Blue
  "Carpentry": "#FF6384",                         // Pink/Red
  "Painting & minor wall repairs": "#FFB347",     // Orange
  "Air-cond servicing & maintenance": "#4BC0C0",  // Teal
  "Gardening & minor landscaping": "#8BC34A",     // Green
  "Home Cleaning & Sanitising": "#BDBDBD",        // Gray
  "Moving & Small Transport Jobs": "#FF9800",     // Amber
  "Roof Leaking": "#E53935",                      // Red (distinct for leaks)
  "Others": "#9E9E9E"                             // Neutral gray for misc
};

// Helper to parse date and time strings (including "HH:MM AM/PM") into a Date object (local time)
function parseDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  let t = (timeStr || "00:00").trim();
  // If time contains AM/PM, parse it
  let hour = 0, minute = 0;
  if (/am|pm/i.test(t)) {
    // 12-hour format
    let match = t.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
    if (match) {
      hour = parseInt(match[1], 10);
      minute = parseInt(match[2], 10);
      let ampm = match[3].toLowerCase();
      if (ampm === "pm" && hour !== 12) hour += 12;
      if (ampm === "am" && hour === 12) hour = 0;
    } else {
      // fallback: try to parse as is
      [hour, minute] = t.split(":").map(Number);
      hour = hour || 0;
      minute = minute || 0;
    }
  } else {
    // 24-hour format
    let parts = t.split(":");
    hour = parseInt(parts[0], 10) || 0;
    minute = parseInt(parts[1], 10) || 0;
  }
  // Compose ISO string for local time (YYYY-MM-DDTHH:MM)
  // Note: new Date(year, monthIdx, day, hour, minute) is local time
  let [y, m, d] = dateStr.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d), hour, minute);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    console.warn("⏳ No user detected yet, waiting before redirect...");
    // Wait briefly to allow Firebase to restore session
    setTimeout(() => {
      if (!auth.currentUser) {
        console.warn("⛔ Still no user after delay, redirecting...");
        window.location.href = "admin-login.html";
      }
    }, 1000);
    return;
  }

  try {
    let tokenResult = await user.getIdTokenResult(true);

    if (user.email === "admin@ecoquickfix.com") {
      loadBookings();
    } else if (tokenResult.claims.admin === true) {
      loadBookings();
    } else {
      console.error("⛔ Not admin, redirecting...");
      window.location.href = "admin-login.html";
    }
  } catch (err) {
    console.error("❌ Error checking admin claim:", err);
    window.location.href = "admin-login.html";
  }
});

// Logout button handler
const logoutBtn = document.getElementById("adminLogout");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "admin-login.html";
  });
}

// Tab switching logic
const dashboardTab = document.getElementById("dashboardTab");
const bookingsTab = document.getElementById("bookingsTab");
const dashboardContent = document.getElementById("dashboardContent");
const bookingsContent = document.getElementById("bookingsContent");

if (dashboardTab && bookingsTab && dashboardContent && bookingsContent) {
  dashboardTab.addEventListener("click", () => {
    dashboardContent.classList.remove("hidden");
    bookingsContent.classList.add("hidden");

    dashboardTab.classList.add("active");
    bookingsTab.classList.remove("active");

    localStorage.setItem("lastTab", "dashboard");
  });

  bookingsTab.addEventListener("click", () => {
    bookingsContent.classList.remove("hidden");
    dashboardContent.classList.add("hidden");

    bookingsTab.classList.add("active");
    dashboardTab.classList.remove("active");

    localStorage.setItem("lastTab", "bookings");
  });
}

// Restore last active tab on reload
const lastTab = localStorage.getItem("lastTab");
if (lastTab === "bookings") {
  bookingsContent.classList.remove("hidden");
  dashboardContent.classList.add("hidden");

  bookingsTab.classList.add("active");
  dashboardTab.classList.remove("active");
} else {
  dashboardContent.classList.remove("hidden");
  bookingsContent.classList.add("hidden");

  dashboardTab.classList.add("active");
  bookingsTab.classList.remove("active");
}

// Update stats counters
async function updateStats() {
  const today = new Date().toISOString().split("T")[0];
  let todayCount = 0;
  let upcomingCount = 0;
  let completedCount = 0;
  let dueCount = 0;

  const now = new Date();
  const querySnapshot = await getDocs(collection(db, "bookings"));
  querySnapshot.forEach((docSnap) => {
    const booking = docSnap.data();
    if (booking.date === today && booking.status !== "completed" && booking.status !== "cancelled") {
      todayCount++;
    }
    if (booking.status === "completed") completedCount++;
    if (booking.date > today && booking.status !== "completed" && booking.status !== "cancelled") upcomingCount++;

    // Due logic: appointment is in the past and status is "pending"
    if (booking.status === "pending") {
      // Compose appointment datetime
      const appointmentDateTime = parseDateTime(booking.date, booking.time);
      if (appointmentDateTime && appointmentDateTime < now) {
        dueCount++;
      }
    }
  });

  document.getElementById("todayBookings").textContent = todayCount;
  document.getElementById("upcomingBookings").textContent = upcomingCount;
  document.getElementById("completedBookings").textContent = completedCount;
  const dueElem = document.getElementById("dueBookings");
  if (dueElem) {
    dueElem.textContent = dueCount;
    // Toggle .active/.inactive class on the Due card and reset styles
    const dueCard = document.getElementById("dueCard");
    if (dueCard) {
      if (dueCount > 0) {
        dueCard.classList.add("active");
        dueCard.classList.remove("inactive");
      } else {
        dueCard.classList.remove("active");
        dueCard.classList.add("inactive");
      }
    }
  }
}

let serviceChart;

async function renderServiceChart() {
  const servicesCount = {};
  const monthSelect = document.getElementById("serviceMonth");
  const selectedMonth = monthSelect ? monthSelect.value : null;

  const querySnapshot = await getDocs(collection(db, "bookings"));
  querySnapshot.forEach((docSnap) => {
    const booking = docSnap.data();
    if (!booking.date) return;
    const bookingMonth = booking.date.slice(0, 7); // "YYYY-MM"
    if (selectedMonth && bookingMonth !== selectedMonth) return;
    if (Array.isArray(booking.services)) {
      booking.services.forEach(s => {
        servicesCount[s] = (servicesCount[s] || 0) + 1;
      });
    } else if (booking.service) {
      servicesCount[booking.service] = (servicesCount[booking.service] || 0) + 1;
    }
  });

  const labels = Object.keys(servicesCount);
  const values = Object.values(servicesCount);
  const ctx = document.getElementById("serviceDonut").getContext("2d");

  if (serviceChart) {
    serviceChart.destroy();
  }

  serviceChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: labels.map(label => serviceColors[label] || "#999")
        }
      ]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  // Build legend (sorted by percentage descending)
  const legend = document.getElementById("serviceLegend");
  legend.innerHTML = "";
  // Build array of {label, value, color, percentage}
  const total = values.reduce((a, b) => a + b, 0);
  const legendArr = labels.map((label, i) => ({
    label,
    value: values[i],
    color: serviceChart.data.datasets[0].backgroundColor[i],
    percentage: ((values[i] / total) * 100)
  }));
  // Sort descending by value (percentage)
  legendArr.sort((a, b) => b.value - a.value);
  // Render legend
  legendArr.forEach(item => {
    const li = document.createElement("li");
    li.className = "flex items-center justify-between gap-2";
    li.innerHTML = `
      <span class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full" style="background:${item.color}"></span>
        ${item.label}
      </span>
      <span>${item.percentage.toFixed(1)}%</span>
    `;
    legend.appendChild(li);
  });
}

// Pagination variables for bookings
let allBookingsArr = [];
let currentBookingsPage = 1;
const BOOKINGS_PER_PAGE = 10;

// Helper to sort bookings array
function sortBookingsArr(bookingsArr) {
  // Use the global parseDateTime helper for consistent parsing
  bookingsArr.sort((a, b) => {
    const statusOrder = { pending: 0, completed: 1, cancelled: 2 };
    const sa = (a.data.status || "pending").toLowerCase();
    const sb = (b.data.status || "pending").toLowerCase();
    if (statusOrder[sa] !== statusOrder[sb]) {
      return statusOrder[sa] - statusOrder[sb];
    }
    // For pending and completed: sort by appointment datetime (earliest first)
    if (sa === "pending" || sa === "completed") {
      const da = parseDateTime(a.data.date, a.data.time);
      const db = parseDateTime(b.data.date, b.data.time);
      if (da && db && da.getTime() !== db.getTime()) {
        return da.getTime() - db.getTime(); // earliest appointment first
      }
      const ca = a.data.createdAt?.toDate ? a.data.createdAt.toDate() : null;
      const cb = b.data.createdAt?.toDate ? b.data.createdAt.toDate() : null;
      if (ca && cb && ca.getTime() !== cb.getTime()) {
        return ca - cb;
      }
      return 0;
    }
    // For cancelled: sort by actionDate descending, then by createdAt descending
    if (sa === "cancelled") {
      const adA = a.data.actionDate || "";
      const adB = b.data.actionDate || "";
      if (adA !== adB) {
        return adB.localeCompare(adA);
      }
      const ca = a.data.createdAt?.toDate ? a.data.createdAt.toDate() : null;
      const cb = b.data.createdAt?.toDate ? b.data.createdAt.toDate() : null;
      if (ca && cb && cb.getTime() !== ca.getTime()) {
        return cb - ca;
      }
      return 0;
    }
    return 0;
  });
}

function renderPage(page) {
  const tbody = document.getElementById("bookingsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  // Calculate slice
  const total = allBookingsArr.length;
  const startIdx = (page - 1) * BOOKINGS_PER_PAGE;
  const endIdx = Math.min(startIdx + BOOKINGS_PER_PAGE, total);
  const pageArr = allBookingsArr.slice(startIdx, endIdx);

  pageArr.forEach(({ id, data: booking }) => {
    const row = document.createElement("tr");
    row.innerHTML = `
    <td class="px-6 py-3 text-center">${booking.name || "-"}</td>
    <td class="px-6 py-3 text-center">
      <div>
        <span class="font-medium">${booking.date || "-"}</span>
        <span class="text-sm text-gray-500 ml-2">${booking.time || "-"}</span>
      </div>
    </td>
    <td class="px-6 py-3 text-center">${
      booking.createdAt?.toDate
        ? booking.createdAt.toDate().toLocaleDateString("en-US", { dateStyle: "medium" })
        : "-"
    }</td>
    <td class="px-6 py-3 text-center">
      ${
        Array.isArray(booking.services)
          ? booking.services.map((s) => {
              const color = serviceColors[s] || "#999";
              return `<span class="px-2 py-1 rounded-full text-white text-xs mr-1" style="background:${color}">${s}</span>`;
            }).join("")
          : (booking.service || "-")
      }
    </td>
    <td class="px-6 py-3 text-center truncate max-w-[150px]">${booking.address || "-"}</td>
    <td class="px-6 py-3 text-center">
      <div class="flex gap-2 justify-center">
        <button class="action-btn action-complete markComplete">Complete</button>
        <button class="action-btn action-cancel markCancel">Cancel</button>
      </div>
    </td>
    <td class="px-6 py-3 text-center capitalize status-cell">
      ${
        booking.status === "completed"
          ? `<span class="status-pill status-completed">Completed</span>`
          : booking.status === "cancelled"
          ? `<span class="status-pill status-cancelled">Cancelled</span>`
          : `<span class="status-pill status-pending">Pending</span>`
      }
    </td>
  `;
    // Add overdue pending logic
    const appointmentDateTime = parseDateTime(booking.date, booking.time);
    if (booking.status === "pending" && appointmentDateTime && appointmentDateTime < new Date()) {
      const customerCell = row.cells[0];
      if (customerCell) {
        customerCell.insertAdjacentHTML("beforeend", '<span class="due-tag">Due</span>');
      }
    }
    // Complete button: also save actionDate, with early completion modal
    row.querySelector(".markComplete").addEventListener("click", async () => {
      const now = new Date();
      const appointment = parseDateTime(booking.date, booking.time);
      if (appointment && now < appointment) {
        const modal = document.getElementById("earlyCompleteModal");
        modal.classList.remove("hidden");
        document.getElementById("confirmEarlyComplete").onclick = async () => {
          const today = new Date().toISOString().split("T")[0];
          await updateDoc(doc(db, "bookings", id), { status: "completed", actionDate: today });
          booking.status = "completed";
          booking.actionDate = today;
          modal.classList.add("hidden");
          loadBookings();
        };
        document.getElementById("cancelEarlyComplete").onclick = () => {
          modal.classList.add("hidden");
        };
      } else {
        const today = new Date().toISOString().split("T")[0];
        await updateDoc(doc(db, "bookings", id), { status: "completed", actionDate: today });
        booking.status = "completed";
        booking.actionDate = today;
        loadBookings();
      }
    });
    // Cancel button: also save actionDate
    row.querySelector(".markCancel").addEventListener("click", async () => {
      const today = new Date().toISOString().split("T")[0];
      await updateDoc(doc(db, "bookings", id), { status: "cancelled", actionDate: today });
      booking.status = "cancelled";
      booking.actionDate = today;
      loadBookings();
    });
    // Adjust Actions column logic after row.innerHTML
    const today = new Date().toISOString().split("T")[0];
    if (booking.status === "completed" || booking.status === "cancelled") {
      if (booking.actionDate && booking.actionDate === today) {
        row.cells[5].innerHTML = `
          <div class="flex justify-center">
            <button class="bg-gray-200 text-gray-700 px-3 py-1 rounded-full flex items-center gap-1 undoAction">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h4l-4 4m0 0l4-4H3m0 4h9a5 5 0 100-10H9"/>
              </svg>
              Undo
            </button>
          </div>
        `;
        row.querySelector(".undoAction").addEventListener("click", async () => {
          await updateDoc(doc(db, "bookings", id), { status: "pending", actionDate: null });
          booking.status = "pending";
          booking.actionDate = null;
          loadBookings();
        });
      } else if (!booking.actionDate) {
        row.cells[5].innerHTML = `
          <div class="flex justify-center">
            <button class="bg-gray-200 text-gray-700 px-3 py-1 rounded-full flex items-center gap-1 undoAction">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h4l-4 4m0 0l4-4H3m0 4h9a5 5 0 100-10H9"/>
              </svg>
              Undo
            </button>
          </div>
        `;
        row.querySelector(".undoAction").addEventListener("click", async () => {
          await updateDoc(doc(db, "bookings", id), { status: "pending", actionDate: null });
          booking.status = "pending";
          booking.actionDate = null;
          loadBookings();
        });
      } else {
        row.cells[5].innerHTML = `
          <span class="status-pill status-locked">Locked</span>
        `;
      }
    }
    row.addEventListener("click", (e) => {
      if (
        (e.target.classList && (
          e.target.classList.contains("markComplete") ||
          e.target.classList.contains("markCancel") ||
          e.target.classList.contains("undoAction")
        ))
      ) {
        return;
      }
      const modal = document.getElementById("bookingModal");
      const content = document.getElementById("bookingDetailsContent");
      content.innerHTML = `
        <h2 class="text-xl font-bold mb-2">${booking.name}</h2>
        <p><strong>Services:</strong> ${
          Array.isArray(booking.services)
            ? booking.services.map((s) => {
                const color = serviceColors[s] || "#999";
                return `<span class="px-2 py-1 rounded-full text-white text-xs mr-1" style="background:${color}">${s}</span>`;
              }).join("")
            : (booking.service || "-")
        }</p>
        <p><strong>Date:</strong> ${booking.date} ${booking.time}</p>
        <p><strong>Booked On:</strong> ${
          booking.createdAt?.toDate
            ? booking.createdAt.toDate().toLocaleDateString("en-US", { dateStyle: "medium" })
            : "-"
        }</p>
        <p><strong>Address:</strong> ${booking.address || "-"}</p>
        <p><strong>Remarks:</strong> ${booking.remarks || "-"}</p>
        <p><strong>Status:</strong> ${
          booking.status === "completed"
            ? `<span class="status-pill status-completed">Completed</span>`
            : booking.status === "cancelled"
            ? `<span class="status-pill status-cancelled">Cancelled</span>`
            : `<span class="status-pill status-pending">Pending</span>`
        }</p>
      `;
      modal.classList.remove("hidden");
      const glassBox = modal.querySelector(".glass");
      if (glassBox) {
        glassBox.classList.remove("modal-close");
        glassBox.classList.add("modal-open");
      }
    });
    tbody.appendChild(row);
  });
  // Pagination controls
  renderPaginationControls(page, Math.ceil(allBookingsArr.length / BOOKINGS_PER_PAGE));
  // Filtering logic (apply after render)
  applyBookingsFilter();
}

function renderPaginationControls(page, totalPages) {
  let controlsDiv = document.getElementById("paginationControls");
  if (!controlsDiv) {
    // Insert after bookings table, inside glass container
    const bookingsTable = document.getElementById("bookingsTableBody");
    if (bookingsTable && bookingsTable.parentElement && bookingsTable.parentElement.parentElement) {
      // Find glass container
      let glassContainer = bookingsTable.parentElement.parentElement;
      controlsDiv = document.createElement("div");
      controlsDiv.id = "paginationControls";
      glassContainer.appendChild(controlsDiv);
    }
  }
  if (!controlsDiv) return;
  controlsDiv.innerHTML = "";
  if (totalPages <= 1) {
    controlsDiv.style.display = "none";
    return;
  }
  controlsDiv.style.display = "flex";
  controlsDiv.className = "pagination-controls"; // for CSS styling
  // Previous button
  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.textContent = "Previous";
  prevBtn.className = "pagination-btn";
  if (page === 1) prevBtn.disabled = true;
  prevBtn.addEventListener("click", () => {
    if (currentBookingsPage > 1) {
      currentBookingsPage--;
      renderPage(currentBookingsPage);
    }
  });
  controlsDiv.appendChild(prevBtn);
  // Page number buttons
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = i;
    btn.className = "pagination-btn" + (i === page ? " active" : "");
    if (i === page) btn.setAttribute("aria-current", "page");
    btn.addEventListener("click", () => {
      if (currentBookingsPage !== i) {
        currentBookingsPage = i;
        renderPage(currentBookingsPage);
      }
    });
    controlsDiv.appendChild(btn);
  }
  // Next button
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.textContent = "Next";
  nextBtn.className = "pagination-btn";
  if (page === totalPages) nextBtn.disabled = true;
  nextBtn.addEventListener("click", () => {
    if (currentBookingsPage < totalPages) {
      currentBookingsPage++;
      renderPage(currentBookingsPage);
    }
  });
  controlsDiv.appendChild(nextBtn);
}

function applyBookingsFilter() {
  const bookingSearch = document.getElementById("bookingSearch");
  const statusFilter = document.getElementById("bookingStatusFilter");
  const searchText = bookingSearch ? bookingSearch.value.toLowerCase() : "";
  const selectedStatus = statusFilter ? statusFilter.value : "";

  // Filter allBookingsArr instead of just visible rows
  let filteredArr = allBookingsArr.filter(({ data: booking }) => {
    const name = (booking.name || "").toLowerCase();
    const services = Array.isArray(booking.services)
      ? booking.services.join(" ").toLowerCase()
      : (booking.service || "").toLowerCase();
    const status = (booking.status || "pending").toLowerCase();
    const address = (booking.address || "").toLowerCase();
    const phone = (booking.phone || "").toLowerCase();
    const remarks = (booking.remarks || "").toLowerCase();

    const matchesSearch =
      name.includes(searchText) ||
      services.includes(searchText) ||
      address.includes(searchText) ||
      phone.includes(searchText) ||
      remarks.includes(searchText);
    const matchesStatus = selectedStatus === "" || status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  // Reset page if current page exceeds total pages
  const totalPages = Math.ceil(filteredArr.length / BOOKINGS_PER_PAGE) || 1;
  if (currentBookingsPage > totalPages) currentBookingsPage = 1;

  // Render using filtered array
  renderFilteredPage(filteredArr, currentBookingsPage);
}

// New helper function to render filtered data
function renderFilteredPage(filteredArr, page) {
  const tbody = document.getElementById("bookingsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const startIdx = (page - 1) * BOOKINGS_PER_PAGE;
  const endIdx = Math.min(startIdx + BOOKINGS_PER_PAGE, filteredArr.length);
  const pageArr = filteredArr.slice(startIdx, endIdx);

  pageArr.forEach(({ id, data: booking }) => {
    // reuse the row rendering logic from renderPage
    // Instead of duplicating, just call renderPageRow
    const row = buildBookingRow(id, booking);
    tbody.appendChild(row);
  });

  renderPaginationControls(page, Math.ceil(filteredArr.length / BOOKINGS_PER_PAGE));
}

// Extracted row builder from renderPage
function buildBookingRow(id, booking) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td class="px-6 py-3 text-center">${booking.name || "-"}</td>
    <td class="px-6 py-3 text-center">
      <div>
        <span class="font-medium">${booking.date || "-"}</span>
        <span class="text-sm text-gray-500 ml-2">${booking.time || "-"}</span>
      </div>
    </td>
    <td class="px-6 py-3 text-center">${
      booking.createdAt?.toDate
        ? booking.createdAt.toDate().toLocaleDateString("en-US", { dateStyle: "medium" })
        : "-"
    }</td>
    <td class="px-6 py-3 text-center">
      ${
        Array.isArray(booking.services)
          ? booking.services.map((s) => {
              const color = serviceColors[s] || "#999";
              return `<span class="px-2 py-1 rounded-full text-white text-xs mr-1" style="background:${color}">${s}</span>`;
            }).join("")
          : (booking.service || "-")
      }
    </td>
    <td class="px-6 py-3 text-center truncate max-w-[150px]">${booking.address || "-"}</td>
    <td class="px-6 py-3 text-center">
      <div class="flex gap-2 justify-center">
        <button class="action-btn action-complete markComplete">Complete</button>
        <button class="action-btn action-cancel markCancel">Cancel</button>
      </div>
    </td>
    <td class="px-6 py-3 text-center capitalize status-cell">
      ${
        booking.status === "completed"
          ? `<span class="status-pill status-completed">Completed</span>`
          : booking.status === "cancelled"
          ? `<span class="status-pill status-cancelled">Cancelled</span>`
          : `<span class="status-pill status-pending">Pending</span>`
      }
    </td>
  `;
  // Add overdue pending logic
  const appointmentDateTime = parseDateTime(booking.date, booking.time);
  if (booking.status === "pending" && appointmentDateTime && appointmentDateTime < new Date()) {
    const customerCell = row.cells[0];
    if (customerCell) {
      customerCell.insertAdjacentHTML("beforeend", '<span class="due-tag">Due</span>');
    }
  }
  // Complete button: also save actionDate, with early completion modal
  row.querySelector(".markComplete").addEventListener("click", async () => {
    const now = new Date();
    const appointment = parseDateTime(booking.date, booking.time);
    if (appointment && now < appointment) {
      const modal = document.getElementById("earlyCompleteModal");
      modal.classList.remove("hidden");
      document.getElementById("confirmEarlyComplete").onclick = async () => {
        const today = new Date().toISOString().split("T")[0];
        await updateDoc(doc(db, "bookings", id), { status: "completed", actionDate: today });
        booking.status = "completed";
        booking.actionDate = today;
        modal.classList.add("hidden");
        loadBookings();
      };
      document.getElementById("cancelEarlyComplete").onclick = () => {
        modal.classList.add("hidden");
      };
    } else {
      const today = new Date().toISOString().split("T")[0];
      await updateDoc(doc(db, "bookings", id), { status: "completed", actionDate: today });
      booking.status = "completed";
      booking.actionDate = today;
      loadBookings();
    }
  });
  // Cancel button: also save actionDate
  row.querySelector(".markCancel").addEventListener("click", async () => {
    const today = new Date().toISOString().split("T")[0];
    await updateDoc(doc(db, "bookings", id), { status: "cancelled", actionDate: today });
    booking.status = "cancelled";
    booking.actionDate = today;
    loadBookings();
  });
  // Adjust Actions column logic after row.innerHTML
  const today = new Date().toISOString().split("T")[0];
  if (booking.status === "completed" || booking.status === "cancelled") {
    if (booking.actionDate && booking.actionDate === today) {
      row.cells[5].innerHTML = `
        <div class="flex justify-center">
          <button class="bg-gray-200 text-gray-700 px-3 py-1 rounded-full flex items-center gap-1 undoAction">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h4l-4 4m0 0l4-4H3m0 4h9a5 5 0 100-10H9"/>
            </svg>
            Undo
          </button>
        </div>
      `;
      row.querySelector(".undoAction").addEventListener("click", async () => {
        await updateDoc(doc(db, "bookings", id), { status: "pending", actionDate: null });
        booking.status = "pending";
        booking.actionDate = null;
        loadBookings();
      });
    } else if (!booking.actionDate) {
      row.cells[5].innerHTML = `
        <div class="flex justify-center">
          <button class="bg-gray-200 text-gray-700 px-3 py-1 rounded-full flex items-center gap-1 undoAction">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h4l-4 4m0 0l4-4H3m0 4h9a5 5 0 100-10H9"/>
            </svg>
            Undo
          </button>
        </div>
      `;
      row.querySelector(".undoAction").addEventListener("click", async () => {
        await updateDoc(doc(db, "bookings", id), { status: "pending", actionDate: null });
        booking.status = "pending";
        booking.actionDate = null;
        loadBookings();
      });
    } else {
      row.cells[5].innerHTML = `
        <span class="status-pill status-locked">Locked</span>
      `;
    }
  }
  row.addEventListener("click", (e) => {
    if (
      (e.target.classList && (
        e.target.classList.contains("markComplete") ||
        e.target.classList.contains("markCancel") ||
        e.target.classList.contains("undoAction")
      ))
    ) {
      return;
    }
    const modal = document.getElementById("bookingModal");
    const content = document.getElementById("bookingDetailsContent");
    content.innerHTML = `
      <h2 class="text-xl font-bold mb-2">${booking.name}</h2>
      <p><strong>Services:</strong> ${
        Array.isArray(booking.services)
          ? booking.services.map((s) => {
              const color = serviceColors[s] || "#999";
              return `<span class="px-2 py-1 rounded-full text-white text-xs mr-1" style="background:${color}">${s}</span>`;
            }).join("")
          : (booking.service || "-")
      }</p>
      <p><strong>Date:</strong> ${booking.date} ${booking.time}</p>
      <p><strong>Booked On:</strong> ${
        booking.createdAt?.toDate
          ? booking.createdAt.toDate().toLocaleDateString("en-US", { dateStyle: "medium" })
          : "-"
      }</p>
      <p><strong>Address:</strong> ${booking.address || "-"}</p>
      <p><strong>Remarks:</strong> ${booking.remarks || "-"}</p>
      <p><strong>Status:</strong> ${
        booking.status === "completed"
          ? `<span class="status-pill status-completed">Completed</span>`
          : booking.status === "cancelled"
          ? `<span class="status-pill status-cancelled">Cancelled</span>`
          : `<span class="status-pill status-pending">Pending</span>`
      }</p>
    `;
    modal.classList.remove("hidden");
    const glassBox = modal.querySelector(".glass");
    if (glassBox) {
      glassBox.classList.remove("modal-close");
      glassBox.classList.add("modal-open");
    }
  });
  return row;
}

// Load bookings from Firestore with pagination and apply global filtering
async function loadBookings() {
  const tbody = document.getElementById("bookingsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  // Remove existing pagination controls if present (to avoid duplicates)
  const oldControls = document.getElementById("paginationControls");
  if (oldControls && oldControls.parentElement) oldControls.parentElement.removeChild(oldControls);

  const querySnapshot = await getDocs(collection(db, "bookings"));
  // Collect all bookings into an array of { id, data }
  const bookingsArr = [];
  querySnapshot.forEach((docSnap) => {
    bookingsArr.push({
      id: docSnap.id,
      data: docSnap.data()
    });
  });
  sortBookingsArr(bookingsArr);
  allBookingsArr = bookingsArr;
  currentBookingsPage = 1;
  applyBookingsFilter(); // Use the new filter & render logic
  updateStats();
  renderServiceChart();
  // Filtering logic
  const bookingSearch = document.getElementById("bookingSearch");
  const statusFilter = document.getElementById("bookingStatusFilter");
  if (bookingSearch) {
    bookingSearch.addEventListener("input", () => {
      applyBookingsFilter();
    });
  }
  if (statusFilter) {
    statusFilter.addEventListener("change", () => {
      applyBookingsFilter();
    });
  }
  // Clear Filters button
  const clearFiltersBtn = document.getElementById("bookingFilterClear");
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      if (bookingSearch) bookingSearch.value = "";
      if (statusFilter) statusFilter.value = "";
      applyBookingsFilter();
    });
  }
}

const bookingModal = document.getElementById("bookingModal");
if (bookingModal) {
  bookingModal.addEventListener("click", (e) => {
    if (e.target === bookingModal) {
      const glassBox = bookingModal.querySelector(".glass");
      if (glassBox) {
        glassBox.classList.remove("modal-open");
        glassBox.classList.add("modal-close");
        glassBox.addEventListener("animationend", () => {
          bookingModal.classList.add("hidden");
        }, { once: true });
      } else {
        bookingModal.classList.add("hidden");
      }
    }
  });
}
// Show current date in header
function showCurrentDate() {
  const dateEl = document.getElementById("currentDate");
  if (!dateEl) return;

  const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  const today = new Date().toLocaleDateString("en-US", options);
  dateEl.textContent = today;
}

// Run immediately
showCurrentDate();

// Animate dashboard cards on load
window.addEventListener("DOMContentLoaded", () => {
  const cards = document.querySelectorAll("#dashboardContent .glass");
  cards.forEach((card, i) => {
    card.style.opacity = "0";
    setTimeout(() => {
      card.classList.add("card-animate");
    }, i * 120); // stagger animation
  });
});

// Tilt effect for dashboard stat cards
const statCards = document.querySelectorAll("#dashboardContent .glass");
statCards.forEach(card => {
  card.classList.add("card-tilt");

  card.addEventListener("mousemove", (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Stronger tilt (±15° instead of ±5°)
    const rotateX = ((y - centerY) / centerY) * -15;
    const rotateY = ((x - centerX) / centerX) * 15;

    card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
    card.style.setProperty("--x", `${(x / rect.width) * 100}%`);
    card.style.setProperty("--y", `${(y / rect.height) * 100}%`);
  });

  card.addEventListener("mouseleave", () => {
    // Spring-back effect
    card.style.transition = "transform 0.5s cubic-bezier(0.25, 1.5, 0.5, 1)";
    card.style.transform = "rotateX(0deg) rotateY(0deg) scale(1)";

    // Remove transition after reset so hover feels snappy again
    setTimeout(() => {
      card.style.transition = "transform 0.15s ease";
    }, 500);
  });
});

// Refresh button handler
const refreshBtn = document.getElementById("serviceRefresh");
if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    renderServiceChart();
  });
}

// Export CSV button handler
const exportBtn = document.getElementById("serviceExport");
if (exportBtn) {
  exportBtn.addEventListener("click", async () => {
    const servicesCount = {};
    const querySnapshot = await getDocs(collection(db, "bookings"));
    querySnapshot.forEach((docSnap) => {
      const booking = docSnap.data();
      if (booking.service) {
        servicesCount[booking.service] = (servicesCount[booking.service] || 0) + 1;
      }
    });

    const labels = Object.keys(servicesCount);
    const values = Object.values(servicesCount);
    const total = values.reduce((a, b) => a + b, 0);

    let csvContent = "Service,Count,Percentage\n";
    labels.forEach((label, i) => {
      const percentage = ((values[i] / total) * 100).toFixed(2);
      csvContent += `${label},${values[i]},${percentage}%\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "services-report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// Populate serviceMonth dropdown
function populateMonths() {
  const select = document.getElementById("serviceMonth");
  if (!select) return;

  const now = new Date();
  select.innerHTML = "";

  const startYear = 2025;
  const startMonth = 8; // September (0-based index)

  let d = new Date(now.getFullYear(), now.getMonth(), 1);
  while (d.getFullYear() > startYear || (d.getFullYear() === startYear && d.getMonth() >= startMonth)) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
      option.selected = true;
    }
    select.appendChild(option);

    d.setMonth(d.getMonth() - 1);
  }
}

populateMonths();

// Populate status filter dropdown with only specified options
const statusFilter = document.getElementById("bookingStatusFilter");
if (statusFilter) {
  statusFilter.innerHTML = `
    <option value="">All Status</option>
    <option value="pending">Pending</option>
    <option value="completed">Completed</option>
    <option value="cancelled">Cancelled</option>
  `;
}
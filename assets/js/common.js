// Shared helpers
function parseDateTime(dateStr, timeStr){
    try {
      const d = new Date(dateStr);
      const [time, mer] = (timeStr || "00:00 AM").trim().split(" ");
      let [hh, mm] = time.split(":").map(Number);
      if (mer && mer.toUpperCase() === "PM" && hh !== 12) hh += 12;
      if (mer && mer.toUpperCase() === "AM" && hh === 12) hh = 0;
      d.setHours(hh || 0, mm || 0, 0, 0);
      return d;
    } catch {
      return new Date(dateStr);
    }
  }
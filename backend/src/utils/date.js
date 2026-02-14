function formatDateWithDay(dt) {
  const day = dt.getUTCDate();
  const mod = day % 10;
  let suffix = "th";
  if (day % 100 < 10 || day % 100 > 20) {
    if (mod === 1) suffix = "st";
    else if (mod === 2) suffix = "nd";
    else if (mod === 3) suffix = "rd";
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    weekday: "long",
    timeZone: "UTC",
  }).formatToParts(dt);
  const month = parts.find((p) => p.type === "month")?.value || "";
  const year = parts.find((p) => p.type === "year")?.value || "";
  return `${day}${suffix} ${month} ${year}, ${parts.find((p) => p.type === "weekday")?.value || ""}`;
}

function getHiringTypeLabel(hiringType) {
  return { "1": "Sales", "2": "IT", "3": "Non-Sales", "4": "Sales Support" }[hiringType] || hiringType;
}

function getLevelLabel(level) {
  return { "1": "Fresher", "2": "Experienced" }[level] || level;
}

module.exports = {
  formatDateWithDay,
  getHiringTypeLabel,
  getLevelLabel,
};

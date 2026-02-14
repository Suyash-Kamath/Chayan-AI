import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../config/env";

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function DailyReports({ token }) {
  const [reportData, setReportData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(false);

  const fetchReports = useCallback(async (date) => {
    setLoading(true);
    try {
      const formattedDate = formatLocalDate(date);
      const response = await fetch(`${API_URL}/reports/${formattedDate}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to fetch reports");
      setReportData(data);
    } catch (err) {
      setReportData(null);
      alert(err.message);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchReports(selectedDate);
  }, [fetchReports, selectedDate]);

  const downloadCSV = () => {
    if (!reportData) return;
    let csv = "Recruiter,Total,Shortlisted,Rejected\n";
    reportData.reports.forEach((r) => {
      csv += `${r.recruiter_name},${r.total_resumes},${r.shortlisted},${r.rejected}\n`;
    });
    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
    link.download = `report_${formatLocalDate(selectedDate)}.csv`;
    link.click();
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">Daily Reports</h1>
        <p className="page-subtitle">
          Performance metrics for {selectedDate.toLocaleDateString()}.
        </p>
      </div>

      <div
        className="card"
        style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}
      >
        <input
          type="date"
          className="form-input"
          style={{ width: "auto" }}
          value={formatLocalDate(selectedDate)}
          onChange={(e) => setSelectedDate(new Date(`${e.target.value}T00:00:00`))}
        />
        <button className="btn btn-primary" onClick={downloadCSV} disabled={!reportData}>
          Download CSV
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : reportData?.reports?.length > 0 ? (
        <div
          className="grid-2"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
        >
          {reportData.reports.map((row, idx) => (
            <div className="card" key={idx}>
              <div className="card-header">
                <h3 className="card-title">{row.recruiter_name}</h3>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", textAlign: "center" }}>
                <div>
                  <div style={{ fontSize: "1.5rem", fontWeight: "700" }}>
                    {row.total_resumes}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#6B7280" }}>Total</div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: "700",
                      color: "var(--success)",
                    }}
                  >
                    {row.shortlisted}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#6B7280" }}>Shortlisted</div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: "700",
                      color: "var(--danger)",
                    }}
                  >
                    {row.rejected}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#6B7280" }}>Rejected</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p>No data available for this date.</p>
      )}
    </div>
  );
}

export default DailyReports;

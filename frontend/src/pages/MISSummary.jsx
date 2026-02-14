import { Fragment, useCallback, useEffect, useState } from "react";
import { API_URL } from "../config/env";

function MISSummary({ token, setViewingFile, setViewingFilename }) {
  const [mis, setMis] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openDetails, setOpenDetails] = useState({});
  const [openHistory, setOpenHistory] = useState({});

  const fetchMIS = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/mis-summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail);
      setMis(data.summary || []);
      setOpenDetails({});
      setOpenHistory({});
    } catch (err) {
      alert(err.message);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchMIS();
  }, [fetchMIS]);

  const toggleDetails = (key) => {
    setOpenDetails((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleHistory = (key) => {
    setOpenHistory((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <div>
            <h1 className="page-title">MIS Summary</h1>
            <p className="page-subtitle">Overview of recruitment activities.</p>
          </div>
          <button className="btn btn-outline" onClick={fetchMIS} disabled={loading}>
            Refresh Data
          </button>
        </div>
      </div>

      <div className="mis-grid">
        {mis.map((row, idx) => {
          const historyOpen = openHistory[idx];
          return (
            <div className="mis-card" key={row.recruiter_name || idx}>
              <div className="mis-card-header">
                <div>
                  <div className="mis-name">{row.recruiter_name}</div>
                  <div className="mis-meta">
                    {row.uploads} uploads · {row.resumes} resumes
                  </div>
                </div>
                {row.history?.length > 0 ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => toggleHistory(idx)}
                  >
                    {historyOpen ? "Hide History" : "View History"}
                  </button>
                ) : (
                  <span className="mis-empty">No history</span>
                )}
              </div>

              <div className="mis-stats">
                <div className="mis-stat">
                  <div className="mis-stat-label">Shortlisted</div>
                  <div className="mis-stat-value success">{row.shortlisted}</div>
                </div>
                <div className="mis-stat">
                  <div className="mis-stat-label">Rejected</div>
                  <div className="mis-stat-value danger">{row.rejected}</div>
                </div>
                <div className="mis-stat">
                  <div className="mis-stat-label">Total Resumes</div>
                  <div className="mis-stat-value">{row.resumes}</div>
                </div>
              </div>

              {historyOpen && row.history?.length > 0 && (
                <div className="history-panel">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Resume</th>
                        <th>Hiring Type</th>
                        <th>Level</th>
                        <th>Match %</th>
                        <th>Decision</th>
                        <th>Upload Date</th>
                        <th>Counts/Day</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.history.map((h, hidx) => {
                        const detailKey = `${idx}-${hidx}`;
                        return (
                          <Fragment key={detailKey}>
                            <tr className="history-row">
                              <td>
                                {h.file_id ? (
                                  <button
                                    type="button"
                                    className="history-link"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setViewingFile(h.file_id);
                                      setViewingFilename(h.resume_name);
                                    }}
                                  >
                                    {h.resume_name}
                                  </button>
                                ) : (
                                  <span className="history-link disabled">{h.resume_name}</span>
                                )}
                              </td>
                              <td>{h.hiring_type || "-"}</td>
                              <td>{h.level || "-"}</td>
                              <td>
                                {h.match_percent !== null && h.match_percent !== undefined
                                  ? `${h.match_percent}%`
                                  : "-"}
                              </td>
                              <td>{h.decision}</td>
                              <td>{h.upload_date || "-"}</td>
                              <td>{h.counts_per_day ?? 0}</td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleDetails(detailKey);
                                  }}
                                >
                                  {openDetails[detailKey] ? "Hide" : "Show"}
                                </button>
                              </td>
                            </tr>
                            <tr
                              className={`history-details-row ${
                                openDetails[detailKey] ? "is-open" : ""
                              }`}
                            >
                              <td colSpan={8}>
                                <div className="history-details">
                                  <pre className="analysis-pre">
                                    {(h.details || "").replace(/\*\*(.*?)\*\*/g, "$1")}
                                  </pre>
                                </div>
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MISSummary;

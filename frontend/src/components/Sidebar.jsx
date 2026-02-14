import { FaFileAlt, FaChartBar, FaCalendarAlt, FaSignOutAlt, FaUserCircle } from "react-icons/fa";

function Sidebar({ currentPage, setCurrentPage, recruiterName, handleLogout }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">ProHire</div>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${currentPage === "resume-screening" ? "active" : ""}`}
          onClick={() => setCurrentPage("resume-screening")}
        >
          <FaFileAlt style={{ marginRight: 8 }} /> Resume Screening
        </button>
        <button
          className={`nav-item ${currentPage === "mis-summary" ? "active" : ""}`}
          onClick={() => setCurrentPage("mis-summary")}
        >
          <FaChartBar style={{ marginRight: 8 }} /> MIS Summary
        </button>
        <button
          className={`nav-item ${currentPage === "daily-reports" ? "active" : ""}`}
          onClick={() => setCurrentPage("daily-reports")}
        >
          <FaCalendarAlt style={{ marginRight: 8 }} /> Daily Reports
        </button>
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar">
            {recruiterName ? recruiterName.charAt(0).toUpperCase() : <FaUserCircle />}
          </div>
          <div className="user-name">{recruiterName}</div>
        </div>
        <button onClick={handleLogout} className="logout-btn">
          <FaSignOutAlt style={{ marginRight: 8 }} /> Logout
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;

import { useEffect, useState } from "react";
import { API_URL } from "../config/env";
import Sidebar from "../components/Sidebar";
import ResumeViewer from "../components/ResumeViewer";
import Auth from "../pages/Auth";
import DailyReports from "../pages/DailyReports";
import MISSummary from "../pages/MISSummary";
import ResumeScreening from "../pages/ResumeScreening";

function App() {
  const [authMode, setAuthMode] = useState("login");
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [recruiterName, setRecruiterName] = useState(
    localStorage.getItem("recruiterName") || ""
  );
  const [currentPage, setCurrentPage] = useState("resume-screening");
  const [viewingFile, setViewingFile] = useState(null);
  const [viewingFilename, setViewingFilename] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    if (tokenParam) {
      setResetToken(tokenParam);
      setAuthMode("reset-password");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Login failed");

      setToken(data.access_token);
      setRecruiterName(data.recruiter_name);
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("recruiterName", data.recruiter_name);
    } catch (err) {
      alert(err.message);
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Request failed");
      alert(data.msg || "If the email exists, a reset link has been sent.");
      setAuthMode("login");
    } catch (err) {
      alert(err.message);
    }
    setLoading(false);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, new_password: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Reset failed");
      alert("Password reset successfully! Please login with your new password.");
      setAuthMode("login");
      setPassword("");
    } catch (err) {
      alert(err.message);
    }
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Registration failed");
      alert("Registration successful! Please login.");
      setAuthMode("login");
    } catch (err) {
      alert(err.message);
    }
    setLoading(false);
  };

  const handleLogout = () => {
    setToken("");
    setRecruiterName("");
    localStorage.clear();
  };

  if (!token) {
    return (
      <Auth
        authMode={authMode}
        setAuthMode={setAuthMode}
        handleLogin={handleLogin}
        handleRegister={handleRegister}
        handleForgotPassword={handleForgotPassword}
        handleResetPassword={handleResetPassword}
        loading={loading}
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        email={email}
        setEmail={setEmail}
      />
    );
  }

  return (
    <div className="app-layout">
      <Sidebar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        recruiterName={recruiterName}
        handleLogout={handleLogout}
      />

      <main className="main-content">
        {currentPage === "resume-screening" && <ResumeScreening token={token} />}
        {currentPage === "mis-summary" && (
          <MISSummary
            token={token}
            setViewingFile={setViewingFile}
            setViewingFilename={setViewingFilename}
          />
        )}
        {currentPage === "daily-reports" && <DailyReports token={token} />}
      </main>

      {viewingFile && (
        <ResumeViewer
          fileId={viewingFile}
          filename={viewingFilename}
          onClose={() => setViewingFile(null)}
          token={token}
        />
      )}
    </div>
  );
}

export default App;

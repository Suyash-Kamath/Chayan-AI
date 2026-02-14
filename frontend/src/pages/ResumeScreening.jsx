import { useRef, useState } from "react";
import { AiOutlineClose, AiOutlineCloudUpload } from "react-icons/ai";
import { API_URL } from "../config/env";
import { extractDecision } from "../utils/decision.jsx";

function ResumeScreening({ token }) {
  const [jd, setJd] = useState("");
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [hiringType, setHiringType] = useState("1");
  const [level, setLevel] = useState("1");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index) => {
    const nextFiles = files.filter((_, i) => i !== index);
    setFiles(nextFiles);
    if (nextFiles.length === 0 && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!jd.trim()) return alert("Please enter a job description");
    if (files.length === 0) return alert("Please select at least one resume");

    setLoading(true);
    const formData = new FormData();
    formData.append("job_description", jd);
    formData.append("hiring_type", hiringType);
    formData.append("level", level);
    files.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch(`${API_URL}/analyze-resumes/`, {
        method: "POST",
        body: formData,
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Analysis failed");
      setResults(data.results || []);
      setFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">Resume Screening</h1>
        <p className="page-subtitle">
          Upload resumes and evaluate them against the job description.
        </p>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Job Details</h3>
          </div>

          <div className="form-group">
            <label className="form-label">Hiring Type</label>
            <select
              className="form-select"
              value={hiringType}
              onChange={(e) => setHiringType(e.target.value)}
            >
              <option value="1">Sales</option>
              <option value="2">IT</option>
              <option value="3">Non-Sales</option>
              <option value="4">Sales Support</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Level</label>
            <select
              className="form-select"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="1">Fresher</option>
              <option value="2">Experienced</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Job Description</label>
            <textarea
              className="form-textarea"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the job description here..."
            />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Upload Resumes</h3>
          </div>

          <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
            <AiOutlineCloudUpload size={48} color="#2563EB" />
            <p style={{ marginTop: "1rem", color: "#6B7280" }}>
              Click to upload resumes (PDF, DOCX, Image)
            </p>
            <input
              id="file-upload"
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </div>

          {files.length > 0 && (
            <div className="file-list">
              {files.map((file, idx) => (
                <div className="file-item" key={idx}>
                  <span>{file.name}</span>
                  <button className="btn-danger-ghost" onClick={() => removeFile(idx)}>
                    <AiOutlineClose />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: "1.5rem" }}>
            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Evaluating..." : "Evaluate Resumes"}
            </button>
          </div>
        </div>
      </div>

      {results.length > 0 && (
        <div className="card" style={{ marginTop: "2rem" }}>
          <div className="card-header">
            <h3 className="card-title">Evaluation Results</h3>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Resume</th>
                  <th>Match %</th>
                  <th>Decision</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {results.map((res, idx) => (
                  <tr key={idx}>
                    <td>{res.filename}</td>
                    <td>{res.match_percent ? `${res.match_percent}%` : "-"}</td>
                    <td>{extractDecision(res)}</td>
                    <td>
                      <details>
                        <summary
                          style={{ color: "var(--primary)", cursor: "pointer" }}
                        >
                          View Analysis
                        </summary>
                        <pre className="analysis-pre">
                          {(res.result_text || res.error)?.replace(/\*\*(.*?)\*\*/g, "$1")}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResumeScreening;

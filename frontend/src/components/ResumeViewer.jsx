import { useEffect, useState } from "react";
import { API_URL } from "../config/env";

function ResumeViewer({ fileId, filename, onClose, token }) {
  const [fileData, setFileData] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let objectUrl = null;
    const fetchFile = async () => {
      try {
        const response = await fetch(`${API_URL}/view-resume/${fileId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || "Failed to load file");
        }
        setFileData(data);

        if (data.content_type?.includes("pdf")) {
          const byteCharacters = atob(data.content);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i += 1) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: "application/pdf" });
          objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
        } else {
          setBlobUrl(null);
        }
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };

    if (fileId) {
      fetchFile();
    }

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, token]);

  const handleDownload = async () => {
    try {
      const response = await fetch(`${API_URL}/download-resume/${fileId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      >
        <div style={{ color: "white", fontSize: "1.2rem" }}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      >
        <div
          style={{
            backgroundColor: "white",
            padding: "2rem",
            borderRadius: "8px",
            textAlign: "center",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ color: "red", marginBottom: "1rem" }}>{error}</div>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          width: "90%",
          maxWidth: "900px",
          height: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "#f9fafb",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#232946" }}>
            {filename}
          </h3>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={handleDownload}
              style={{
                background: "#2563eb",
                color: "white",
                border: "none",
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.9rem",
                fontWeight: "500",
              }}
            >
              Download
            </button>
            <button
              onClick={onClose}
              style={{
                background: "#ef4444",
                color: "white",
                border: "none",
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.9rem",
                fontWeight: "500",
              }}
            >
              Close
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "hidden", backgroundColor: "#f3f4f6" }}>
          {fileData && (
            <>
              {fileData.content_type?.includes("pdf") ? (
                blobUrl ? (
                  <iframe
                    src={blobUrl}
                    style={{
                      width: "100%",
                      height: "100%",
                      border: "none",
                    }}
                    title={filename}
                  />
                ) : (
                  <div style={{ padding: "2rem", textAlign: "center" }}>
                    Loading PDF...
                  </div>
                )
              ) : fileData.content_type?.includes("image") ? (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "1rem",
                  }}
                >
                  <img
                    src={`data:${fileData.content_type};base64,${fileData.content}`}
                    alt={filename}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                    }}
                  />
                </div>
              ) : (
                <div style={{ padding: "2rem", textAlign: "center" }}>
                  <h3>{filename}</h3>
                  <p>File type: {fileData.content_type}</p>
                  <p>Size: {(fileData.size / 1024).toFixed(2)} KB</p>
                  <p>
                    Preview not available for this file type. Use the download
                    button to view the file.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResumeViewer;

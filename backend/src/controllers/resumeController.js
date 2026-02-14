const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { getCollections } = require("../config/db");
const { uploadToGridFS, openDownloadStream } = require("../services/gridfsService");
const { analyzeResume } = require("../services/analysisService");
const { extractTextFromPdf, extractTextFromDocx, extractTextFromDoc, extractTextFromImage } = require("../utils/textExtract");
const { formatDateWithDay, getHiringTypeLabel, getLevelLabel } = require("../utils/date");
const { validateAnalyzeResumes } = require("../validators/resumeValidators");

function mimeFromExtension(filename = "") {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
  };
  return map[ext] || "application/octet-stream";
}

function mimeFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer.slice(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.slice(0, 6).toString("ascii") === "GIF87a" || buffer.slice(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (buffer.slice(0, 2).toString("ascii") === "BM") return "image/bmp";
  if (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.slice(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || buffer.slice(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))) return "image/tiff";
  return null;
}

function resolveContentType(filename, storedType, buffer) {
  if (storedType && storedType !== "application/octet-stream") return storedType;
  return mimeFromBuffer(buffer) || mimeFromExtension(filename);
}

async function analyzeResumes(req, res) {
  const files = req.files || [];
  const { isValid, errors } = validateAnalyzeResumes(req.body, files);
  if (!isValid) {
    return res.status(400).json({ detail: errors[0] });
  }

  const { job_description: jobDescription, hiring_type: hiringType, level } = req.body || {};
  const recruiter = req.recruiter;

  const { mis } = getCollections();
  const results = [];
  let shortlisted = 0;
  let rejected = 0;
  const history = [];
  const currentDate = new Date();
  const hiringTypeLabel = getHiringTypeLabel(hiringType);
  const levelLabel = getLevelLabel(level);

  for (const file of files) {
    const filename = file.originalname || "Unknown";
    const suffix = path.extname(filename).toLowerCase();
    const supportedImages = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp"];

    let fileId = null;
    try {
      fileId = await uploadToGridFS(filename, file.buffer, {
        content_type: file.mimetype || "application/octet-stream",
        upload_date: currentDate,
        recruiter_name: recruiter.username,
        file_size: file.size,
      });
    } catch (err) {
      // continue even if GridFS fails
    }

    const tmpPath = path.join(os.tmpdir(), `${crypto.randomUUID()}${suffix}`);
    await fs.promises.writeFile(tmpPath, file.buffer);

    let resumeText = "";
    if (suffix === ".pdf") {
      resumeText = await extractTextFromPdf(tmpPath);
    } else if (suffix === ".docx") {
      resumeText = await extractTextFromDocx(tmpPath);
    } else if (suffix === ".doc") {
      resumeText = await extractTextFromDoc(tmpPath);
    } else if (supportedImages.includes(suffix)) {
      resumeText = await extractTextFromImage(tmpPath);
    } else {
      await fs.promises.unlink(tmpPath);
      const errorMsg = `Unsupported file type: ${suffix}. Only PDF, DOCX, and image files (JPG, JPEG, PNG, GIF, BMP, TIFF, WEBP) are allowed.`;
      results.push({ filename, error: errorMsg });
      history.push({
        resume_name: filename,
        hiring_type: hiringTypeLabel,
        level: levelLabel,
        match_percent: null,
        decision: "Error",
        details: errorMsg,
        upload_date: formatDateWithDay(currentDate),
        file_id: fileId ? String(fileId) : null,
      });
      continue;
    }

    const analysis = await analyzeResume(jobDescription, resumeText, hiringType, level);
    if (analysis && typeof analysis === "object") {
      analysis.filename = filename;
      let decision = analysis.decision;
      if (!decision && analysis.result_text) {
        const match = analysis.result_text.match(/Decision:\s*(✅ Shortlist|❌ Reject)/);
        if (match) decision = match[1];
      }
      if (decision && decision.includes("Shortlist")) shortlisted += 1;
      if (decision && decision.includes("Reject")) rejected += 1;
      const decisionLabel = decision && decision.includes("Shortlist") ? "Shortlisted" : decision && decision.includes("Reject") ? "Rejected" : "-";
      analysis.decision = decisionLabel;
      results.push(analysis);
      history.push({
        resume_name: filename,
        hiring_type: hiringTypeLabel,
        level: levelLabel,
        match_percent: analysis.match_percent,
        decision: decisionLabel,
        details: analysis.result_text || analysis.error || "",
        upload_date: formatDateWithDay(currentDate),
        file_id: fileId ? String(fileId) : null,
      });
    } else {
      results.push({ filename, error: analysis });
      history.push({
        resume_name: filename,
        hiring_type: hiringTypeLabel,
        level: levelLabel,
        match_percent: null,
        decision: "Error",
        details: analysis,
        upload_date: formatDateWithDay(currentDate),
        file_id: fileId ? String(fileId) : null,
      });
    }

    await fs.promises.unlink(tmpPath);
  }

  await mis.insertOne({
    recruiter_name: recruiter.username,
    total_resumes: files.length,
    shortlisted,
    rejected,
    timestamp: currentDate,
    history,
  });

  return res.json({ results });
}

async function downloadResume(req, res) {
  try {
    const fileId = req.params.file_id;
    const gridOut = openDownloadStream(fileId);
    gridOut.on("file", (file) => {
      const resolvedType = resolveContentType(file.filename, file.metadata?.content_type);
      res.setHeader("Content-Disposition", `attachment; filename=${file.filename}`);
      res.setHeader("Content-Type", resolvedType);
    });
    gridOut.on("error", () => {
      if (!res.headersSent) return res.status(404).json({ detail: "File not found" });
    });
    gridOut.pipe(res);
  } catch (err) {
    return res.status(404).json({ detail: "File not found" });
  }
}

async function viewResume(req, res) {
  try {
    const fileId = req.params.file_id;
    const gridOut = openDownloadStream(fileId);
    let fileInfo = null;
    const chunks = [];
    gridOut.on("file", (file) => {
      fileInfo = file;
    });
    gridOut.on("data", (chunk) => chunks.push(chunk));
    gridOut.on("error", () => res.status(404).json({ detail: "File not found" }));
    gridOut.on("end", () => {
      const fileContent = Buffer.concat(chunks);
      const resolvedType = resolveContentType(
        fileInfo?.filename,
        fileInfo?.metadata?.content_type,
        fileContent
      );
      return res.json({
        filename: fileInfo?.filename || "file",
        content_type: resolvedType,
        size: fileContent.length,
        content: fileContent.toString("base64"),
      });
    });
  } catch (err) {
    return res.status(404).json({ detail: "File not found" });
  }
}

module.exports = {
  analyzeResumes,
  downloadResume,
  viewResume,
};

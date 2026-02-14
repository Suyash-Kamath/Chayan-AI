const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { MongoClient, GridFSBucket, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const argon2 = require("argon2");
const nodemailer = require("nodemailer");
const pdfParse = require("pdf-parse");
const { fromPath } = require("pdf2pic");
const mammoth = require("mammoth");
const AdmZip = require("adm-zip");
const iconv = require("iconv-lite");
const validator = require("validator");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const OpenAI = require("openai");
require("dotenv").config();

const app = express();
const mainApp = express.Router();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://final-resume-screening-app.vercel.app",
      "http://localhost:4173",
      "https://prohire.probusinsurance.com",
    ],
    credentials: true,
  })
);

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/backend", mainApp);

const upload = multer({ storage: multer.memoryStorage() });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not set in .env");
}

const client = new MongoClient(MONGODB_URI);
let db;
let misCollection;
let recruitersCollection;
let resetTokensCollection;
let fsBucket;

const SECRET_KEY = "supersecretkey";
const ALGORITHM = "HS256";
const ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7;
const RESET_TOKEN_EXPIRE_MINUTES = 30;

const SMTP_SERVER = process.env.SMTP_SERVER;
const SMTP_PORT = process.env.SMTP_PORT;
const EMAIL_USERNAME = process.env.EMAIL_USERNAME;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
const FROM_EMAIL = process.env.FROM_EMAIL;
const FROM_NAME = process.env.FROM_NAME;

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

async function connectDb() {
  await client.connect();
  db = client.db("resume_screening");
  misCollection = db.collection("mis");
  recruitersCollection = db.collection("recruiters");
  resetTokensCollection = db.collection("reset_tokens");
  fsBucket = new GridFSBucket(db);
}

function formatDateWithDay(dt) {
  const day = dt.getUTCDate();
  const mod = day % 10;
  let suffix = "th";
  if (day % 100 < 10 || day % 100 > 20) {
    if (mod === 1) suffix = "st";
    else if (mod === 2) suffix = "nd";
    else if (mod === 3) suffix = "rd";
  }
  const options = { year: "numeric", month: "long", day: "2-digit", weekday: "long", timeZone: "UTC" };
  const formatted = new Intl.DateTimeFormat("en-US", options).format(dt);
  const [weekday, month, dayNum, year] = formatted.replace(",", "").split(" ");
  return `${dayNum}${suffix} ${month} ${year}, ${weekday}`;
}

function getHiringTypeLabel(hiringType) {
  return { "1": "Sales", "2": "IT", "3": "Non-Sales", "4": "Sales Support" }[hiringType] || hiringType;
}

function getLevelLabel(level) {
  return { "1": "Fresher", "2": "Experienced" }[level] || level;
}

function createAccessToken(data, expiresMinutes = ACCESS_TOKEN_EXPIRE_MINUTES) {
  const exp = Math.floor(Date.now() / 1000) + expiresMinutes * 60;
  return jwt.sign({ ...data, exp }, SECRET_KEY, { algorithm: ALGORITHM });
}

function createResetToken(email) {
  const exp = Math.floor(Date.now() / 1000) + RESET_TOKEN_EXPIRE_MINUTES * 60;
  return jwt.sign({ email, exp, type: "reset" }, SECRET_KEY, { algorithm: ALGORITHM });
}

function verifyResetToken(token) {
  try {
    const payload = jwt.verify(token, SECRET_KEY, { algorithms: [ALGORITHM] });
    if (payload.type !== "reset") return null;
    return payload.email;
  } catch (err) {
    return null;
  }
}

async function sendEmail(toEmail, subject, body, isHtml = false) {
  if (!EMAIL_USERNAME || !EMAIL_PASSWORD) {
    throw new Error("Email configuration not set up properly");
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_SERVER,
    port: Number(SMTP_PORT),
    secure: false,
    auth: {
      user: EMAIL_USERNAME,
      pass: EMAIL_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: toEmail,
    subject,
    html: isHtml ? body : undefined,
    text: isHtml ? undefined : body,
  });
}

async function getRecruiter(username) {
  return recruitersCollection.findOne({ username });
}

async function getRecruiterByEmail(email) {
  return recruitersCollection.findOne({ email });
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ detail: "Could not validate credentials" });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, SECRET_KEY, { algorithms: [ALGORITHM] });
    const username = payload.sub;
    if (!username) {
      return res.status(401).json({ detail: "Could not validate credentials" });
    }
    const recruiter = await getRecruiter(username);
    if (!recruiter) {
      return res.status(401).json({ detail: "Could not validate credentials" });
    }
    req.recruiter = recruiter;
    next();
  } catch (err) {
    return res.status(401).json({ detail: "Could not validate credentials" });
  }
}

async function uploadToGridFS(filename, buffer, metadata) {
  return new Promise((resolve, reject) => {
    const uploadStream = fsBucket.openUploadStream(filename, { metadata });
    uploadStream.end(buffer);
    uploadStream.on("finish", () => resolve(uploadStream.id));
    uploadStream.on("error", (err) => reject(err));
  });
}

async function downloadFromGridFS(fileId) {
  return new Promise((resolve, reject) => {
    const downloadStream = fsBucket.openDownloadStream(new ObjectId(fileId));
    const chunks = [];
    downloadStream.on("data", (chunk) => chunks.push(chunk));
    downloadStream.on("error", (err) => reject(err));
    downloadStream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function stripHtmlTags(input) {
  return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function extractTextFromPdf(filePath) {
  const dataBuffer = await fs.promises.readFile(filePath);
  const data = await pdfParse(dataBuffer);
  if (data && data.text && data.text.trim()) {
    return data.text.trim();
  }

  try {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pdf-ocr-"));
    const converter = fromPath(filePath, {
      density: 150,
      saveFilename: `page-${crypto.randomUUID()}`,
      savePath: tmpDir,
      format: "png",
    });
    const pages = await converter.bulk(-1, true);
    const fullOcrText = [];

    for (const page of pages) {
      const imgBuffer = await fs.promises.readFile(page.path);
      const imgBase64 = imgBuffer.toString("base64");
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${imgBase64}` },
              },
              {
                type: "text",
                text: "Please extract all readable text from this image of a resume.",
              },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      });
      const ocrText = response.choices?.[0]?.message?.content?.trim();
      if (ocrText) {
        fullOcrText.push(ocrText);
      }
    }

    return fullOcrText.length ? fullOcrText.join("\n") : "❌ No text found in image using OCR.";
  } catch (err) {
    return `❌ Error during OCR fallback: ${err.message || err}`;
  }
}

async function extractTextFromDocx(filePath) {
  // Method 1: mammoth
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    if (result && result.value && result.value.trim()) {
      return result.value.trim();
    }
  } catch (err) {
    // fall through
  }

  // Method 2: unzip and extract text from document.xml
  try {
    const zip = new AdmZip(filePath);
    const entry = zip.getEntry("word/document.xml");
    if (entry) {
      const xml = entry.getData().toString("utf8");
      const matches = xml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
      const text = matches
        .map((m) => m.replace(/<w:t[^>]*>/, "").replace("</w:t>", ""))
        .map((t) => t.trim())
        .filter(Boolean);
      if (text.length) {
        const unique = [];
        const seen = new Set();
        for (const line of text) {
          const key = line.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(line);
          }
        }
        return unique.join("\n").trim();
      }
    }
  } catch (err) {
    // fall through
  }

  return "❌ Unable to extract text from DOCX file. Please ensure the file is not corrupted.";
}

async function extractTextFromDoc(filePath) {
  const encodings = ["utf8", "latin1", "cp1252", "iso-8859-1"];
  for (const encoding of encodings) {
    try {
      const buffer = await fs.promises.readFile(filePath);
      const content = iconv.decode(buffer, encoding);
      const lower = content.toLowerCase();
      if (
        lower.includes("<html") ||
        lower.includes("<body") ||
        lower.includes("<div") ||
        lower.includes("<p") ||
        lower.includes("<table")
      ) {
        const stripped = stripHtmlTags(content);
        if (stripped && stripped.length > 10) {
          return stripped;
        }
      }

      const cleaned = content.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
      if (cleaned && cleaned.length > 50) {
        return cleaned;
      }
    } catch (err) {
      // try next encoding
    }
  }
  return "❌ Unable to extract text from DOC file. Please convert to PDF or DOCX format.";
}

async function extractTextFromImage(filePath) {
  try {
    const imageData = await fs.promises.readFile(filePath);
    const base64Image = imageData.toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please extract all the text from this image. Return only the extracted text without any additional formatting or explanations.",
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64Image}` },
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.1,
    });

    const extractedText = response.choices?.[0]?.message?.content;
    if (extractedText && extractedText.trim()) {
      return extractedText.trim();
    }
    return "❌ Could not extract text from this image. Please ensure the image contains clear, readable text.";
  } catch (err) {
    return `❌ Error extracting text from image: ${err.message || err}`;
  }
}

function buildPrompt(jd, resumeText, hiringChoice, levelChoice) {
  if (hiringChoice === "1" && levelChoice === "1") {
    return `
You are a professional HR assistant AI screening resumes for a **Sales Fresher** role.

--- Job Description ---
${jd}

--- Candidate Resume ---
${resumeText}

--- Screening Criteria ---
1. Location: 
   - Candidate must be either from the job location city (e.g., Kolkata) or nearby cities (e.g., Durgapur) within feasible travel distance.
   - If candidate is not in the exact city but lives in a nearby town and the job allows remote or field sales operations, they should be considered.
   - Candidate should be able to travel to the main office once a month for reporting.
2. Age: As per job description.
3. Education: 12th pass & above.
4. Gender: As per job description.

Note: Everything should match the Job Description.

--- Response Format ---
Match %: XX%
Pros:
- ...
Cons:
- ...
Decision: ✅ Shortlist or ❌ Reject
Reason (if Rejected): ...
`;
  }
  if (hiringChoice === "1" && levelChoice === "2") {
    return `
You are a professional HR assistant AI screening resumes for a **Sales Experienced** role.

--- Job Description ---
${jd}

--- Candidate Resume ---
${resumeText}

--- Screening Criteria ---
1. Location: 
   - Candidate must be either from the job location city (e.g., Kolkata) or nearby cities (e.g., Durgapur) within feasible travel distance.
   - If candidate is not in the exact city but lives in a nearby town and the job allows remote or field sales operations, they should be considered.
   - Candidate should be able to travel to the main office once a month for reporting.
2. Age: As per job description ("up to" logic preferred).
3. Total Experience: Add all types of sales (health + motor, etc.).
4. Relevant Experience: Must match industry (strict).
5. Education: 12th pass & above accepted.
6. Gender: As per job description.
7. Skills: Skills should align with relevant experience.
8. Stability: Ignore if 1 job <1 year; Reject if 2+ jobs each <1 year.

Note: Everything should match the Job Description.

--- Response Format ---
Match %: XX%
Pros:
- ...
Cons:
- ...
Decision: ✅ Shortlist or ❌ Reject
Reason (if Rejected): ...
`;
  }
  if (hiringChoice === "2" && levelChoice === "1") {
    return `
You are a professional HR assistant AI screening resumes for an **IT Fresher** role.

--- Job Description ---
${jd}

--- Candidate Resume ---
${resumeText}

--- Screening Criteria ---
1. Location: Must be local.
2. Age: Ignore or as per JD.
3. Experience: Internship is a bonus; no experience is fine.
4. Projects: Highlighted as experience if relevant.
5. Education: B.E, M.E, BTech, MTech, or equivalent in IT.
6. Gender: As per job description.
7. Skills: Must align with the job field (e.g., Full Stack).
Note: For example, if hiring for a Full Stack Engineer role, even if one or two skills mentioned in the Job Description are missing, the candidate can still be considered if they have successfully built Full Stack projects. Additional skills or tools mentioned in the JD are good-to-have, but not mandatory.
8. Stability: Not applicable.

Note: Everything should match the Job Description.

--- Response Format ---
Match %: XX%
Pros:
- ...
Cons:
- ...
Decision: ✅ Shortlist or ❌ Reject
Reason (if Rejected): ...
`;
  }
  if (hiringChoice === "2" && levelChoice === "2") {
    return `
You are a professional HR assistant AI screening resumes for an **IT Experienced** role.

--- Job Description ---
${jd}

--- Candidate Resume ---
${resumeText}

--- Screening Criteria ---
1. Location: Must be local.
2. Age: As per job description (prefer "up to").
3. Total Experience: Overall IT field experience.
4. Relevant Experience: Must align with JD field.
5. Education: IT-related degrees only (B.E, M.Tech, etc.).
6. Gender: As per job description.
7. Skills: Languages and frameworks should match JD.
8. Stability: Ignore if 1 company <1 year; Reject if 2+ companies each <1 year.

Note: Everything should match the Job Description.

--- Response Format ---
Match %: XX%
Pros:
- ...
Cons:
- ...
Decision: ✅ Shortlist or ❌ Reject
Reason (if Rejected): ...
`;
  }
  if (hiringChoice === "3" && levelChoice === "1") {
    return `
You are a professional HR assistant AI screening resumes for a **Non-Sales Fresher** role.

--- Job Description ---
${jd}

--- Candidate Resume ---
${resumeText}

--- Screening Criteria ---
1. Location: Should be local and match JD.
2. Age: As per JD.
3. Total / Relevant Experience: Internship optional, but candidate should have certifications.
4. Education: Must be relevant to the JD.
5. Gender: As per JD.
6. Skills: Must align with the JD.
7. Stability: Not applicable for freshers.

Note: Don't reject or make decisions based on age, gender and location , it was just for an extra information you can include in your evaluation. Take your decision overall based on role , responsibilities and skills

--- Response Format ---
Match %: XX%
Pros:
- ...
Cons:
- ...
Decision: ✅ Shortlist or ❌ Reject
Reason (if Rejected): ...
`;
  }
  if (hiringChoice === "3" && levelChoice === "2") {
    return `
You are a professional HR assistant AI screening resumes for a **Non-Sales Experienced** role.

--- Job Description ---
${jd}

--- Candidate Resume ---
${resumeText}

--- Screening Criteria ---
1. Location: Must strictly match the JD.
2. Age: As per JD.
3. Total Experience: Overall professional experience.
4. Relevant Experience: Must align with role in JD.
5. Education: Must match the JD.
6. Gender: As per JD.
7. Skills: Should align with JD and match relevant experience (skills = relevant experience).
8. Stability:
   - If 2+ companies and each job ≤1 year → Reject.
   - If 1 company and ≤1 year → Ignore stability.

Note: Don't reject or make decisions based on age, gender and location , it was just for an extra information you can include in your evaluation. Take your decision overall based on role , responsibilities and skills

--- Response Format ---
Match %: XX%
Pros:
- ...
Cons:
- ...
Decision: ✅ Shortlist or ❌ Reject
Reason (if Rejected): ...
`;
  }
  if (hiringChoice === "4" && levelChoice === "1") {
    return `
You are a professional HR assistant AI screening resumes for a **Sales Support Fresher** role.

--- Job Description ---
${jd}

--- Candidate Resume ---
${resumeText}

--- Screening Criteria ---
1. Location: Must be strictly local.
2. Age: As per job description.
3. Education: 12th pass & above.
4. Gender: As per job description.

Note: Everything should match the Job Description.

--- Response Format ---
Match %: XX%
Pros:
- ...
Cons:
- ...
Decision: ✅ Shortlist or ❌ Reject
Reason (if Rejected): ...
`;
  }
  if (hiringChoice === "4" && levelChoice === "2") {
    return `
You are a professional HR assistant AI screening resumes for a **Sales Support Experienced** role.

--- Job Description ---
${jd}

--- Candidate Resume ---
${resumeText}

--- Screening Criteria ---
1. Location: Must be strictly local.
2. Age: As per job description ("up to" logic preferred).
3. Total Experience: Add all types of sales support
4. Relevant Experience: Must match industry (strict).
5. Education: 12th pass & above accepted.
6. Gender: As per job description.
7. Skills: Skills should align with relevant experience.
8. Stability: Ignore if 1 job <1 year; Reject if 2+ jobs each <1 year.

Note: Everything should match the Job Description.

--- Response Format ---
Match %: XX%
Pros:
- ...
Cons:
- ...
Decision: ✅ Shortlist or ❌ Reject
Reason (if Rejected): ...
`;
  }
  return "";
}

async function analyzeResume(jd, resumeText, hiringChoice, levelChoice) {
  const prompt = buildPrompt(jd, resumeText, hiringChoice, levelChoice);
  if (!prompt) {
    return { error: "Invalid hiring or level choice provided.", filename: "" };
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 800,
    });

    const content = response.choices?.[0]?.message?.content;
    let resultText = content ? content.trim() : "Match %: 0\nDecision: ❌ Reject\nReason (if Rejected): No response from model.";

    let matchPercent = 0;
    const match = resultText.match(/Match\s*%:\s*(\d+)/);
    if (match) {
      matchPercent = Number(match[1]);
    }

    if (matchPercent < 72) {
      resultText = resultText.replace(/Decision:.*/, "Decision: ❌ Reject");
      if (resultText.includes("Reason (if Rejected):")) {
        resultText = resultText.replace(/Reason \(if Rejected\):.*/, "Reason (if Rejected): Match % below 72% threshold.");
      } else {
        resultText += "\nReason (if Rejected): Match % below 72% threshold.";
      }
    }

    return {
      result_text: resultText,
      match_percent: matchPercent,
      usage: response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          }
        : null,
    };
  } catch (err) {
    return { error: `Analysis failed: ${err.message || err}`, filename: "" };
  }
}

mainApp.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { username, password, email } = req.body || {};
    if (!username || !password || !email) {
      return res.status(400).json({ detail: "Missing username, password, or email" });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ detail: "Invalid email" });
    }
    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({ detail: "Password must be between 6 and 128 characters" });
    }
    if (username.length < 3) {
      return res.status(400).json({ detail: "Username must be at least 3 characters" });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    const existingUsername = await recruitersCollection.findOne({ username: cleanUsername });
    if (existingUsername) {
      return res.status(400).json({ detail: "Username already registered" });
    }

    const existingEmail = await recruitersCollection.findOne({ email: cleanEmail });
    if (existingEmail) {
      return res.status(400).json({ detail: "Email already registered" });
    }

    const hashed = await argon2.hash(password);

    await recruitersCollection.insertOne({
      username: cleanUsername,
      email: cleanEmail,
      hashed_password: hashed,
      created_at: new Date(),
    });

    return res.json({ msg: "Recruiter registered successfully" });
  })
);

mainApp.post(
  "/register-form",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ detail: "Missing username or password" });
    }
    const cleanUsername = username.trim();
    const existing = await recruitersCollection.findOne({ username: cleanUsername });
    if (existing) {
      return res.status(400).json({ detail: "Username already registered" });
    }
    const hashed = await argon2.hash(password);
    await recruitersCollection.insertOne({
      username: cleanUsername,
      hashed_password: hashed,
      created_at: new Date(),
    });
    return res.json({ msg: "Recruiter registered" });
  })
);

mainApp.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ detail: "Missing username or password" });
    }
    const cleanUsername = username.trim();
    const recruiter = await recruitersCollection.findOne({ username: cleanUsername });
    if (!recruiter) {
      return res.status(400).json({ detail: "Incorrect username or password" });
    }
    const valid = await argon2.verify(recruiter.hashed_password, password);
    if (!valid) {
      return res.status(400).json({ detail: "Incorrect username or password" });
    }

    const accessToken = createAccessToken({ sub: recruiter.username });
    return res.json({
      access_token: accessToken,
      token_type: "bearer",
      recruiter_name: recruiter.username,
    });
  })
);

mainApp.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    if (!email || !validator.isEmail(email)) {
      return res.json({ msg: "If the email exists, you will receive a password reset link" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const recruiter = await getRecruiterByEmail(cleanEmail);
    if (!recruiter) {
      return res.json({ msg: "If the email exists, you will receive a password reset link" });
    }

    const resetToken = createResetToken(cleanEmail);
    await resetTokensCollection.insertOne({
      email: cleanEmail,
      token: resetToken,
      created_at: new Date(),
      expires_at: new Date(Date.now() + RESET_TOKEN_EXPIRE_MINUTES * 60 * 1000),
      used: false,
    });

    const frontendBaseUrl = process.env.FRONTEND_BASE_URL;
    const resetLink = `${frontendBaseUrl}/reset-password?token=${resetToken}`;

    const subject = "Password Reset Request - Prohire";
    const body = `
    <html>
        <body>
            <h2>Password Reset Request</h2>
            <p>Hello ${recruiter.username},</p>
            <p>You have requested to reset your password for Prohire</p>
            <p>Click the link below to reset your password:</p>
            <p><a href="${resetLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Reset Password</a></p>
            <p>This link will expire in ${RESET_TOKEN_EXPIRE_MINUTES} minutes.</p>
            <p>If you didn't request this reset, please ignore this email.</p>
            <br>
            <p>Best regards,<br>ProHire Team</p>
        </body>
    </html>
    `;

    await sendEmail(cleanEmail, subject, body, true);
    return res.json({ msg: "If the email exists, you will receive a password reset link" });
  })
);

mainApp.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { token, new_password: newPassword } = req.body || {};
    if (!token || !newPassword) {
      return res.status(400).json({ detail: "Missing token or new_password" });
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      return res.status(400).json({ detail: "Password must be between 6 and 128 characters" });
    }

    const email = verifyResetToken(token);
    if (!email) {
      return res.status(400).json({ detail: "Invalid or expired reset token" });
    }

    const tokenDoc = await resetTokensCollection.findOne({
      token,
      used: false,
      expires_at: { $gt: new Date() },
    });

    if (!tokenDoc) {
      return res.status(400).json({ detail: "Invalid or expired reset token" });
    }

    const recruiter = await getRecruiterByEmail(email);
    if (!recruiter) {
      return res.status(404).json({ detail: "User not found" });
    }

    const hashedPassword = await argon2.hash(newPassword);
    await recruitersCollection.updateOne(
      { email },
      { $set: { hashed_password: hashedPassword, password_updated_at: new Date() } }
    );

    await resetTokensCollection.updateOne({ token }, { $set: { used: true, used_at: new Date() } });

    return res.json({ msg: "Password reset successfully" });
  })
);

mainApp.get(
  "/verify-reset-token/:token",
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const email = verifyResetToken(token);
    if (!email) {
      return res.status(400).json({ detail: "Invalid or expired reset token" });
    }

    const tokenDoc = await resetTokensCollection.findOne({
      token,
      used: false,
      expires_at: { $gt: new Date() },
    });

    if (!tokenDoc) {
      return res.status(400).json({ detail: "Invalid or expired reset token" });
    }

    return res.json({ valid: true, email });
  })
);

mainApp.delete(
  "/cleanup-expired-tokens",
  asyncHandler(async (req, res) => {
    const result = await resetTokensCollection.deleteMany({
      expires_at: { $lt: new Date() },
    });
    return res.json({ deleted_count: result.deletedCount });
  })
);

mainApp.post(
  "/analyze-resumes/",
  authMiddleware,
  upload.array("files"),
  asyncHandler(async (req, res) => {
    const { job_description: jobDescription, hiring_type: hiringType, level } = req.body || {};
    const files = req.files || [];
    const recruiter = req.recruiter;

    if (!jobDescription || !hiringType || !level || !files.length) {
      return res.status(400).json({ detail: "Missing job_description, hiring_type, level, or files" });
    }

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

    await misCollection.insertOne({
      recruiter_name: recruiter.username,
      total_resumes: files.length,
      shortlisted,
      rejected,
      timestamp: currentDate,
      history,
    });

    return res.json({ results });
  })
);

mainApp.get(
  "/download-resume/:file_id",
  authMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const fileId = req.params.file_id;
      const gridOut = fsBucket.openDownloadStream(new ObjectId(fileId));
      gridOut.on("file", (file) => {
        res.setHeader("Content-Disposition", `attachment; filename=${file.filename}`);
        res.setHeader("Content-Type", file.metadata?.content_type || "application/octet-stream");
      });
      gridOut.on("error", () => res.status(404).json({ detail: "File not found" }));
      gridOut.pipe(res);
    } catch (err) {
      return res.status(404).json({ detail: "File not found" });
    }
  })
);

mainApp.get(
  "/view-resume/:file_id",
  authMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const fileId = req.params.file_id;
      const gridOut = fsBucket.openDownloadStream(new ObjectId(fileId));
      const chunks = [];
      gridOut.on("data", (chunk) => chunks.push(chunk));
      gridOut.on("error", () => res.status(404).json({ detail: "File not found" }));
      gridOut.on("end", () => {
        const fileContent = Buffer.concat(chunks);
        return res.json({
          filename: gridOut.filename,
          content_type: gridOut.s?.metadata?.content_type || "application/octet-stream",
          size: fileContent.length,
          content: fileContent.toString("base64"),
        });
      });
    } catch (err) {
      return res.status(404).json({ detail: "File not found" });
    }
  })
);

mainApp.get(
  "/mis-summary",
  asyncHandler(async (req, res) => {
    const pipeline = [
      {
        $group: {
          _id: "$recruiter_name",
          uploads: { $sum: 1 },
          total_resumes: { $sum: "$total_resumes" },
          shortlisted: { $sum: "$shortlisted" },
          rejected: { $sum: "$rejected" },
          history: { $push: "$history" },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const summary = await misCollection.aggregate(pipeline).toArray();
    const formattedSummary = summary.map((row) => ({
      recruiter_name: row._id,
      uploads: row.uploads,
      resumes: row.total_resumes,
      shortlisted: row.shortlisted,
      rejected: row.rejected,
      history: row.history.flat(),
    }));

    const allRecords = await misCollection.find({}).sort({ timestamp: -1 }).toArray();
    const recruiterHistory = {};
    for (const record of allRecords) {
      const recruiter = record.recruiter_name;
      if (!recruiterHistory[recruiter]) recruiterHistory[recruiter] = [];
      for (const item of record.history || []) {
        recruiterHistory[recruiter].push(item);
      }
    }

    for (const summaryItem of formattedSummary) {
      const recruiter = summaryItem.recruiter_name;
      const flatHistory = recruiterHistory[recruiter] || [];
      const dailyCounts = {};
      for (const item of flatHistory) {
        const uploadDate = item.upload_date || "";
        if (uploadDate) {
          const datePart = uploadDate.includes(",") ? uploadDate.split(",")[0] : uploadDate;
          dailyCounts[datePart] = (dailyCounts[datePart] || 0) + 1;
        }
      }
      for (const item of flatHistory) {
        const uploadDate = item.upload_date || "";
        if (uploadDate) {
          const datePart = uploadDate.includes(",") ? uploadDate.split(",")[0] : uploadDate;
          item.counts_per_day = dailyCounts[datePart] || 0;
        } else {
          item.counts_per_day = 0;
        }
      }
      summaryItem.history = flatHistory;
    }

    return res.json({ summary: formattedSummary });
  })
);

mainApp.get(
  "/daily-reports",
  asyncHandler(async (req, res) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const pipeline = [
      { $match: { timestamp: { $gte: today, $lt: tomorrow } } },
      {
        $group: {
          _id: "$recruiter_name",
          total_resumes: { $sum: "$total_resumes" },
          shortlisted: { $sum: "$shortlisted" },
          rejected: { $sum: "$rejected" },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const dailyData = await misCollection.aggregate(pipeline).toArray();
    const todayFormatted = formatDateWithDay(today);
    return res.json({
      date: todayFormatted,
      reports: dailyData.map((row) => ({
        recruiter_name: row._id,
        total_resumes: row.total_resumes,
        shortlisted: row.shortlisted,
        rejected: row.rejected,
      })),
    });
  })
);

mainApp.get(
  "/previous-day-reports",
  asyncHandler(async (req, res) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    const pipeline = [
      { $match: { timestamp: { $gte: yesterday, $lt: today } } },
      {
        $group: {
          _id: "$recruiter_name",
          total_resumes: { $sum: "$total_resumes" },
          shortlisted: { $sum: "$shortlisted" },
          rejected: { $sum: "$rejected" },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const previousDayData = await misCollection.aggregate(pipeline).toArray();
    const yesterdayFormatted = formatDateWithDay(yesterday);
    return res.json({
      date: yesterdayFormatted,
      reports: previousDayData.map((row) => ({
        recruiter_name: row._id,
        total_resumes: row.total_resumes,
        shortlisted: row.shortlisted,
        rejected: row.rejected,
      })),
    });
  })
);

mainApp.get(
  "/reports/:date_type",
  asyncHandler(async (req, res) => {
    const dateType = req.params.date_type;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let startDate;
    let endDate;
    if (dateType === "today") {
      startDate = today;
      endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    } else if (dateType === "yesterday") {
      startDate = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      endDate = today;
    } else {
      const parsed = new Date(`${dateType}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ detail: "Invalid date format. Use 'today', 'yesterday', or YYYY-MM-DD" });
      }
      startDate = parsed;
      endDate = new Date(parsed.getTime() + 24 * 60 * 60 * 1000);
    }

    const pipeline = [
      { $match: { timestamp: { $gte: startDate, $lt: endDate } } },
      {
        $group: {
          _id: "$recruiter_name",
          total_resumes: { $sum: "$total_resumes" },
          shortlisted: { $sum: "$shortlisted" },
          rejected: { $sum: "$rejected" },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const reportData = await misCollection.aggregate(pipeline).toArray();
    const dateFormatted = formatDateWithDay(startDate);
    return res.json({
      date: dateFormatted,
      date_type: dateType,
      reports: reportData.map((row) => ({
        recruiter_name: row._id,
        total_resumes: row.total_resumes,
        shortlisted: row.shortlisted,
        rejected: row.rejected,
      })),
    });
  })
);

mainApp.get("/health", (req, res) => res.json({ status: "ok" }));
mainApp.get("/", (req, res) => res.json({ message: "Backend API is live!" }));

app.get("/", (req, res) => res.json({ message: "Backend is live!" }));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const detail = err.message || "Internal server error";
  res.status(status).json({ detail });
});

const PORT = process.env.PORT || 8000;
connectDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  });

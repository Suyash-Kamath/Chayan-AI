const jwt = require("jsonwebtoken");
const argon2 = require("argon2");
const {
  validateRegister,
  validateRegisterForm,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
} = require("../validators/authValidators");
const { SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, RESET_TOKEN_EXPIRE_MINUTES } = require("../config/constants");
const env = require("../config/env");
const { getCollections } = require("../config/db");
const { sendEmail } = require("../services/emailService");

function normalizeString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
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

async function register(req, res) {
  const { isValid, errors } = validateRegister(req.body);
  if (!isValid) {
    return res.status(400).json({ detail: errors[0] });
  }

  const cleanUsername = normalizeString(req.body?.username);
  const password = req.body?.password;
  const cleanEmail = normalizeString(req.body?.email).toLowerCase();

  const { recruiters } = getCollections();
  const existingUsername = await recruiters.findOne({ username: cleanUsername });
  if (existingUsername) {
    return res.status(400).json({ detail: "Username already registered" });
  }

  const existingEmail = await recruiters.findOne({ email: cleanEmail });
  if (existingEmail) {
    return res.status(400).json({ detail: "Email already registered" });
  }

  const hashed = await argon2.hash(password);
  await recruiters.insertOne({
    username: cleanUsername,
    email: cleanEmail,
    hashed_password: hashed,
    created_at: new Date(),
  });

  return res.json({ msg: "Recruiter registered successfully" });
}

async function registerForm(req, res) {
  const { isValid, errors } = validateRegisterForm(req.body);
  if (!isValid) {
    return res.status(400).json({ detail: errors[0] });
  }

  const cleanUsername = normalizeString(req.body?.username);
  const password = req.body?.password;
  const { recruiters } = getCollections();
  const existing = await recruiters.findOne({ username: cleanUsername });
  if (existing) {
    return res.status(400).json({ detail: "Username already registered" });
  }
  const hashed = await argon2.hash(password);
  await recruiters.insertOne({
    username: cleanUsername,
    hashed_password: hashed,
    created_at: new Date(),
  });
  return res.json({ msg: "Recruiter registered" });
}

async function login(req, res) {
  const { isValid, errors } = validateLogin(req.body);
  if (!isValid) {
    return res.status(400).json({ detail: errors[0] });
  }

  const cleanUsername = normalizeString(req.body?.username);
  const password = req.body?.password;
  const { recruiters } = getCollections();
  const recruiter = await recruiters.findOne({ username: cleanUsername });
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
}

async function forgotPassword(req, res) {
  const { isValid } = validateForgotPassword(req.body);
  if (!isValid) {
    return res.json({ msg: "If the email exists, you will receive a password reset link" });
  }

  const cleanEmail = normalizeString(req.body?.email).toLowerCase();
  const { recruiters, resetTokens } = getCollections();
  const recruiter = await recruiters.findOne({ email: cleanEmail });
  if (!recruiter) {
    return res.json({ msg: "If the email exists, you will receive a password reset link" });
  }

  const resetToken = createResetToken(cleanEmail);
  await resetTokens.insertOne({
    email: cleanEmail,
    token: resetToken,
    created_at: new Date(),
    expires_at: new Date(Date.now() + RESET_TOKEN_EXPIRE_MINUTES * 60 * 1000),
    used: false,
  });

  const resetLink = `${env.FRONTEND_BASE_URL}/reset-password?token=${resetToken}`;

  const subject = "Password Reset Request - Chayan AI";
  const body = `
  <html>
      <body>
          <h2>Password Reset Request</h2>
          <p>Hello ${recruiter.username},</p>
          <p>You have requested to reset your password for Chayan AI</p>
          <p>Click the link below to reset your password:</p>
          <p><a href="${resetLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Reset Password</a></p>
          <p>This link will expire in ${RESET_TOKEN_EXPIRE_MINUTES} minutes.</p>
          <p>If you didn't request this reset, please ignore this email.</p>
          <br>
          <p>Best regards,<br>Chayan AI Team</p>
      </body>
  </html>
  `;

  await sendEmail(cleanEmail, subject, body, true);
  return res.json({ msg: "If the email exists, you will receive a password reset link" });
}

async function resetPassword(req, res) {
  const { isValid, errors } = validateResetPassword(req.body);
  if (!isValid) {
    return res.status(400).json({ detail: errors[0] });
  }

  const { token, new_password: newPassword } = req.body || {};

  const email = verifyResetToken(token);
  if (!email) {
    return res.status(400).json({ detail: "Invalid or expired reset token" });
  }

  const { recruiters, resetTokens } = getCollections();
  const tokenDoc = await resetTokens.findOne({
    token,
    used: false,
    expires_at: { $gt: new Date() },
  });

  if (!tokenDoc) {
    return res.status(400).json({ detail: "Invalid or expired reset token" });
  }

  const recruiter = await recruiters.findOne({ email });
  if (!recruiter) {
    return res.status(404).json({ detail: "User not found" });
  }

  const hashedPassword = await argon2.hash(newPassword);
  await recruiters.updateOne(
    { email },
    { $set: { hashed_password: hashedPassword, password_updated_at: new Date() } }
  );

  await resetTokens.updateOne({ token }, { $set: { used: true, used_at: new Date() } });

  return res.json({ msg: "Password reset successfully" });
}

async function verifyResetTokenEndpoint(req, res) {
  const { token } = req.params;
  const email = verifyResetToken(token);
  if (!email) {
    return res.status(400).json({ detail: "Invalid or expired reset token" });
  }

  const { resetTokens } = getCollections();
  const tokenDoc = await resetTokens.findOne({
    token,
    used: false,
    expires_at: { $gt: new Date() },
  });

  if (!tokenDoc) {
    return res.status(400).json({ detail: "Invalid or expired reset token" });
  }

  return res.json({ valid: true, email });
}

async function cleanupExpiredTokens(req, res) {
  const { resetTokens } = getCollections();
  const result = await resetTokens.deleteMany({
    expires_at: { $lt: new Date() },
  });
  return res.json({ deleted_count: result.deletedCount });
}

module.exports = {
  register,
  registerForm,
  login,
  forgotPassword,
  resetPassword,
  verifyResetTokenEndpoint,
  cleanupExpiredTokens,
};

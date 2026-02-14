const validator = require("validator");

function normalizeString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function validateRegister(payload) {
  const errors = [];
  const username = normalizeString(payload?.username);
  const password = typeof payload?.password === "string" ? payload.password : "";
  const email = normalizeString(payload?.email).toLowerCase();

  if (!username || !password || !email) {
    errors.push("Missing username, password, or email");
  }
  if (email && !validator.isEmail(email)) {
    errors.push("Invalid email");
  }
  if (password && (password.length < 6 || password.length > 128)) {
    errors.push("Password must be between 6 and 128 characters");
  }
  if (username && username.length < 3) {
    errors.push("Username must be at least 3 characters");
  }

  return { isValid: errors.length === 0, errors };
}

function validateRegisterForm(payload) {
  const errors = [];
  const username = normalizeString(payload?.username);
  const password = typeof payload?.password === "string" ? payload.password : "";

  if (!username || !password) {
    errors.push("Missing username or password");
  }
  return { isValid: errors.length === 0, errors };
}

function validateLogin(payload) {
  const errors = [];
  const username = normalizeString(payload?.username);
  const password = typeof payload?.password === "string" ? payload.password : "";

  if (!username || !password) {
    errors.push("Missing username or password");
  }
  return { isValid: errors.length === 0, errors };
}

function validateForgotPassword(payload) {
  const email = normalizeString(payload?.email).toLowerCase();
  if (!email || !validator.isEmail(email)) {
    return { isValid: false, errors: ["Invalid email"] };
  }
  return { isValid: true, errors: [] };
}

function validateResetPassword(payload) {
  const errors = [];
  const { token, new_password: newPassword } = payload || {};

  if (!token || !newPassword) {
    errors.push("Missing token or new_password");
  }
  if (newPassword && (newPassword.length < 6 || newPassword.length > 128)) {
    errors.push("Password must be between 6 and 128 characters");
  }

  return { isValid: errors.length === 0, errors };
}

module.exports = {
  validateRegister,
  validateRegisterForm,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
};

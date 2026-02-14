module.exports = {
  SECRET_KEY: "supersecretkey",
  ALGORITHM: "HS256",
  ACCESS_TOKEN_EXPIRE_MINUTES: 60 * 24 * 7,
  RESET_TOKEN_EXPIRE_MINUTES: 30,
  CORS_ORIGINS: [
    "http://localhost:5173",

  ],
};

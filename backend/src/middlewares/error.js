function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const detail = err.message || "Internal server error";
  res.status(status).json({ detail });
}

module.exports = errorHandler;

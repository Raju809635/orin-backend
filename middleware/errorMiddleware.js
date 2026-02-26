function notFound(req, res) {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  console.error("[API_ERROR]", {
    method: req.method,
    path: req.originalUrl,
    statusCode,
    message: err.message
  });

  res.status(statusCode).json({
    message: err.message || "Internal server error"
  });
}

module.exports = {
  notFound,
  errorHandler
};

// backend/middleware/error.middleware.js

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const notFound = (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
};

const globalErrorHandler = (err, req, res, next) => {
  let { statusCode = 500, message } = err;

  // Mongoose CastError (bad ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message    = `Invalid ${err.path}: ${err.value}`;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message    = `${field || 'Field'} already exists`;
  }

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    statusCode = 422;
    message    = Object.values(err.errors).map(e => e.message).join(', ');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError')  { statusCode = 401; message = 'Invalid token'; }
  if (err.name === 'TokenExpiredError')  { statusCode = 401; message = 'Token expired'; }

  // Multer
  if (err.code === 'LIMIT_FILE_SIZE') { statusCode = 400; message = 'File too large'; }

  const isDev = process.env.NODE_ENV === 'development';
  console.error(`[${new Date().toISOString()}] ${statusCode} ${req.method} ${req.originalUrl} — ${message}`);

  res.status(statusCode).json({
    success: false,
    message,
    ...(isDev && { stack: err.stack }),
  });
};

module.exports = { AppError, notFound, globalErrorHandler };

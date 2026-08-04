const rateLimit = require('express-rate-limit');

const enquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many enquiries submitted. Please try again later.' },
});

module.exports = { enquiryLimiter };

/**
 * Parses a MongoDB error and returns a user-friendly message.
 * Specifically handles E11000 duplicate key violations.
 *
 * @param {Error} error - The error thrown by Mongoose/MongoDB
 * @returns {{ status: number, message: string }}
 */
const handleMongoError = (error) => {
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue || {})[0];
    const value = field ? error.keyValue[field] : null;

    const fieldLabels = {
      mobile: 'mobile number',
      phone: 'phone number',
      email: 'email address',
      slug: 'slug',
      title: 'title',
      name: 'name',
    };

    const label = fieldLabels[field] || field || 'field';
    const detail = value ? ` (${value})` : '';

    return {
      status: 409,
      message: `A record with this ${label}${detail} already exists.`,
    };
  }

  return {
    status: 500,
    message: error.message || 'An unexpected error occurred.',
  };
};

module.exports = { handleMongoError };

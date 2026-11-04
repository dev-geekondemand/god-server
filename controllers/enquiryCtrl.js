const Enquiry = require('../models/enquiryModal.js');
const asyncHandler = require('express-async-handler');
const sendEmail = require('../middlewares/sendMail.js');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Create a new enquiry
const createEnquiry = asyncHandler(async (req, res) => {
  const { name, email, phone, message } = req.body;

  if (!name || !email|| !message) {
    res.status(400).json({ message: 'Missing required fields' });
    return;
  }

  const enquiry = await Enquiry.create({ name, email, phone, message });

  // Notify the admin. Best-effort: the enquiry is already saved, so a mail
  // failure must not tell the visitor it failed (they'd resubmit). Visitor
  // input is escaped before going into the HTML body.
  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      replyTo: email,
      subject: 'New Enquiry Received',
      text: `You have received a new enquiry from ${name} (${email}, ${phone || 'no phone'}):\n\n${message}`,
      html: `<p>You have received a new enquiry from ${escapeHtml(name)} (${escapeHtml(email)}, ${escapeHtml(phone || 'no phone')}):</p><p>Message: ${escapeHtml(message)}</p>`,
    });
  } catch (error) {
    console.error('[createEnquiry] admin notification email failed:', error?.message || error);
  }

  res.status(201).json(enquiry);
});

// Get all enquiries
const getAllEnquiries = asyncHandler(async (req, res) => {
  const enquiries = await Enquiry.find().sort({ createdAt: -1 });
  res.status(200).json(enquiries);
});

// Get a single enquiry by ID
const getEnquiryById = asyncHandler(async (req, res) => {
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) {
    res.status(404).json({ message: 'Enquiry not found' });
  } else {
    res.status(200).json(enquiry);
  }
});

// Update a single enquiry by ID
const updateEnquiryById = asyncHandler(async (req, res) => {
  const { name, email, phone, message } = req.body;
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) {
    res.status(404).json({ message: 'Enquiry not found' });
  } else {
    enquiry.name = name;
    enquiry.email = email;
    enquiry.phone = phone;
    enquiry.message = message;
    const updatedEnquiry = await enquiry.save();
    res.status(200).json(updatedEnquiry);
  }
});

// Delete a single enquiry by ID
const deleteEnquiryById = asyncHandler(async (req, res) => {
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) {
    res.status(404).json({ message: 'Enquiry not found' });
  } else {
    await enquiry.remove();
    res.status(200).json({ message: 'Enquiry deleted' });
  }
});

module.exports = {
  createEnquiry,
  getAllEnquiries,
  getEnquiryById,
  updateEnquiryById,
  deleteEnquiryById,
};

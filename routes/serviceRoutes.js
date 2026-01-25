// routes/serviceRoutes.js
const express = require('express');
const router = express.Router();
// const { uploadMedia } = require('../middlewares/azureUploads');
const { createService, getAllServices, getServiceById, updateService, deleteService } = require('../controllers/serviceControllers');
const { protectAdmin } = require('../middlewares/authMiddleware');
const protectGeek = require('../middlewares/protectGeek');

// Create a service
router.post('/', protectGeek, createService);

// Get all services
router.get('/', getAllServices);

// Get a single service by ID
router.get('/:id', getServiceById);

// Update a service by ID
router.put('/:id', protectGeek, updateService);

// Delete a service by ID
router.delete('/:id',protectAdmin, deleteService);

module.exports = router;
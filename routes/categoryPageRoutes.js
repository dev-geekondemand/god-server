const express = require('express');
const {
  createCategoryPage,
  getAllCategoryPages,
  getPublishedCategoryPages,
  getCategoryPageById,
  getCategoryPageByCategory,
  getCategoryPageBySlug,
  updateCategoryPage,
  deleteCategoryPage,
  updateHeroImage,
  updateProblemIcon,
} = require('../controllers/categoryPageController.js');
const { protectAdmin } = require('../middlewares/authMiddleware.js');
const { uploadLimiter, singleUploader } = require('../middlewares/azureUploads.js');

const router = express.Router();

const heroImageUploader = singleUploader(['image/jpeg', 'image/png'], 'heroImage');
const iconUploader = singleUploader(['image/jpeg', 'image/png', 'image/svg+xml'], 'icon');

// Specific static paths first (before wildcard /:id routes)
router.get('/admin', protectAdmin, getAllCategoryPages);
router.get('/slug/:slug', getCategoryPageBySlug);
router.get('/category/:categoryId', protectAdmin, getCategoryPageByCategory);

router.post('/:id/hero-image', protectAdmin, uploadLimiter, heroImageUploader, updateHeroImage);
router.post('/:id/problems/:problemId/icon', protectAdmin, uploadLimiter, iconUploader, updateProblemIcon);

// CRUD
router.post('/', protectAdmin, createCategoryPage);
router.get('/', getPublishedCategoryPages);
router.get('/:id', protectAdmin, getCategoryPageById);
router.put('/:id', protectAdmin, updateCategoryPage);
router.delete('/:id', protectAdmin, deleteCategoryPage);

module.exports = router;

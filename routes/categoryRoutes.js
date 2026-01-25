const express = require('express');
const {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  addSubCategory,
  updateCategoryImage,
  updateCategoryBanner
} = require('../controllers/categoryController.js');
const { protectAdmin } = require('../middlewares/authMiddleware.js');
const { uploadLimiter, singleUploader } = require('../middlewares/azureUploads.js');

const router = express.Router();

const categoryImageUploader = singleUploader(['image/jpeg', 'image/png'], 'categoryImage');
const categoryBannerUploader = singleUploader(['image/jpeg', 'image/png'], 'categoryBanner');

router.post('/', protectAdmin, createCategory);
router.post('/:id/category-image', 
  protectAdmin,
  uploadLimiter,
  categoryImageUploader,
  updateCategoryImage
);

router.post('/:id/add-banner',
  protectAdmin, 
  uploadLimiter,
  categoryBannerUploader,
  updateCategoryBanner
);

router.put('/:id/add-subcategory',protectAdmin, addSubCategory);
router.get('/', getCategories);
router.get('/:id', getCategoryById);
router.put('/:id',protectAdmin, updateCategory);
router.delete('/:id',protectAdmin, deleteCategory);



module.exports =  router;

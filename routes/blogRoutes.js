const express = require('express');
const router = express.Router();
const {
  getAllBlogs,
  getBlogById,
  getBlogBySlug,
  createBlog,
  updateBlog,
  deleteBlog,
  updateBlogImage,
} = require('../controllers/blogController');
const { singleUploader } = require('../middlewares/azureUploads.js');
const {
  createTag,
  getAllTags,
  updateTag,
  deleteTag,
  createCategory,
  getAllCategories,
  updateCategory,
  deleteCategory,
} = require('../controllers/blogMetaController');

const profileImageUploader = singleUploader(['image/jpeg', 'image/png'], 'blogImage');

// Specific static paths first (before wildcard /:id routes)
router.get('/tags', getAllTags);
router.post('/tags', createTag);
router.put('/tags/:id', updateTag);
router.delete('/tags/:id', deleteTag);
router.get('/categories', getAllCategories);
router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

// Blog image upload
router.post('/:id/blog-image', profileImageUploader, updateBlogImage);

// CRUD
router.get('/', getAllBlogs);
router.post('/', createBlog);
router.get('/id/:id', getBlogById);
router.put('/:id', updateBlog);
router.delete('/:id', deleteBlog);

// Public slug lookup (wildcard — must be last)
router.get('/:slug', getBlogBySlug);

module.exports = router;

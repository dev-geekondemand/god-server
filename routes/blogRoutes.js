const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  getAllBlogs,
  getBlogBySlug,
  addComment,
  // toggleCommentLike,
  replyToComment,
  importBlogs,
  updateBlogImage,
} = require('../controllers/blogController');
const {singleUploader, uploadLimiter} = require('../middlewares/azureUploads.js');
const {
  createTag,
  getAllTags,
  createCategory,
  getAllCategories,
} = require('../controllers/blogMetaController');

// const { protect } = require('../middlewares/authMiddleware');
// const { protectAdmin } = require('../middlewares/adminMiddleware');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, "blogs.xlsx"),
});
const upload = multer({ storage });

// Route to handle Excel upload and insertion
router.post(
  "/bulk-upload",
  // protectAdmin,
  upload.single("file"),
  importBlogs
);

const profileImageUploader = singleUploader(['image/jpeg', 'image/png'], 'blogImage');

router.post('/:id/blog-image', 
  profileImageUploader,
  updateBlogImage
);

// Public
router.get('/', getAllBlogs);
router.get('/:slug', getBlogBySlug);

// Comments
router.post('/:blogId/comment',  addComment);
// router.put('/:blogId/comment/:commentId/like',  toggleCommentLike);
router.post('/:blogId/comment/:commentId/reply',  replyToComment);

// Tags / Categories
router.post('/tags', createTag);
router.get('/tags', getAllTags);
router.post('/categories',  createCategory);
router.get('/categories', getAllCategories);

module.exports = router;

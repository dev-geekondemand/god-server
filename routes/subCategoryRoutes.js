const express = require('express');
const {
  createSubCategory,
  getSubCategories,
  getSubCategoryById,
  updateSubCategory,
  deleteSubCategory
} = require('../controllers/subCategoryController.js');

const { protectAdmin } = require('../middlewares/authMiddleware.js');
const { bulkUploadSubCategories } = require("../controllers/subCategoryController");
const multer = require('multer');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, "subcategories.xlsx"),
});
const upload = multer({ storage });

// Route to handle Excel upload and insertion
router.post(
  "/bulk-upload",
  protectAdmin,
  upload.single("file"),
  bulkUploadSubCategories
);

router.post('/',protectAdmin, createSubCategory);
router.get('/', getSubCategories);
router.get('/:id', getSubCategoryById);
router.put('/:id',protectAdmin, updateSubCategory);
router.delete('/:id',protectAdmin, deleteSubCategory);


module.exports =  router;

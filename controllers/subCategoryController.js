const SubCategory = require('../models/subCategory.js');
const asyncHandler = require('express-async-handler');
const Category = require('../models/serviceCategory.js');
const XLSX = require("xlsx");
const slugify = require("slugify");
const fs = require("fs");
const path = require("path");
const validateMongodbId = require('../utils/validateMongodbId.js');

const generateSlug = (text) =>
    slugify(text, { lower: true, strict: true });




const bulkUploadSubCategories = asyncHandler(async (req, res) => {
  const filePath = path.join(__dirname, "../uploads/subcategories.xlsx");

  if (!fs.existsSync(filePath)) {
    return res.status(400).json({ message: "Excel file not found." });
  }

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const results = [];
  for (let row of rows) {
    const parentTitle = row["Parent Category"];
    const issueTitle = row["Sub Category"];
    if (
        parentTitle?.toLowerCase() === "parent category" ||
        issueTitle?.toLowerCase() === "common issues"
      ) {
        continue;
      }
    if (!parentTitle || !issueTitle) continue;

    const parentCategory = await Category.findById(parentTitle);
    
    if (!parentCategory) {
      results.push({ issueTitle, status: "failed", reason: "Parent category not found" });
      continue;
    }

    const slug = slugify(issueTitle, { lower: true });

    // Check if subcategory already exists
    const exists = await SubCategory.findOne({ title: issueTitle.trim() });
    if (exists) {
      results.push({ issueTitle, status: "skipped", reason: "Already exists" });
      continue;
    }

    const subCat = await SubCategory.create({
      title: issueTitle.trim(),
      slug,
      parentCategory: parentCategory._id,
    });

    await Category.findByIdAndUpdate(parentCategory._id, {
      $addToSet: { subCategories: subCat._id },
    });

    results.push({ issueTitle, status: "created", id: subCat._id });
  }

  res.status(200).json({
    message: "Upload completed",
    summary: results,
  });
});







// Create
 const createSubCategory = asyncHandler(async (req, res) => {
  const { title, parentCategory } = req.body;
  if (!title ) {
    return res.status(400).json({ message: 'Title is required' });
  }

  const slug = generateSlug(title);
  const existing = await SubCategory.findOne({ slug });
  if (existing) return res.status(400).json({ message: 'SubCategory already exists' });

  const subCategory = await SubCategory.create({ title, slug, parentCategory });

  // Optional: Push subcategory into parent Category
  await Category.findByIdAndUpdate(parentCategory, {
    $addToSet: { subCategories: subCategory._id }
  });

  res.status(201).json(subCategory);
});

// Get All
 const getSubCategories = asyncHandler(async (req, res) => {
  const subCategories = await SubCategory.find().populate('parentCategory');
  res.status(200).json(subCategories);
});

// Get One
 const getSubCategoryById = asyncHandler(async (req, res) => {
    validateMongodbId(req.params.id);
  const subCategory = await SubCategory.findById(req.params.id).populate('parentCategory');
  if (!subCategory) return res.status(404).json({ message: 'SubCategory not found' });
  res.status(200).json(subCategory);
});

// Update
 const updateSubCategory = asyncHandler(async (req, res) => {
    validateMongodbId(req.params.id);
  const { title, parentCategory } = req.body;
  const subCategory = await SubCategory.findById(req.params.id);
  if (!subCategory) return res.status(404).json({ message: 'SubCategory not found' });

  if (title) {
    subCategory.title = title;
    subCategory.slug = generateSlug(title);
  }
  if (parentCategory) {
    subCategory.parentCategory = parentCategory;
  }

  await subCategory.save();
  res.status(200).json(subCategory);
});

// Delete
 const deleteSubCategory = asyncHandler(async (req, res) => {
    validateMongodbId(req.params.id);
  const subCategory = await SubCategory.findByIdAndDelete(req.params.id);
  if (!subCategory) return res.status(404).json({ message: 'SubCategory not found' });

  // Optional: Remove from parent category
  await Category.findByIdAndUpdate(subCategory.parentCategory, {
    $pull: { subCategories: subCategory._id }
  });

  res.status(200).json({ message: 'SubCategory deleted' });
});

module.exports = {
  createSubCategory,
  getSubCategories,
  getSubCategoryById,
  updateSubCategory,
  deleteSubCategory,
  bulkUploadSubCategories
};
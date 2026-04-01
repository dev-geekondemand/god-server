const BlogTag = require('../models/blogTagModel');
const BlogCategory = require('../models/blogCatModel');
const slugify = require('slugify');
const asyncHandler = require('express-async-handler');

// Tags
const createTag = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const tag = await BlogTag.create({ name, slug: slugify(name, { lower: true, strict: true }) });
  res.status(201).json(tag);
});

const getAllTags = asyncHandler(async (req, res) => {
  const tags = await BlogTag.find();
  res.json(tags);
});

const updateTag = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const tag = await BlogTag.findByIdAndUpdate(
    id,
    { name, slug: slugify(name, { lower: true, strict: true }) },
    { new: true }
  );
  if (!tag) return res.status(404).json({ message: 'Tag not found' });
  res.json(tag);
});

const deleteTag = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await BlogTag.findByIdAndDelete(id);
  res.json({ message: 'Tag deleted' });
});

// Categories
const createCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const category = await BlogCategory.create({ name, slug: slugify(name, { lower: true, strict: true }) });
  res.status(201).json(category);
});

const getAllCategories = asyncHandler(async (req, res) => {
  const categories = await BlogCategory.find();
  res.json(categories);
});

const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const category = await BlogCategory.findByIdAndUpdate(
    id,
    { name, slug: slugify(name, { lower: true, strict: true }) },
    { new: true }
  );
  if (!category) return res.status(404).json({ message: 'Category not found' });
  res.json(category);
});

const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await BlogCategory.findByIdAndDelete(id);
  res.json({ message: 'Category deleted' });
});

module.exports = {
  createTag,
  getAllTags,
  updateTag,
  deleteTag,
  createCategory,
  getAllCategories,
  updateCategory,
  deleteCategory,
};

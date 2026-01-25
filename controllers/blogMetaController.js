const BlogTag = require('../models/blogTagModel');
const BlogCategory = require('../models/blogCatModel');
const slugify = require('slugify');
const asyncHandler = require('express-async-handler');

// Tags
const createTag = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const tag = await BlogTag.create({ name, slug: slugify(name) });
  res.status(201).json(tag);
});

const getAllTags = asyncHandler(async (req, res) => {
  const tags = await BlogTag.find();
  res.json(tags);
});

// Categories
const createCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const category = await BlogCategory.create({ name, slug: slugify(name) });
  res.status(201).json(category);
});

const getAllCategories = asyncHandler(async (req, res) => {
  const categories = await BlogCategory.find();
  res.json(categories);
});

module.exports = {
  createTag,
  getAllTags,
  createCategory,
  getAllCategories,
};

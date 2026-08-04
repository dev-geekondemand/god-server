const CategoryPage = require('../models/categoryPage.js');
const Category = require('../models/serviceCategory.js');
const asyncHandler = require('express-async-handler');
const validateMongodbId = require('../utils/validateMongodbId.js');
const slugify = require('slugify');
const { uploadToAzure } = require('../middlewares/azureUploads.js');
const { generateSasUrl, deleteFromAzure } = require('../utils/azureBlob.js');
const { handleMongoError } = require('../utils/handleMongoError.js');

const generateSlug = (text) => slugify(text, { lower: true, strict: true });

const resolveIconUrl = async (icon) => {
  if (icon?.public_id) {
    icon.url = await generateSasUrl(icon.public_id);
  }
};

const resolveCategoryPageImages = async (page) => {
  await resolveIconUrl(page.hero?.image);
  await resolveIconUrl(page.category?.smallBanner);
  if (page.problems?.length) {
    await Promise.all(page.problems.map((p) => resolveIconUrl(p.icon)));
  }
  return page;
};

// Create Category Page
const createCategoryPage = asyncHandler(async (req, res) => {
  const { category, slug: customSlug, hero, seo, problems, faqs, isPublished } = req.body;

  if (!category || !hero?.title) {
    return res.status(400).json({ message: 'Category and hero title are required' });
  }

  const categoryDoc = await Category.findById(category);
  if (!categoryDoc) return res.status(404).json({ message: 'Category not found' });

  const existing = await CategoryPage.findOne({ category });
  if (existing) return res.status(400).json({ message: 'This category already has a page' });

  const slug = generateSlug(customSlug || hero.title);

  try {
    const page = await CategoryPage.create({
      category,
      slug,
      hero,
      seo,
      problems,
      faqs,
      isPublished,
    });
    res.status(201).json(page);
  } catch (error) {
    const { status, message } = handleMongoError(error);
    res.status(status).json({ message });
  }
});

// Get all category pages (admin — includes unpublished)
const getAllCategoryPages = asyncHandler(async (req, res) => {
  const pages = await CategoryPage.find().populate('category', 'title slug smallBanner').sort({ createdAt: -1 }).lean();
  const updated = await Promise.all(pages.map(resolveCategoryPageImages));
  res.status(200).json(updated);
});

// Get published category pages (public — used by sitemap/listing)
const getPublishedCategoryPages = asyncHandler(async (req, res) => {
  const pages = await CategoryPage.find({ isPublished: true }).populate('category', 'title slug smallBanner').sort({ createdAt: -1 }).lean();
  const updated = await Promise.all(pages.map(resolveCategoryPageImages));
  res.status(200).json(updated);
});

// Get single category page by id (admin)
const getCategoryPageById = asyncHandler(async (req, res) => {
  validateMongodbId(req.params.id);
  const page = await CategoryPage.findById(req.params.id).populate('category', 'title slug smallBanner').lean();
  if (!page) return res.status(404).json({ message: 'Category page not found' });
  await resolveCategoryPageImages(page);
  res.status(200).json(page);
});

// Get category page by category id (admin)
const getCategoryPageByCategory = asyncHandler(async (req, res) => {
  validateMongodbId(req.params.categoryId);
  const page = await CategoryPage.findOne({ category: req.params.categoryId }).lean();
  if (!page) return res.status(404).json({ message: 'No page found for this category' });
  await resolveCategoryPageImages(page);
  res.status(200).json(page);
});

// Get category page by slug (public)
const getCategoryPageBySlug = asyncHandler(async (req, res) => {
  const page = await CategoryPage.findOne({ slug: req.params.slug, isPublished: true })
    .populate('category', 'title slug smallBanner')
    .lean();
  if (!page) return res.status(404).json({ message: 'Category page not found' });
  await resolveCategoryPageImages(page);
  res.status(200).json(page);
});

// Update category page
const updateCategoryPage = asyncHandler(async (req, res) => {
  validateMongodbId(req.params.id);
  const page = await CategoryPage.findById(req.params.id);
  if (!page) return res.status(404).json({ message: 'Category page not found' });

  const { slug: customSlug, hero, seo, problems, faqs, isPublished } = req.body;

  if (hero !== undefined) {
    page.hero = { ...page.hero.toObject(), ...hero, image: page.hero.image };
  }
  if (customSlug) page.slug = generateSlug(customSlug);
  if (seo !== undefined) page.seo = seo;
  if (problems !== undefined) page.problems = problems;
  if (faqs !== undefined) page.faqs = faqs;
  if (isPublished !== undefined) page.isPublished = isPublished;

  try {
    await page.save();
    const populated = await CategoryPage.findById(page._id).populate('category', 'title slug');
    res.status(200).json(populated);
  } catch (error) {
    const { status, message } = handleMongoError(error);
    res.status(status).json({ message });
  }
});

// Delete category page
const deleteCategoryPage = asyncHandler(async (req, res) => {
  validateMongodbId(req.params.id);
  const page = await CategoryPage.findById(req.params.id);
  if (!page) return res.status(404).json({ message: 'Category page not found' });

  const cleanupTasks = [];
  if (page.hero?.image?.public_id) cleanupTasks.push(deleteFromAzure(page.hero.image.public_id));
  page.problems?.forEach((p) => {
    if (p.icon?.public_id) cleanupTasks.push(deleteFromAzure(p.icon.public_id));
  });
  await Promise.all(cleanupTasks);

  await CategoryPage.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: 'Category page deleted' });
});

// Upload/replace hero image
const updateHeroImage = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ message: 'No image uploaded.' });

  validateMongodbId(req.params.id);
  const page = await CategoryPage.findById(req.params.id);
  if (!page) return res.status(404).json({ message: 'Category page not found' });

  if (page.hero?.image?.public_id) {
    await deleteFromAzure(page.hero.image.public_id);
  }

  const image = await uploadToAzure(file);
  page.hero.image = image;
  await page.save();

  res.status(200).json({ message: 'Hero image updated.', image });
});

// Upload/replace a problem's icon
const updateProblemIcon = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ message: 'No icon uploaded.' });

  validateMongodbId(req.params.id);
  const page = await CategoryPage.findById(req.params.id);
  if (!page) return res.status(404).json({ message: 'Category page not found' });

  const problem = page.problems.id(req.params.problemId);
  if (!problem) return res.status(404).json({ message: 'Problem item not found' });

  if (problem.icon?.public_id) await deleteFromAzure(problem.icon.public_id);

  const icon = await uploadToAzure(file);
  problem.icon = icon;
  await page.save();

  res.status(200).json({ message: 'Problem icon updated.', icon });
});

module.exports = {
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
};

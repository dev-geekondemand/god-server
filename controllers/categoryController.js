const Category = require('../models/serviceCategory.js');
const asyncHandler = require('express-async-handler');
const  validateMongodbId  = require('../utils/validateMongodbId.js');
const SubCategory = require('../models/subCategory.js');
const slugify = require('slugify');
const { uploadToAzure } = require('../middlewares/azureUploads.js');
const { generateSasUrl,deleteFromAzure } = require('../utils/azureBlob.js');





const generateSlug = (text) =>
  slugify(text, { lower: true, strict: true });


// Create Category
const createCategory = asyncHandler(async (req, res) => {
    const { title, subCategories } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });
  
    const slug = generateSlug(title);
    const existing = await Category.findOne({ slug });
    if (existing) return res.status(400).json({ message: 'Category already exists' });
  
    const category = await Category.create({ title, slug, subCategories });

  
    // ✅ Fix: Set the parentCategory on each SubCategory
    if (subCategories && subCategories.length > 0) {
      for (let subId of subCategories) {
        await SubCategory.findByIdAndUpdate(subId, {
          $set: { parentCategory: category._id }
        });
      }
    }
  
    res.status(201).json(category);
  });
  

// Get All Categories
 const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find().populate('subCategories').sort({ priority: 1, name: 1 }).lean();;
  const updatedCategories = await Promise.all(categories.map(async (cat) => {
    if (cat.image && cat.image.public_id) {
      cat.image.url = await generateSasUrl(cat.image.public_id);
    }
    if(cat.smallBanner && cat.smallBanner.public_id) {
      cat.smallBanner.url = await generateSasUrl(cat.smallBanner.public_id);
    }
    return cat;
  }));
  res.status(200).json(updatedCategories);
});

// Get Single Category
 const getCategoryById = asyncHandler(async (req, res) => {
  validateMongodbId(req.params.id);
  const category = await Category.findById(req.params.id).populate('subCategories');
  if (!category) return res.status(404).json({ message: 'Category not found' });
  res.status(200).json(category);
});

// Update Category
 const updateCategory = asyncHandler(async (req, res) => {
  const { title,subCategories } = req.body;
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ message: 'Category not found' });

  if (title) {
    category.title = title;
    category.slug = generateSlug(title);
  }
  if (subCategories) {
    category.subCategories = subCategories;
  }

  await category.save();
  res.status(200).json(category);
});

const addSubCategory = asyncHandler(async (req, res) => {
  const { subCat } = req.body;
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ message: 'Category not found' });

  if(category.subCategories.includes(subCat)) return res.status(400).json({ message: 'SubCategory already exists' });

  category.subCategories.push(subCat);
  await category.save();

  await SubCategory.findByIdAndUpdate(subCat, {
    $set: { parentCategory: category._id }
  });
  res.status(200).json(category);
});

// Delete Category
 const deleteCategory = asyncHandler(async (req, res) => {
    validateMongodbId(req.params.id);

  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ message: 'Category not found' });

  // Optional: Remove subcategories
  if (category.subCategories.length > 0) {
    await Category.deleteMany({ _id: { $in: category.subCategories } });
    await SubCategory.deleteMany({ _id: { $in: category.subCategories } });
  }
  await Category.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: 'Category deleted' });
});

const updateCategoryImage = asyncHandler(async (req, res) => {
  const file = req.file;
  const catId = req.params.id;

  if (!file) {
    res.status(400);
    throw new Error("No image uploaded");
  }

  // 1️⃣ Check category exists
  const category = await Category.findById(catId);

  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }

  try {
    // 2️⃣ Delete old image (if exists)
    if (category.image?.public_id) {
      await deleteFromAzure(category.image.public_id);
    }

    // 3️⃣ Upload new image
    const image = await uploadToAzure(file);

    // 4️⃣ Update DB
    category.image = image;
    await category.save();

    res.status(200).json({
      message: "Category image updated successfully",
      image,
    });

  } catch (error) {
    console.error("Category image update failed:", error);

    res.status(500);
    throw new Error("Failed to update category image");
  }
});


 const updateCategoryBanner = asyncHandler(async (req, res) => {
    const file = req.file;
    const catId = req.params.id;

    if (!file) return res.status(400).json({ message: 'No image uploaded.' });

    const image = await uploadToAzure(file); // since your uploadToAzure expects the file object

    await Category.findByIdAndUpdate(catId, { smallBanner: image });

    res.status(200).json({ message: 'Category banner updated.', image });
  
});


module.exports = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  addSubCategory,
  updateCategoryImage,
  updateCategoryBanner
};

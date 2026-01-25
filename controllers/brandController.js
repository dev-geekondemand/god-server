const Brand = require('../models/brandModel.js');
const asyncHandler = require('express-async-handler');
const validateMongodbId = require('../utils/validateMongodbId.js');
const slugify = require('slugify');
const Category = require('../models/serviceCategory.js');
const XLSX = require('xlsx');
const path = require('path');
const fs = require("fs");
const unzipper = require('unzipper');
const sharp = require('sharp');
const {uploadToAzure} = require('../middlewares/azureUploads.js');
const {generateSasUrl,deleteFromAzure} = require('../utils/azureBlob.js');

const uploadBrandsExcel = asyncHandler(async (req, res) => {
  const filePath = path.join(__dirname, "../uploads/brands.xlsx");

  if (!fs.existsSync(filePath)) {
    return res.status(400).json({ message: "Excel file not found." });
  }

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const results = [];

  // First row = category IDs
  const categoryIds = data[0].filter(Boolean);

  for (let col = 0; col < categoryIds.length; col++) {
    const categoryId = categoryIds[col];

    // Check if valid ObjectId and category exists
    const category = await Category.findById(categoryId);
    if (!category) {
      results.push({ categoryId, status: "failed", reason: "Invalid Category ID" });
      continue;
    }

    for (let row = 1; row < data.length; row++) {
      const rawBrandName = data[row][col];
      if (!rawBrandName || typeof rawBrandName !== "string") continue;

      const brandName = rawBrandName.trim();
      let baseSlug = slugify(brandName, { lower: true });
      let slug = baseSlug;

      // Avoid duplicate brand names or slugs
      const existing = await Brand.findOne({
        $or: [{ name: brandName }, { slug }],
      });

      if (existing) {
        results.push({ brand: brandName, status: "skipped", reason: "Already exists" });
        continue;
      }

      // Ensure slug uniqueness by appending counter if needed
      let counter = 1;
      while (await Brand.findOne({ slug })) {
        slug = `${baseSlug}-${counter++}`;
      }

      const newBrand = await Brand.create({
        name: brandName,
        slug,
        category: category._id,
      });

      results.push({ brand: brandName, status: "created", id: newBrand._id });
    }
  }

  res.status(200).json({
    message: "Brand upload completed",
    summary: results,
  });
});



const createBrand = asyncHandler(async (req, res) => {
    if (req.body.name) {
        req.body.slug = slugify(req.body.name);
    }
    console.log("Request Body:", req.body);
    if(!req.body.categoryId){
      return res.status(400).json({message:"Category is required"});
    }
    validateMongodbId(req.body.categoryId);
    const category = await Category.findById(req.body.categoryId);
    if(!category){
      return res.status(404).json({message:"Category not found"});
    }
   const newBrand = await Brand.create({
      name: req.body.name,
      slug: req.body.slug,
      category: category._id,
   });
    res.status(201).json(newBrand);
});

const getBrands = asyncHandler(async (req, res) => {
  try {
    const brands = await Brand.find().populate("category");
    

    // Generate SAS URLs for all brands with an image
    const brandsWithSas = await Promise.all(
      brands.map(async (brand) => {
        if (brand.image?.public_id) {
        
          try {
            const blobName = brand.image.public_id;
            brand.image.url = await generateSasUrl(blobName); // overwrite URL with SAS
          } catch (err) {
            console.error("Failed to generate SAS URL for:", brand._id, err.message);
            // Optionally keep the original URL or set null
            brand.image.url = brand.image.url || null;
          }
        }
        return brand;
      })
    );

    res.status(200).json(brandsWithSas);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


const getBrandById = asyncHandler(async (req, res) => {
    validateMongodbId(req.params.id);
    const brand = await Brand.findById(req.params.id).populate('category');
    res.status(200).json(brand);
});

const updateBrand = asyncHandler(async (req, res) => {
    validateMongodbId(req.params.id);
    if (req.body.name) {
        req.body.slug = slugify(req.body.name);
    }
    if(req.body.categoryId){
      validateMongodbId(req.body.categoryId);
      const category = await Category.findById(req.body.categoryId);
      if(!category){
        return res.status(404).json({message:"Category not found"});
      }
      req.body.category = category._id;
    }
    const updatedBrand = await Brand.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.status(200).json(updatedBrand);
});

const deleteBrand = asyncHandler(async (req, res) => {
    validateMongodbId(req.params.id);
    const deletedBrand = await Brand.findByIdAndDelete(req.params.id);
    res.status(200).json(deletedBrand);
});


const getBrandsByCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;

  // Validate if the category exists
  const category = await Category.findById(categoryId);
  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }

  const brands = await Brand.find({ category: categoryId }).sort({ name: 1 }).populate('category'); // Alphabetical

  for(let i = 0; i < brands.length; i++){
    if(brands[i].image?.public_id){
      const blobName = brands[i].image.public_id;
      const sasUrl = await generateSasUrl(blobName);
      brands[i].image.url = sasUrl;
    }
  }

  res.status(200).json({
    category: {
      id: category._id,
      name: category.title || category.name,
    },
    count: brands.length,
    brands,
  });
});

const updateBrandImage = asyncHandler(async (req, res) => {
  const file = req.file;
  const brandId = req.params.id;

  if (!file) {
    res.status(400);
    throw new Error("No image uploaded");
  }

  // 1️⃣ Check category exists
  const brand = await Brand.findById(brandId);

  if (!brand) {
    res.status(404);
    throw new Error("Brand not found");
  }

  try {
    // 2️⃣ Delete old image (if exists)
    if (brand.image?.public_id) {
      await deleteFromAzure(brand.image.public_id);
    }

    // 3️⃣ Upload new image
    const image = await uploadToAzure(file);

    // 4️⃣ Update DB
    brand.image = image;
    await brand.save();

    res.status(200).json({
      message: "Brand image updated successfully",
      image,
    });

  } catch (error) {
    console.error("Brand image update failed:", error);

    res.status(500);
    throw new Error("Failed to update brand image");
  }
});

const uploadBrandImagesFromZip = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "ZIP file is required" });
  }

  const zipBuffer = req.file.buffer;
  const directory = await unzipper.Open.buffer(zipBuffer);

  // 1️⃣ Fetch all brands once
  const brands = await Brand.find().select("_id slug image");
  const brandMap = new Map(brands.map((b) => [b.slug, b]));

  const bulkOps = [];
  const results = [];

  for (const file of directory.files) {
    if (file.type !== "File") continue;

    const ext = path.extname(file.path).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;

    const slug = path.basename(file.path, ext);

    const brand = brandMap.get(slug);
    if (!brand) {
      results.push({
        slug,
        status: "skipped",
        reason: "Brand not found",
      });
      continue;
    }

    // Skip if image already exists
    if (brand.image?.public_id) {
      results.push({
        slug,
        status: "skipped",
        reason: "Image already exists",
      });
      continue;
    }

    const buffer = await file.buffer();

    // Optional: resize / optimize
    const optimizedBuffer = await sharp(buffer)
      .resize(800, 800, { fit: "inside" })
      .toBuffer();

    // Upload to Azure → "brands" folder
    const uploaded = await uploadToAzure(
      {
        buffer: optimizedBuffer,
        originalname: file.path,
        mimetype: `image/${ext.replace(".", "")}`,
      },
      "brands"
    );

    // Ensure image field is an object
    bulkOps.push({
      updateOne: {
        filter: { _id: brand._id },
        update: {
          $set: {
            image: {
              public_id: uploaded.public_id,
              url: uploaded.url,
            },
          },
        },
      },
    });

    results.push({
      slug,
      status: "uploaded",
      image: {
        public_id: uploaded.public_id,
        url: uploaded.url,
      },
    });
  }

  if (bulkOps.length) {
    await Brand.bulkWrite(bulkOps);
  }

  res.status(200).json({
    message: "Brand images uploaded from ZIP successfully",
    updated: bulkOps.length,
    summary: results,
  });
});



module.exports = { createBrand,updateBrandImage,uploadBrandImagesFromZip, getBrands, getBrandById, updateBrand, deleteBrand,uploadBrandsExcel, getBrandsByCategory };
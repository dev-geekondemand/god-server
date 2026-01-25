import Category from '../models/serviceCategory.js';
import Tag from '../models/serviceTag.js';
import Brand from '../models/Brand.js';
import asyncHandler from 'express-async-handler';

export const getFilterOptions = asyncHandler(async (req, res) => {
  const [categories, tags, brands] = await Promise.all([
    Category.find().select('name slug _id'),
    Tag.find().select('name slug _id'),
    Brand.find().select('name _id')
  ]);

  res.status(200).json({
    categories,
    tags,
    brands
  });
});

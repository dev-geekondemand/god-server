const Blog = require('../models/blogModel');
const asyncHandler = require('express-async-handler');
const slugify = require('slugify');
const { uploadToAzure } = require('../middlewares/azureUploads');
const { generateSasUrl } = require('../utils/azureBlob');
const { handleMongoError } = require('../utils/handleMongoError');

// Create blog
const createBlog = asyncHandler(async (req, res) => {
  const { title, description, summary, author, tags, categories, seo, isPublished } = req.body;
  if (!title || !description || !summary) {
    return res.status(400).json({ message: 'Title, description and summary are required' });
  }

  const slug = slugify(title, { lower: true, strict: true });
  const blog = await Blog.create({
    title,
    slug,
    description,
    summary,
    author,
    tags,
    categories,
    seo,
    isPublished,
    publishedAt: isPublished ? new Date() : null,
  });

  res.status(201).json(blog);
});

// Update blog
const updateBlog = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, summary, author, tags, categories, seo, isPublished } = req.body;

  const update = {
    ...(title && { title, slug: slugify(title, { lower: true, strict: true }) }),
    ...(description !== undefined && { description }),
    ...(summary !== undefined && { summary }),
    ...(author !== undefined && { author }),
    ...(tags !== undefined && { tags }),
    ...(categories !== undefined && { categories }),
    ...(seo !== undefined && { seo }),
    ...(isPublished !== undefined && {
      isPublished,
      publishedAt: isPublished ? new Date() : null,
    }),
  };

  const updated = await Blog.findByIdAndUpdate(id, update, { new: true })
    .populate('tags')
    .populate('categories');
  res.status(200).json(updated);
});

// Delete blog
const deleteBlog = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await Blog.findByIdAndDelete(id);
  res.status(200).json({ message: 'Blog deleted' });
});

// Get all blogs (admin)
const getAllBlogs = asyncHandler(async (req, res) => {
  const blogs = await Blog.find().populate('tags').populate('categories');
  for (let i = 0; i < blogs.length; i++) {
    if (blogs[i].coverImage?.public_id) {
      const sasUrl = await generateSasUrl(blogs[i].coverImage.public_id);
      blogs[i].coverImage.url = sasUrl;
    }
  }
  res.status(200).json(blogs);
});

// Get blog by ID (admin)
const getBlogById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const blog = await Blog.findById(id).populate('tags').populate('categories');
  if (!blog) return res.status(404).json({ message: 'Blog not found' });
  if (blog.coverImage?.public_id) {
    const sasUrl = await generateSasUrl(blog.coverImage.public_id);
    blog.coverImage.url = sasUrl;
  }
  res.status(200).json(blog);
});

// Get blog by slug (public)
const getBlogBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const blog = await Blog.findOne({ slug, isPublished: true })
    .populate('tags')
    .populate('categories');
  if (!blog) return res.status(404).json({ message: 'Blog not found' });
  if (blog.coverImage?.public_id) {
    const sasUrl = await generateSasUrl(blog.coverImage.public_id);
    blog.coverImage.url = sasUrl;
  }
  res.status(200).json(blog);
});

const updateBlogImage = asyncHandler(async (req, res) => {
  try {
    const file = req.file;
    const blogId = req.params.id;

    if (!file) return res.status(400).json({ message: 'No image uploaded.' });

    const blog = await Blog.findById(blogId);
    if (!blog) return res.status(404).json({ message: 'Blog not found.' });

    const imageUrl = await uploadToAzure(file);
    blog.coverImage = imageUrl;
    await blog.save();

    res.status(200).json({ message: 'Blog image updated.', imageUrl });
  } catch (error) {
    const { status, message } = handleMongoError(error);
    res.status(status).json({ message });
  }
});

module.exports = {
  createBlog,
  updateBlog,
  deleteBlog,
  getAllBlogs,
  getBlogById,
  getBlogBySlug,
  updateBlogImage,
};

const Blog = require('../models/blogModel');
const asyncHandler = require('express-async-handler');
const slugify = require('slugify');
const XLSX = require("xlsx");
// const slugify = require("slugify");
const fs = require("fs");
const path = require("path");
const { uploadToAzure } = require('../middlewares/azureUploads');
const { generateSasUrl, deleteFromAzure } = require('../utils/azureBlob');


// Create blog
const createBlog = asyncHandler(async (req, res) => {
  const { title, content, tags, isPublished } = req.body;
  if (!title || !content) {
    return res.status(400).json({ message: 'Title and content are required' });
  }

  const slug = slugify(title, { lower: true, strict: true });
  const blog = await Blog.create({
    title,
    slug,
    content,
    tags,
    isPublished,
    publishedAt: isPublished ? new Date() : null,
  });

  res.status(201).json(blog);
});

// Update blog
const updateBlog = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, content, tags, isPublished } = req.body;

  const update = {
    ...(title && { title, slug: slugify(title, { lower: true, strict: true }) }),
    ...(content && { content }),
    ...(tags && { tags }),
    ...(isPublished !== undefined && {
      isPublished,
      publishedAt: isPublished ? new Date() : null,
    }),
  };

  const updated = await Blog.findByIdAndUpdate(id, update, { new: true });
  res.status(200).json(updated);
});



// Delete blog
const deleteBlog = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await Blog.findByIdAndDelete(id);
  res.status(200).json({ message: 'Blog deleted' });
});

// Get all published blogs
const getAllBlogs = asyncHandler(async (req, res) => {
  const blogs = await Blog.find();
  for(let i = 0; i < blogs.length; i++){
    if (blogs[i].coverImage?.public_id) {
      const blobName = blogs[i].coverImage?.public_id;
      const sasUrl = await generateSasUrl(blobName);
      blogs[i].coverImage.url = sasUrl;
    }
  }
  res.status(200).json(blogs);
});

// Get blog by slug
const getBlogBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const blog = await Blog.findOne({ slug, isPublished: true })
  if (!blog) return res.status(404).json({ message: 'Blog not found' });
    if (blog.coverImage?.public_id) {
        const blobName = blog.coverImage?.public_id;
        const sasUrl = await generateSasUrl(blobName);
        blog.coverImage.url = sasUrl;
    }
  res.status(200).json(blog);
});

const addComment = asyncHandler(async (req, res) => {
  const { blogId } = req.params;
  const { text } = req.body;
  const { _id, role, idProof } = req.user;

  if (role === 'Geek' && !idProof?.isAdhaarVerified) {
    return res.status(403).json({ message: 'Only verified geeks can comment' });
  }

  const blog = await Blog.findById(blogId);
  if (!blog) return res.status(404).json({ message: 'Blog not found' });

  blog.comments.push({
    text,
    postedBy: _id,
    userType: role,
  });

  await blog.save();
  res.status(200).json({ message: 'Comment added', comments: blog.comments });
});

const replyToComment = asyncHandler(async (req, res) => {
  const { blogId, commentId } = req.params;
  const { text } = req.body;
  const { _id, role } = req.user;

  const blog = await Blog.findById(blogId);
  const comment = blog.comments.id(commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found' });

  comment.replies.push({
    text,
    postedBy: _id,
    userType: role,
  });

  await blog.save();
  res.status(200).json({ message: 'Reply added', replies: comment.replies });
});


const importBlogs = asyncHandler(async (req, res) => {
  const filePath = path.join(__dirname, "../uploads/blogs.xlsx");

  if (!fs.existsSync(filePath)) {
    return res.status(400).json({ message: "Excel file not found." });
  }

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const results = [];

  for (let row of rows) {
    try {
      const title = row["Title"]?.trim();
      const slug = slugify(title, { lower: true, strict: true });
      const description = row["Description"]?.trim();
      const summary = row["Summary"]?.trim();

      const existingBlog = await Blog.findOne({ title });
      if (existingBlog) {
        results.push({ title, status: "skipped", reason: "Already exists" });
        continue;
      }

      const newBlog = await Blog.create({
        title,
        slug,
        description,
        summary,
      });

      results.push({ title, status: "created", id: newBlog._id });

    } catch (err) {
      results.push({
        title: row["Title"]?.toString() || "unknown",
        status: "error",
        reason: err.message,
      });
    }
  }

  res.status(200).json({
    message: "Upload completed",
    summary: results,
  });
});

const updateBlogImage = asyncHandler(async (req, res) => {
 try{

  const file = req.file;
  const blogId = req.params.id;

  if (!file) return res.status(400).json({ message: 'No image uploaded.' });

  // Fetch existing Geek data
  const blog = await Blog.findById(blogId);
  if (!blog) return res.status(404).json({ message: 'Blog not found.' });


  // Upload the new image
  const imageUrl = await uploadToAzure(file);

  // Update the Geek's profile image
  blog.coverImage = imageUrl;
  await blog.save();

  res.status(200).json({ message: 'Profile image updated.', imageUrl });
 }catch(error){
   res.status(500).json({ message: error.message });
 }
});


module.exports = {
  createBlog,
  updateBlog,
  deleteBlog,
  getAllBlogs,
  getBlogBySlug,
  addComment,
  replyToComment,
  importBlogs,
  updateBlogImage
};

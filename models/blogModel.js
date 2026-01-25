const mongoose = require('mongoose');

// const replySchema = new mongoose.Schema({
//   text: String,
//   postedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'userType' },
//   userType: { type: String, enum: ['Seeker', 'Geek'], required: true },
//   createdAt: { type: Date, default: Date.now },
// });

// const commentSchema = new mongoose.Schema({
//   text: String,
//   postedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'userType' },
//   userType: { type: String, enum: ['Seeker', 'Geek'], required: true },
//   likes: [{ type: mongoose.Schema.Types.ObjectId, refPath: 'userType' }],
//   replies: [replySchema],
//   createdAt: { type: Date, default: Date.now },
// });

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, required: true },
    coverImage: { public_id: String, url: String },
    summary: { type: String, required: true },
    author: { type: String, default: 'GoD Admin' },
    isPublished: { type: Boolean, default: true },
    publishedAt: Date,
    // comments: [commentSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Blog', blogSchema);

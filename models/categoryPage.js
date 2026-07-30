const mongoose = require('mongoose');

const iconSchema = new mongoose.Schema(
  {
    public_id: String,
    url: String,
  },
  { _id: false }
);

const problemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  icon: iconSchema,
});

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
  },
  { _id: false }
);

const locationKeywordSchema = new mongoose.Schema(
  {
    area: String,
    keyword: String,
  },
  { _id: false }
);

const categoryPageSchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    isPublished: { type: Boolean, default: true },
    hero: {
      badge: String,
      title: { type: String, required: true },
      subtitle: String,
      ctaText: { type: String, default: 'Book a Geek' },
      image: iconSchema,
      alt: String,
    },
    seo: {
      primaryKeyword: String,
      secondaryKeywords: [String],
      metaTitle: String,
      metaDescription: String,
      locationKeywords: [locationKeywordSchema],
      nearMeKeywords: [String],
      brandKeywords: [String],
    },
    problems: [problemSchema],
    faqs: [faqSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('CategoryPage', categoryPageSchema);

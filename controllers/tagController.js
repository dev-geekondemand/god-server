const Tag = require('../models/serviceTag.js');
const asyncHandler = require('express-async-handler');
const validateMongodbId = require('../utils/validateMongodbId.js');
const slugify = require('slugify');

const generateSlug = (title) => {
    return slugify(title, { lower: true, strict: true });
};

const getTags = asyncHandler(async (req, res) => {
    const tags = await Tag.find();
    res.status(200).json(tags);
});


const getTagById = asyncHandler(async (req, res) => {
    validateMongodbId(req.params.id);
    const tag = await Tag.findById(req.params.id);
    res.status(200).json(tag);
});


const updateTag = asyncHandler(async (req, res) => {
    validateMongodbId(req.params.id);
    if (req.body.title) {
        req.body.slug = generateSlug(req.body.title);
    }
    const updatedTag = await Tag.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.status(200).json(updatedTag);
});


const deleteTag = asyncHandler(async (req, res) => {
    validateMongodbId(req.params.id);
    const deletedTag = await Tag.findByIdAndDelete(req.params.id);
    res.status(200).json(deletedTag);
});

const createTag = asyncHandler(async (req, res) => {
    if (req.body.title) {
        req.body.slug = generateSlug(req.body.title);
    }
    const newTag = await Tag.create(req.body);
    res.status(201).json(newTag);
});


module.exports = {
    getTags,
    getTagById,
    updateTag,
    deleteTag,
    createTag
};
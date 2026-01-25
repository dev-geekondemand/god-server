const express = require('express');
const {createTag, getTags, getTagById, updateTag, deleteTag} = require('../controllers/tagController.js');
const { protectAdmin } = require('../middlewares/authMiddleware.js');

const router = express.Router();

router.post('/', protectAdmin, createTag);
router.get('/', getTags);
router.get('/:id', getTagById);
router.put('/:id',protectAdmin, updateTag);
router.delete('/:id',protectAdmin, deleteTag);

module.exports =  router;
const asyncHandler = require('express-async-handler');
const Ad = require('../models/adModel');
const { uploadToAzure } = require('../middlewares/azureUploads');

const createAd = asyncHandler(async (req, res) => {
    const file = req.file;
    try {
        const ad = await Ad.create(req.body);
        if(file){
            const uploadedImage = await uploadToAzure(file);
            ad.image.public_id = uploadedImage.public_id;
            ad.image.url = uploadedImage.url;
            await ad.save();
        } 
        res.status(201).json(ad);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

const getAllAds = asyncHandler(async (req, res) => {
    try {
        const ads = await Ad.find();
        res.status(200).json(ads);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

const getInnerAd = asyncHandler(async (req, res) => {
    try {
        const ad = await Ad.findById({type:"inner"});
        res.status(200).json(ad);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

const updateAd = asyncHandler(async (req, res) => {
    try {
        const ad = await Ad.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(ad);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

const deleteAd = asyncHandler(async (req, res) => {
    try {
        const ad = await Ad.findByIdAndDelete(req.params.id);
        res.status(200).json(ad);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

const getTopAds = asyncHandler(async (req, res) => {
    try {
        const ads = await Ad.find({type:"top"}).limit(3);
        res.status(200).json(ads);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = {
    createAd,
    getAllAds,
    getInnerAd,
    updateAd,
    deleteAd,
    getTopAds
}
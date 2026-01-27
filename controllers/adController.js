const asyncHandler = require('express-async-handler');
const Ad = require('../models/adModel').default;
const { uploadToAzure } = require('../middlewares/azureUploads');
const { generateSasUrl } = require('../utils/azureBlob');

const createAd = asyncHandler(async (req, res) => {
  const file = req.file;

  let image = {};
  if (file) {
    const uploadedImage = await uploadToAzure(file);
    image = {
      public_id: uploadedImage.public_id,
      url: uploadedImage.url,
    };
  }

  const ad = await Ad.create({
    ...req.body,
    image,
  });

  res.status(201).json(ad);
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
  const { placement } = req.query;

  const ad = await Ad.findOne({
    type: "inner",
    placement,
    ...activeFilter,
  }).sort({ createdAt: -1 });

  if (!ad) {
    return res.status(404).json({ message: "No inner ad found" });
  }

  res.status(200).json(ad);
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
  const ads = await Ad.find({
    type: "top",
  })
    .sort({ createdAt: -1 })
    .limit(3);

    for(let i = 0; i < ads.length; i++){
      if(ads[i].image?.public_id){
        if(ads[i].image.public_id){
          const blobName = ads[i].image.public_id;
          const sasUrl = await generateSasUrl(blobName);
          ads[i].image.url = sasUrl;
        }
      }
    }

  res.status(200).json(ads);
});


module.exports = {
    createAd,
    getAllAds,
    getInnerAd,
    updateAd,
    deleteAd,
    getTopAds
}
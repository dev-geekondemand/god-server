const asyncHandler = require('express-async-handler');
const Ad = require('../models/adModel').default;
const { uploadToAzure } = require('../middlewares/azureUploads');
const { generateSasUrl } = require('../utils/azureBlob');
const { handleMongoError } = require('../utils/handleMongoError');

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
  const ads = await Ad.find().sort({ createdAt: -1 });

  for (let i = 0; i < ads.length; i++) {
    if (ads[i].image?.public_id) {
      const sasUrl = await generateSasUrl(ads[i].image.public_id);
      ads[i].image.url = sasUrl;
    }
  }

  res.status(200).json(ads);
});

const getInnerAd = asyncHandler(async (req, res) => {
  const { placement } = req.query;

  const query = { type: "inner" };
  if (placement) query.placement = placement;

  const ads = await Ad.find(query).sort({ createdAt: -1 });

  for (let i = 0; i < ads.length; i++) {
    if (ads[i].image?.public_id) {
      const sasUrl = await generateSasUrl(ads[i].image.public_id);
      ads[i].image.url = sasUrl;
    }
  }

  res.status(200).json(ads);
});


const getAdById = asyncHandler(async (req, res) => {
    try {
        const ad = await Ad.findById(req.params.id);

        if (!ad) {
            return res.status(404).json({ message: 'Ad not found' });
        }

        if (ad.image?.public_id) {
            const sasUrl = await generateSasUrl(ad.image.public_id);
            ad.image.url = sasUrl;
        }

        res.status(200).json(ad);
    } catch (error) {
        const { status, message } = handleMongoError(error);
        res.status(status).json({ message });
    }
});

const updateAd = asyncHandler(async (req, res) => {
    try {
        const ad = await Ad.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(ad);
    } catch (error) {
        const { status, message } = handleMongoError(error);
        res.status(status).json({ message });
    }
});

const deleteAd = asyncHandler(async (req, res) => {
    try {
        const ad = await Ad.findByIdAndDelete(req.params.id);
        res.status(200).json(ad);
    } catch (error) {
        const { status, message } = handleMongoError(error);
        res.status(status).json({ message });
    }
});

const trackAdClick = asyncHandler(async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      { $inc: { 'stats.clicks': 1 } },
      { new: true }
    );

    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    if (!ad.link) {
      return res.status(404).json({ message: 'Ad has no redirect link' });
    }

    res.redirect(302, ad.link);
  } catch (error) {
    const { status, message } = handleMongoError(error);
    res.status(status).json({ message });
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
    getAdById,
    updateAd,
    deleteAd,
    getTopAds,
    trackAdClick
}
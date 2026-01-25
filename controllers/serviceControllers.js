const Service = require('../models/serviceModel');
const slugify = require('slugify');
const  validateMongodbId  = require('../utils/validateMongodbId');
const {Geek} = require('../models/geekModel');
const asyncHandler = require('express-async-handler');
// const { uploadToAzure, deleteFromAzure } = require('../middlewares/azureUploader');
const { generateSasUrl } = require('../utils/azureBlob.js');


const createService = asyncHandler(async (req, res) => {
  try {
     const { title, overview, price, } = req.body;

  if(!createdBy){
    return res.status(400).json({ message: 'Geek not found' });
  }

  if (!title || !overview || !price || !category) {
    return res.status(400).json({ message: 'All required fields must be provided' });
  }

  req.body.slug = slugify(title, { lower: true, strict: true });


  const newService = await Service.create(req.body);
  createdByUser.services?.push(newService._id);
  await createdByUser.save();
  res.status(201).json(newService);
  } catch (error) {
    throw new Error(error);
  }
});




const getAllServices = asyncHandler(async (req, res) => {
  const {
    search,
    category,
    subcategory,
    sort,
    page = 1,
    limit = 10
  } = req.query;

  const query = {};

  // 🔍 Fuzzy search in title & overview.description
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { 'overview.description': { $regex: search, $options: 'i' } }
    ];
  }

  if (category) query.category = category;
  if (subcategory) query.subcategory = subcategory;

  const pageNum = parseInt(page);
  const pageSize = parseInt(limit);
  const skip = (pageNum - 1) * pageSize;

  const sortOptions = {};
  if (sort === 'priceLowToHigh') sortOptions.price = 1;
  else if (sort === 'priceHighToLow') sortOptions.price = -1;
  else if (sort === 'newest') sortOptions.createdAt = -1;
  else if (sort === 'oldest') sortOptions.createdAt = 1;

  const [services, total] = await Promise.all([
    Service.find(query)
      .populate('category category.subCategories tags brands createdBy')
      .sort(sortOptions)
      .skip(skip)
      .limit(pageSize),
    Service.countDocuments(query)
  ]);

  if (services?.length) {
    for (let i = 0; i < services.length; i++) {
      if(services[i].images?.length){
        for (let j = 0; j < services[i].images.length; j++) {
          const blobName = services[i].images[j].public_id;
          const sasUrl = await generateSasUrl(blobName);
          services[i].images[j].url = sasUrl;
        }
      }
    }
  }

  if (services?.length) {
    for (let i = 0; i < services.length; i++) {
      if(services[i].video?.public_id){
        const blobName = services[i].video.public_id;
        const sasUrl = await generateSasUrl(blobName);
        services[i].video.url = sasUrl;
      }
    }
  }

  if(services?.length){
    for (let i = 0; i < services.length; i++) {
      if(services[i].createdBy?.profileImage?.public_id){
        const blobName = services[i].createdBy.profileImage.public_id;
        const sasUrl = await generateSasUrl(blobName);
        services[i].createdBy.profileImage.url = sasUrl;
      }
    }
  }

  if (services?.length) {
    for (let i = 0; i < services.length; i++) {
      const blobName = services[i].category.image?.public_id;
      const sasUrl = await generateSasUrl(blobName);
      services[i].category.image.url = sasUrl;
    }
  }

  res.status(200).json({
    total,
    page: pageNum,
    pages: Math.ceil(total / pageSize),
    services,
  });
});


// GET SINGLE SERVICE
const getServiceById = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id).populate([
    {path: 'category', populate: {path: 'subCategories'}},
    {path: 'tags'},
    {path: 'brands'},
    {path: 'createdBy', populate:{path: 'brandsServiced'}}
  ]);
  if (!service) {
    res.status(404);
    throw new Error('Service not found');
  }

  if(service?.images?.length){
    for (let i = 0; i < service.images.length; i++) {
      const blobName = service.images[i].public_id;
      const sasUrl = await generateSasUrl(blobName);
      service.images[i].url = sasUrl;
    }
  }

  if(service?.video?.public_id){
    const blobName = service.video.public_id;
    const sasUrl = await generateSasUrl(blobName);
    service.video.url = sasUrl;
  }

  if(service?.createdBy?.profileImage?.public_id){
    const blobName = service.createdBy.profileImage.public_id;
    const sasUrl = await generateSasUrl(blobName);
    service.createdBy.profileImage.url = sasUrl;
  }


if(service?.category?.image?.public_id){
  const blobName = service.category.image.public_id;
  const sasUrl = await generateSasUrl(blobName);
  service.category.image.url = sasUrl;
}


  

  res.json(service);
});

// UPDATE SERVICE
const updateService = asyncHandler(async (req, res) => {
  const {
    title,
    overview,
    price,
    category,
    tags,
    brands
  } = req.body;

  const service = await Service.findById(req.params.id);
  if (!service) {
    res.status(404);
    throw new Error('Service not found');
  }

  service.title = title || service.title;
  service.slug = slugify(title || service.title, { lower: true, strict: true });

  service.overview = overview ? JSON.parse(overview) : service.overview;
  service.price = price || service.price;
  service.category = category || service.category;
  service.tags = tags ? JSON.parse(tags) : service.tags;
  service.brands = brands ? JSON.parse(brands) : service.brands;

  // Upload new files if present
  // if (req.files?.images) {
  //   service.images = await Promise.all(
  //     req.files.images.map(async (file) => await uploadToAzure(file))
  //   );
  // }

  // if (req.files?.video?.[0]) {
  //   service.video = await uploadToAzure(req.files.video[0]);
  // }

  await service.save();
  res.json(service);
});

// DELETE SERVICE
const deleteService = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!service) {
    res.status(404);
    throw new Error('Service not found');
  }

  // Optionally delete associated media from Azure
  // if (service.images?.length) {
  //   await Promise.all(service.images.map(img => deleteFromAzure(img.public_id)));
  // }

  // if (service.video?.public_id) {
  //   await deleteFromAzure(service.video.public_id);
  // }

  await Service.findByIdAndDelete(req.params.id);
  res.json({ message: 'Service removed' });
});

module.exports = {
  createService,
  getAllServices,
  getServiceById,
  updateService,
  deleteService
};

const multer = require("multer");
const { BlobServiceClient } = require("@azure/storage-blob");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const os = require("os");
const rateLimit = require("express-rate-limit");

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = process.env.AZURE_CONTAINER_NAME;

 
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

const storage = multer.memoryStorage();

const fileFilter = (allowedTypes) => (req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Unsupported file type."), false);
};

const azureUploader = (allowedTypes, fields) =>
  multer({
    storage,
    fileFilter: fileFilter(allowedTypes),
    limits: { fileSize: 10 * 1024 * 1024 },
  }).fields(fields);


  const singleUploader = (allowedTypes, fieldName) =>
  multer({
    storage,
    fileFilter: fileFilter(allowedTypes),
    limits: { fileSize: 10 * 1024 * 1024 },
  }).single(fieldName);


const validateImageDimensions = async (buffer, minWidth = 300, minHeight = 300) => {
  const metadata = await sharp(buffer).metadata();
  if (metadata.width < minWidth || metadata.height < minHeight) {
    throw new Error("Image dimensions are too small.");
  }
};

const validateVideoDuration = (buffer, maxDuration = 60) => {
  return new Promise((resolve, reject) => {
    const tempPath = path.join(os.tmpdir(), `${uuidv4()}.mp4`);
    fs.writeFileSync(tempPath, buffer);

    ffmpeg.ffprobe(tempPath, (err, metadata) => {
      fs.unlinkSync(tempPath);
      if (err) return reject(new Error("Failed to process video."));
      if (metadata.format.duration > maxDuration) {
        return reject(new Error("Video duration exceeds limit."));
      }
      resolve();
    });
  });
};

const uploadToAzure = async (file) => {
  try {
    const blobName = `${uuidv4()}${path.extname(file.originalname)}`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(file.buffer, {
    blobHTTPHeaders: { blobContentType: file.mimetype },
  });

  return {
    public_id: blobName,
    url: blockBlobClient.url,
  };
    
  } catch (error) {
    throw new Error(error.message);
  }
};

const uploadValidator = async (req, res, next) => {
  try {
    
    if (req.files.images) {
      await Promise.all(
        req.files.images.map(async (file) => {
          await validateImageDimensions(file.buffer);
        })
      );
    }
    if (req.files.video) {
      await validateVideoDuration(req.files.video[0].buffer);
    }
    next();
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: "Too many upload attempts from this IP, please try again later."
});

module.exports = {
  azureUploader,
  uploadToAzure,
  uploadValidator,
  uploadLimiter,
  singleUploader
};

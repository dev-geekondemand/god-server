// utils/azureBlob.js
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, SASProtocol, StorageSharedKeyCredential } = require("@azure/storage-blob");

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const ACCOUNT_KEY = process.env.AZURE_STORAGE_ACCOUNT_KEY;
const CONTAINER_NAME = process.env.AZURE_CONTAINER_NAME;

const sharedKeyCredential = new StorageSharedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY);
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

const generateSasUrl = async (blobName, expiresInMinutes = 10) => {
  if (!blobName) {
    throw new Error("Blob name is undefined");
  }
  const blobClient = containerClient.getBlobClient(blobName);
  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName,
      expiresOn: new Date(Date.now() + expiresInMinutes * 60 * 1000),
      permissions: BlobSASPermissions.parse("r"), // read only
      protocol: SASProtocol.Https,
    },
    sharedKeyCredential
  ).toString();

  return `${blobClient.url}?${sasToken}`;
};

const deleteFromAzure = async (publicId) => {
  try {
    if (!publicId) return;

    const blockBlobClient = containerClient.getBlockBlobClient(publicId);
    await blockBlobClient.deleteIfExists();

  } catch (error) {
    console.error("Azure delete failed:", error.message);
    throw new Error("Failed to delete image from Azure");
  }
};


module.exports = { generateSasUrl, deleteFromAzure };

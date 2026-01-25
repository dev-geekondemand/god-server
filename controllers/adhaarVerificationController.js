const AadhaarVerification = require('../models/verifiedAdhaarModel.js');
const asyncHandler = require('express-async-handler');
const { fetchAdhaarVerificationStatus } = require('../utils/verifyAdhaar');

const getAadhaarVerifications = asyncHandler(async (req, res) => {
  const verifications = await AadhaarVerification.find()
    .populate('geek', 'fullName email mobile')
    .sort({ createdAt: -1 });

  res.status(200).json(verifications);
});

const pollAadhaarStatus = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  console.log(requestId);

  const record = await AadhaarVerification.findOne({ requestId }).populate('geek');
  console.log(record);
  if (!record) return res.status(404).json({ message: 'Task not found' });

  

  if(record.geek?._id?.toString() !== req.user.id){
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const resp = await fetchAdhaarVerificationStatus(requestId);

  const latest = resp?.[0]; // response is an array

  if (!latest) {
    return res.status(500).json({ message: 'Unexpected response from IDfy' });
  }

  record.response = latest;
  record.status = latest.status;
  record.verifiedAt = new Date();

  if (latest.status === 'completed') {
    record.geek.idProof.isAdhaarVerified = true;
    record.geek.idProof.idNumber = record.idNumber;
    record.geek.idProof.status = 'Verified';
    record.geek.profileCompletedPercentage+=20;
    await record.geek.save();
  }else{
    record.geek.idProof.isAdhaarVerified = false;
    record.geek.idProof.idNumber = record.idNumber;
    record.geek.idProof.status = 'Failed';
    await record.geek.save();
  }

  await record.save();

  res.status(200).json({
    verified: latest.status === 'completed',
    status: latest.status,
    result: latest
  });
});


module.exports = { getAadhaarVerifications,pollAadhaarStatus };

const axios = require('axios');

const verifyAadhaarLite = async (aadhaarNumber) => {
  try {
    const response = await axios.post(
      'https://eve.idfy.com/v3/tasks/async/verify_with_source/aadhaar_lite',
      {
        task_id: `aadhaar-${Date.now()}`,
        group_id: 'geek-on-demand',
        data: {
          aadhaar_number: aadhaarNumber
        }
      },
      {
        headers: {
          'api-key': process.env.IDFY_API_KEY,
          'account-id': process.env.IDFY_ACCOUNT_ID,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Aadhaar verification failed:', error.response?.data || error.message);
    throw new Error('Failed to verify Aadhaar');
  }
};



const fetchAdhaarVerificationStatus = async (requestID) => {
  try {
    const response = await axios.get(
      `https://eve.idfy.com/v3/tasks`,

      {
        params: {
          request_id: requestID
        },
        headers: {
          'api-key': process.env.IDFY_API_KEY,
          'account-id': process.env.IDFY_ACCOUNT_ID,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data;

  } catch (error) {
    console.log(error);
    
    console.error('Fetching Aadhaar verification Details failed:', error.response?.data || error.message);
    throw new Error('Failed to verify Aadhaar');
  }
};


module.exports = { verifyAadhaarLite, fetchAdhaarVerificationStatus };

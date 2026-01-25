// config/msalConfig.js
module.exports = {
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      authority: 'https://login.microsoftonline.com/common',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    },
  };
  
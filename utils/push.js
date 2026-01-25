const {Expo} = require('expo-server-sdk');
const { Geek } = require('../models/geekModel');
// Create a new Expo SDK client
const expo = new Expo();

const sendExpoPushNotification=async(
    pushToken,
    title,
    body,
    data
)=> {
  try {
    console.log('Sending push notification to token:', pushToken);
    // Must check that the pushToken is valid
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error('Invalid Expo push token:', pushToken);
      return;
    }

    const message = {
      to: pushToken,
      sound: 'default',
      title,
      body,
      data,
    };

    const tickets = await expo.sendPushNotificationsAsync([message]);
    console.log('Push tickets:', tickets);

    // Optionally, after some time, you can check receipts
    const receiptIds = tickets
      .map(ticket => ticket?.id)
      .filter(id => id);

    if (receiptIds.length > 0) {
      const receipts = await expo.getPushNotificationReceiptsAsync(receiptIds);
      console.log('Push receipts:', receipts);

      // Clean up invalid tokens
      for (const id in receipts) {
        const rec = receipts[id];
        if (rec.status === 'error') {
          console.error(
            `Error delivering push token ${rec.details?.error}`
          );
          // If "DeviceNotRegistered", delete token from DB so you don't keep using it
          if (rec.details && rec.details.error === 'DeviceNotRegistered') {
                const geek = await Geek.findOne({ expoPushToken: pushToken });
                geek.expoPushToken = "";
          }
        }
      }
    }
  } catch (err) {
    console.error('Error sending push notification:', err);
  }
}

module.exports = sendExpoPushNotification

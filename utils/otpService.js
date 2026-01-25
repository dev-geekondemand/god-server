const client = require("../config/twilio");
const Otp = require("../models/otpModel");

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const sendOtp = async (phone) => {
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry
  console.log(otp)
  try {
    // Send via Twilio
    await client.messages.create({
      body: `Your OTP is: ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });
    await Otp.findOneAndUpdate(
      { phone },
      { otp, expiresAt },
      { upsert: true, new: true }
    );


    return { success: true, message: "OTP sent" };
  } catch (err) {
    console.error("Twilio Error:", err);
    return { success: false, message: "Failed to send OTP", error: err };
  }
};

const verifyOtp = async (phone, enteredOtp) => {
  const otpRecord = await Otp.findOne({ phone });
  if (!otpRecord) return false;

  const { otp, expiresAt } = otpRecord;

  if (typeof enteredOtp === "number") {
    enteredOtp = enteredOtp.toString();
  }


  const isValid = otp === enteredOtp && Date.now() < expiresAt.getTime();

  if (isValid) {
    await Otp.deleteOne({ phone }); // Remove OTP after success
  }

  return isValid;
};

module.exports = { sendOtp, verifyOtp };

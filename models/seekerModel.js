const mongoose = require("mongoose")

const AddressSchema = new mongoose.Schema({
  pin: String,
  city: String,
  state: String,
  country: String,
  line1: {type:String, required: true},
  line2: String,
  line3: String,
  location:{
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      validate: {
        validator: function(v) {
          return v.length === 2;
        },
        message: 'Coordinates must be an array of length 2'
      }
    }
  }
  
}, { _id: false });


// Declare the Schema of the Mongo model
const seekerSchema = new mongoose.Schema({
    refCode:{
      type: String,
      default:null,
    },
    authProvider: {
        type: String,
        enum: ['google', 'linkedin', 'microsoft', 'custom'],
        required: true,
      },
      authProviderId: {
        type: String, 
        required: true,
        unique: true,
      },
      email: {
        type: String,
        required: function () {
          return this.authProvider !== 'custom';
        },
        lowercase: true,
        trim: true,
      },
      isEmailVerified: {
        type: Boolean,
        default: false,
      },
      emailVerificationToken: String,
      emailVerificationTokenExpiry: Date,
      phone: {
        type: String,
        required: function(){ 
          return this.authProvider === 'custom';
        }
      },
      isPhoneVerified: {
        type: Boolean,
        default: false,
      },
      fullName: {
        first: { type: String, required: true },
        last: { type: String, required: false },
      },
      profileImage: String,
      address: AddressSchema,
      profileCompleted: {
        type: Boolean,
        default: false,
      },
      needsReminderToCompleteProfile: {
        type: Boolean,
        default: true,
      },
      authToken:{
        type:String
      },
      requests:[{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ServiceRequest'
      }],
      pushSubscription: {
        endpoint: String,
        keys: {
          p256dh: String,
          auth: String,
        },
      },
      expoPushToken: {
        type: String,
        default: null,
      }
    }, { timestamps: true });



//Export the model
module.exports = mongoose.model('User', seekerSchema);

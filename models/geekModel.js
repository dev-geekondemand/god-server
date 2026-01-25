const mongoose = require('mongoose');
const leanVirtuals = require('mongoose-lean-virtuals');


const AddressSchema = new mongoose.Schema({
  pin: String,
  city: String,
  state: String,
  country: String,
  line1: { type: String, required: true },
  line2: String,
  line3: String,
  location: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point"
    },
    coordinates: {
      type: [Number], // [lng, lat]
      default: undefined, // 🔑 IMPORTANT
      validate: {
        validator: (val) =>
          val === undefined ||
          (Array.isArray(val) && val.length === 2),
        message: "Coordinates must be [longitude, latitude]"
      }
    }
  }
}, { _id: false });





const RateCardSchema = new mongoose.Schema({
    skill:{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true
    },
    chargeType: { type: String, enum: ['Hourly', 'Per Ticket'], default: 'Per Ticket' },
    rate: Number
  }, { _id: true });

  

const TimeSlotSchema = new mongoose.Schema({
  from: String,
  to: String,
}, { _id: false });

const AvailabilitySchema = new mongoose.Schema({
  slots: [{
    day: String,
    timeSlots: [TimeSlotSchema]
  }]
}, { _id: false });

const CertificateSchema = new mongoose.Schema({
  name: String,
  fileUrl: String,
}, { timestamps: true }); // We want _id!


const ReviewSchema = new mongoose.Schema({
  rating: Number,
  comment: String,
  postedBy:{type: mongoose.Schema.Types.ObjectId, ref:"Seeker"},
  replies:[{
    comment:String,
    postedBy:{type: mongoose.Schema.Types.ObjectId, ref:"Seeker" || "Geek"},
  }]

})

const baseOptions = {
  discriminatorKey: '__t',
  timestamps: true,
};

const GeekSchema = new mongoose.Schema({
  refCode:{
    type: String,
    default:null,
  },
  fullName: {
    first: { type: String, required: true },
    last: { type: String, required: true },
  },
  authProvider: {
    type: String,
    enum: ['google', 'linkedin', 'microsoft', 'custom'],
    required: true,
    default: 'custom',
  },
  email: { type: String},
  emailVerificationToken: String,
  emailVerificationTokenExpiry: Date,
  mobile: { type: String, required: true, unique: true },
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },
  profileImage: {
  public_id: { type: String },
  url: { type: String }
},
  primarySkill: { type:mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  secondarySkills: [{ type:mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  description: String,
  modeOfService: { type: String, enum: ['Online', 'Offline', 'Carry In', 'All', 'None'], default: 'None' },
  availability: AvailabilitySchema,
  rateCard: [RateCardSchema],
  brandsServiced: [{ type:mongoose.Schema.Types.ObjectId, ref: 'Brand'}],
  profileCompleted: { type: Boolean, default: false },
  profileCompletedPercentage: { type: Number, default: 0 },
  address: AddressSchema,
  yoe:{
    type:Number,
    default:0,
    required:true
  },
  reviews:[ReviewSchema],
  authToken:{
    type:String
  },
  services:[{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  }],
  languagePreferences: {
    type: [String],
    default: []
  },
  requests:[{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceRequest'
  }],
  expoPushToken: {
    type: String,
    default: null
  }
  
}, baseOptions);

GeekSchema.plugin(leanVirtuals);

GeekSchema.virtual('profileImageUrl').get(function () {
  if (!this.profileImage?.public_id) return null;
  return this.profileImage.public_id;
});

GeekSchema.index({ 'address.location': '2dsphere' });


const Geek = mongoose.model('Geek', GeekSchema);

const IndividualGeek = Geek.discriminator('Individual', new mongoose.Schema({
  dob: Date,
  gender: String,
  qualifications: [CertificateSchema],
  idProof: {
    type: { type: String, enum: ['Aadhar', 'PAN'], default: 'Aadhar' },
    idNumber: String,
    isAdhaarVerified: { type: Boolean, default: false },
    status: { type: String, enum: ['Requested', 'Verified', 'Failed', "Null"], default: 'Null' },
    requestId: String
  },
}));

const CorporateGeek = Geek.discriminator('Corporate', new mongoose.Schema({
  companyName: { type: String, required: true },
  teamMembers: [GeekSchema],
  GSTIN: String,
  CIN: String,
  isVerified: { type: Boolean, default: false },
  companyDocs: [CertificateSchema],
  teamSize: Number,
}));



module.exports = {
  Geek,
  IndividualGeek,
  CorporateGeek
};


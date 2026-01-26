const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema({
  pin: String,
  city: String,
  state: String,
  country: String,
  line1: {type:String, required: true},
  line2: String,
  line3: String,
  coordinates:{
    latitude: Number,
    longitude: Number
  }
  
}, { _id: false });

const serviceRequestSchema = new mongoose.Schema({
  category:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  seeker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  geek: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Geek',
    required: true
  },
  issue: {
    type:mongoose.Schema.Types.ObjectId,
    ref: 'UserIssue',
  },
  mode: {
    type: String,
    enum: ['Online', 'Offline',"All","Carry In"],
    required: true
  },

  scheduledAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  address: AddressSchema,
  status: {
    type: String,
    enum: ['Pending', 'Matched', 'Accepted', 'Rejected', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  geekResponseStatus: {
    type: String,
    enum: ['Pending', 'Accepted', 'Rejected','Expired'],
    default: 'Pending'
  },
  images: [{
    public_id: String,
    url: String
  }],
  video: {
    public_id: String,
    url: String
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  reviews:[
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review'
    }
  ],

    totalRating:{
        type:String,
        default:"0",
    },

  responseAt: Date,

}, { timestamps: true });

module.exports =
  mongoose.models.ServiceRequest ||
  mongoose.model('ServiceRequest', serviceRequestSchema);


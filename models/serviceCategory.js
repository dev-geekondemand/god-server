const mongoose = require('mongoose'); 
// Declare the Schema of the Mongo model
var categorySchema = new mongoose.Schema({
    title:{
        type:String,
        required:true,
        unique:true,
        index:true,
    },
    slug:{
        type:String,
        required:true,
        unique:true,
        lowercase:true,
    },
    image:{
        public_id: { type: String },
        url: { type: String }
    },
    smallBanner:{
        public_id: { type: String },
        url: { type: String }
    },
    totalGeeks:{
        default:0,
        type:Number
    },
    subCategories:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:"SubCategory"
    }],
    requests:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:"ServiceRequest",
        default:[]
    }],
},{
    timestamps:true,
});

//Export the model
module.exports = mongoose.model('Category', categorySchema);
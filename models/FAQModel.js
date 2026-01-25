const mongoose = require('mongoose'); 
// Declare the Schema of the Mongo model
var FAQSchema = new mongoose.Schema({
    question:{
        type:String,
        required:true,
        unique:true,
        index:true,
    },
    answer:{
        type:String,
        required:true,
    }
},{
    timestamps:true,
});

//Export the model
module.exports = mongoose.model('FAQ', FAQSchema);
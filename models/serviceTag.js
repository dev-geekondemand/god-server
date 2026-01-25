const mongoose = require('mongoose'); 
// Declare the Schema of the Mongo model
var TagSchema = new mongoose.Schema({
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
        index:true,
    },
},{
    timestamps:true,
});

//Export the model
module.exports = mongoose.model('Tag', TagSchema);
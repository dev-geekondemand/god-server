const mongoose = require('mongoose'); 
// Declare the Schema of the Mongo model
const subCategorySchema = new mongoose.Schema({
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
    parentCategory:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Category"
    }
},{
    timestamps:true,
});

//Export the model
module.exports = mongoose.model('SubCategory', subCategorySchema);
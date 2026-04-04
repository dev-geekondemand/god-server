const mongoose = require("mongoose");


const brandSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    category: {
        type:mongoose.Schema.Types.ObjectId,
        ref:"Category",
        required: true,
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
    },
    description: {
        type: String,
    },
    image: {
        public_id: { type: String },
        url: { type: String }
    }
}, { timestamps: true });

brandSchema.index({ name: 1, category: 1 }, { unique: true });

//Export the model
module.exports = mongoose.model('Brand', brandSchema);
const mongoose = require('mongoose'); // Erase if already required

// Declare the Schema of the Mongo model
var serviceSchema = new mongoose.Schema({
    title:{
        type:String,
        required:true,
        trim:true,
    },
    slug:{
        type:String,
        required:true,
        unique:true,
        lowercase:true,
    },
    overview:{
        description:{
            type:String,
            required:true,
        },
        benefits:[{
            type:String,
        }],
    },
    price:{
        type:Number,
        required:true,
    },
    category:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Category",
        required:true,
    },
    geek:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Geek",
        required:true,
    },
    status:{
        type:String,
        enum:["Completed","Active","Cancelled"],
        default:"Active",
    },
    serviceRequest:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:"ServiceRequest",
    }],

    seeker:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Seeker"
    }],
    images:[{
        public_id : String,
        url:String
    }],
    tags:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Tag"
    }],
    videos:[{
        public_id : String,
        url:String
    }],
    ratings:[
        {
            star:Number,
            comment:String,
            postedBy:{type: mongoose.Schema.Types.ObjectId, ref:"Seeker"},

            replies:[{
                comment:String,
                postedBy:{type: mongoose.Schema.Types.ObjectId, ref:"Seeker"},
            }]
        }
    ],

    totalRating:{
        type:String,
        default:"0",
    },
},{
    timestamps:true
});

//Export the model
module.exports = mongoose.model('Service', serviceSchema);
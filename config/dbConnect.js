const mongoose = require('mongoose')

const dbConnect = ()=>{
    try{
        const connection = mongoose.connect(process.env.MONGODB_URL,{
            dbName:"geekOnDemand",
            authSource: "admin",
        })
        // console.log(process.env.MONGODB_URL)
        connection.then(()=>{console.log("✅ Connected to DB");})
    }catch(e){
        console.error("❌ Database connection error:", e.message); 
    }
}

module.exports = dbConnect;

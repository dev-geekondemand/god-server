const express = require('express')
const dotenv = require('dotenv').config()
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const dbConnect = require('./config/dbConnect.js')
const seekerRoutes = require('./routes/seekerRoutes.js')
const geekRoutes = require('./routes/geekRoutes.js')
const authRoutes = require('./routes/authRoutes.js')
const categoryRoutes = require('./routes/categoryRoutes.js')
const subCategoryRoutes = require('./routes/subCategoryRoutes.js')
const brandRoutes = require('./routes/brandRoutes.js')
const tagRoutes = require('./routes/tagRoutes.js')
const serviceRoutes = require('./routes/serviceRoutes.js')
const serviceRequestRoutes = require('./routes/requestRoutes.js')
const blogRoutes = require('./routes/blogRoutes.js')
const issueRoutes = require('./routes/issueRoutes.js')
const apiKeyRoute = require('./routes/apiKey.js')
const enquiryRoutes = require('./routes/enquiryRoutes.js')
const adRoutes = require('./routes/adRoutes.js')
const passport = require('passport');
require('./config/passport');

const cors = require('cors')
 const jwt = require('jsonwebtoken')
const morgan = require('morgan')
const app = express();
const PORT = process.env.PORT || 4000;
 
const corsOptions = {
    origin:["http://localhost:3001","http://localhost:3000","https://god-ui.vercel.app","https://god-admin-5l63.vercel.app"], 
    credentials:true,
    optionSuccessStatus:200,
  } 
  
  app.use(cors(corsOptions));
 
dbConnect();

app.use(morgan("dev"))

// const webpush = require("web-push");

// const vapidKeys = webpush.generateVAPIDKeys();
// console.log(vapidKeys);

 
  app.use(passport.initialize());

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended:false}))

app.use(cookieParser());

app.use("/api/apiKey",apiKeyRoute)


app.use((req, res, next) => {
  const openPaths = [
    "/api/seeker/google",
    "/api/seeker/google/callback",
    "/api/seeker/microsoft",
    "/api/seeker/microsoft/callback",
    "/api/apiKey/generate"
  ];

  if (openPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  const apiKey = req.headers["x-api-key"] ;
  
  if (!apiKey) return res.status(403).json({ message: "API key missing" });

  try {
    jwt.verify(apiKey, process.env.API_KEY_SECRET);
    next();
  } catch (err) {
    console.log("API key missing");
    return res.status(403).json({ message: "Invalid or expired API key" });
  }
});



app.get("/", (req, res) => { res.send("Welcome to the Server"); })
app.use('/api/auth', authRoutes)
app.use('/api/ad', adRoutes)
app.use('/api/seeker', seekerRoutes)
app.use('/api/geek', geekRoutes)
app.use('/api/category', categoryRoutes)
app.use('/api/sub-category', subCategoryRoutes)
app.use('/api/brand', brandRoutes)
app.use('/api/tag', tagRoutes)
app.use('/api/service', serviceRoutes)
app.use('/api/request', serviceRequestRoutes)
app.use('/api/blogs', blogRoutes);
app.use('/api/issue', issueRoutes);
app.use('/api/enquiry', enquiryRoutes);



app.listen(PORT || 4000,()=>{
    console.log(`Server running on port ${PORT}`)
}) 

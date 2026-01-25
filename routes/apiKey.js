// backend/routes/apiKey.ts
const  express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

router.get("/generate", (req, res) => {
  const secret = process.env.API_KEY_SECRET;
  const token = jwt.sign(
    { allowed: true },       // payload can include roles, etc.
    secret,
    { expiresIn: "2m" }      // token valid for 2 minutes
  );

  res.json({ apiKey: token });
});

module.exports =  router;

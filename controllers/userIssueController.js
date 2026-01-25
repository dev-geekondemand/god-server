const asyncHandler = require("express-async-handler");
const UserIssue = require("../models/userIssueModel");
const { default: mongoose } = require("mongoose");



const getUserIssues = asyncHandler(async (req, res) => {
        const  {id} = req.user
        const userId = new mongoose.Types.ObjectId(id)

        try {
            const issues = await UserIssue.find({ user_id: userId });
            res.status(200).json(issues);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    const getAllIssues = asyncHandler(async (req, res) => {
        try {
            const issues = await UserIssue.find();
            res.status(200).json(issues);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });


module.exports = { getUserIssues, getAllIssues };
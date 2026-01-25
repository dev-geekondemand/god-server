// ad.model.ts
import mongoose from "mongoose";

const AdSchema = new mongoose.Schema(
  {

    type: {
      type: String,
      enum: ["top", "inner"], // 🔥 ONLY 2 TYPES
      required: true,
      index: true,
    },

    placement: {
      type: String, // home, category, profile, service
      index: true,
    },

    image:{
      public_id: { type: String },
      url: { type: String }
    },

    startDate: Date,
    endDate: Date,

    stats: {
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Ad", AdSchema);

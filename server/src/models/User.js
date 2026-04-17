const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      default: null,
    },
    googleId: {
      type: String,
      default: null,
    },
    profilePic: {
      type: String,
      default: null,
    },
    trips: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Trip",
      },
    ],
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

module.exports = User;


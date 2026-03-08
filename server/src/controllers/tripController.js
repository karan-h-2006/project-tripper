const crypto = require("crypto");
const Trip = require("../models/Trip");
const User = require("../models/User");

const createTrip = async (req, res) => {
  try {
    const { title, description, total_budget } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const adminId = req.user && req.user.id ? req.user.id : req.user?._id;

    if (!adminId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const join_code = crypto.randomBytes(3).toString("hex").toUpperCase();

    const trip = await Trip.create({
      title,
      description,
      total_budget: typeof total_budget === "number" ? total_budget : 0,
      join_code,
      admin: adminId,
      members: [adminId],
    });

    await User.findByIdAndUpdate(adminId, {
      $addToSet: { trips: trip._id },
    });

    return res.status(201).json(trip);
  } catch (error) {
    console.error("Create trip error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createTrip,
};


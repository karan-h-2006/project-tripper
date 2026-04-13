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
      admins: [adminId],
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

const getMyTrips = async (req, res) => {
  try {
    const userId = req.user && (req.user.id || req.user._id);

    if (!userId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const trips = await Trip.find({ members: userId })
      .populate("admin", "-password")
      .populate("members", "-password")
      .sort({ updatedAt: -1, createdAt: -1 });

    return res.status(200).json({ trips });
  } catch (error) {
    console.error("Get my trips error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getTripById = async (req, res) => {
  try {
    const userId = req.user && (req.user.id || req.user._id);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const trip = await Trip.findById(id)
      .populate("admin", "-password")
      .populate("members", "username profilePic")
      .populate("admins", "username profilePic");

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const isMember = trip.members.some(
      (memberId) => memberId.toString() === userId.toString()
    );

    if (!isMember) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.status(200).json({ trip });
  } catch (error) {
    console.error("Get trip by id error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createTrip,
  getMyTrips,
  getTripById,
};


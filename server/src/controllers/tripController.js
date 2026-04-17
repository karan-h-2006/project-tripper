const crypto = require("crypto");
const Trip = require("../models/Trip");
const User = require("../models/User");
const Activity = require("../models/Activity");
const { runBudgetOptimizer } = require("../services/budgetOptimizer");

const getNormalizedUserId = (userLike) => {
  if (!userLike) return "";
  if (typeof userLike === "string") return userLike;
  if (userLike._id) return userLike._id.toString();
  return userLike.toString();
};

const isTripAdminUser = (trip, userId) => {
  const normalizedUserId = getNormalizedUserId(userId);
  const adminIds = Array.isArray(trip.admins)
    ? trip.admins.map((adminId) => getNormalizedUserId(adminId))
    : [];

  // Backward-compatible support for trips that only have `admin` set.
  const primaryAdminId = getNormalizedUserId(trip.admin);

  return (
    adminIds.includes(normalizedUserId) || primaryAdminId === normalizedUserId
  );
};

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
    const tripId = req.params.tripId || req.params.id;

    if (!userId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const trip = await Trip.findById(tripId)
      .populate("admin", "-password")
      .populate("members", "username profilePic")
      .populate("admins", "username profilePic");

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const isMember = trip.members.some(
      (member) => getNormalizedUserId(member) === userId.toString()
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

const promoteToAdmin = async (req, res) => {
  try {
    const { tripId, userId } = req.params;
    const trip = await Trip.findById(tripId);

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const requesterId = req.user && (req.user.id || req.user._id);
    const isRequesterAdmin = isTripAdminUser(trip, requesterId);

    if (!isRequesterAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const currentAdminIds = Array.isArray(trip.admins)
      ? trip.admins.map((id) => id.toString())
      : [];
    trip.admins = Array.from(new Set([...currentAdminIds, userId.toString()]));
    await trip.save();

    const io = req.app.get("io");
    const newActivity = await Activity.create({
      tripId,
      userId: requesterId,
      text: `${req.user.username} promoted a user to Admin`,
      type: "system",
    });
    await newActivity.populate("userId", "username profilePic");

    if (io) {
      const roomString = tripId.toString();
      io.to(roomString).emit("receive_message", newActivity);
      io.to(roomString).emit("trip_members_updated");
    }

    return res.status(200).json(trip);
  } catch (error) {
    console.error("Promote to admin error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const demoteFromAdmin = async (req, res) => {
  try {
    const { tripId, userId } = req.params;
    const trip = await Trip.findById(tripId);

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const requesterId = req.user && (req.user.id || req.user._id);
    const isRequesterAdmin = isTripAdminUser(trip, requesterId);

    if (!isRequesterAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }

    trip.admins = (trip.admins || []).filter(
      (adminId) => adminId.toString() !== userId.toString()
    );
    await trip.save();

    const io = req.app.get("io");
    const newActivity = await Activity.create({
      tripId,
      userId: requesterId,
      text: `${req.user.username} removed Admin privileges from a user`,
      type: "system",
    });
    await newActivity.populate("userId", "username profilePic");

    if (io) {
      const roomString = tripId.toString();
      io.to(roomString).emit("receive_message", newActivity);
      io.to(roomString).emit("trip_members_updated");
    }

    return res.status(200).json(trip);
  } catch (error) {
    console.error("Demote from admin error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const kickMember = async (req, res) => {
  try {
    const { tripId, userId } = req.params;
    const trip = await Trip.findById(tripId);

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const requesterId = req.user && (req.user.id || req.user._id);
    const isRequesterAdmin = isTripAdminUser(trip, requesterId);

    if (!isRequesterAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }

    trip.members = trip.members.filter(
      (memberId) => memberId.toString() !== userId.toString()
    );
    trip.admins = (trip.admins || []).filter(
      (adminId) => adminId.toString() !== userId.toString()
    );
    await trip.save();

    const io = req.app.get("io");
    const newActivity = await Activity.create({
      tripId,
      userId: requesterId,
      text: `${req.user.username} kicked a user from the trip`,
      type: "system",
    });
    await newActivity.populate("userId", "username profilePic");

    if (io) {
      const roomString = tripId.toString();
      io.to(roomString).emit("receive_message", newActivity);
      io.to(roomString).emit("trip_members_updated");
      io.to(roomString).emit("user_kicked", {
        userId: req.params.userId.toString(),
      });
    }

    return res.status(200).json(trip);
  } catch (error) {
    console.error("Kick member error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const updateTripBudget = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { newBudget } = req.body;
    const requesterId = req.user && (req.user.id || req.user._id);

    if (!requesterId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const parsedBudget = Number(newBudget);
    if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
      return res.status(400).json({ message: "newBudget must be a valid number" });
    }

    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    if (!isTripAdminUser(trip, requesterId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    trip.total_budget = parsedBudget;
    await trip.save();

    const io = req.app.get("io");
    const activity = await Activity.create({
      tripId,
      userId: requesterId,
      text: `${req.user.username} updated the trip budget to ₹${parsedBudget}`,
      type: "system",
    });
    await activity.populate("userId", "username profilePic");

    if (io) {
      const roomString = tripId.toString();
      io.to(roomString).emit("budget_updated");
      io.to(roomString).emit("receive_message", activity);
    }

    await runBudgetOptimizer(tripId, req.app.get("io"));
    return res.status(200).json({ trip });
  } catch (error) {
    console.error("Update trip budget error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const endTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const requesterId = req.user && (req.user.id || req.user._id);

    if (!requesterId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    if (!isTripAdminUser(trip, requesterId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    trip.status = "ended";
    await trip.save();

    const io = req.app.get("io");
    const activity = await Activity.create({
      tripId,
      userId: requesterId,
      text: `🛑 ${req.user.username} ended the trip. No further expenses can be added.`,
      type: "system",
    });
    await activity.populate("userId", "username profilePic");

    if (io) {
      const roomString = tripId.toString();
      io.to(roomString).emit("trip_ended");
      io.to(roomString).emit("receive_message", activity);
    }

    return res.status(200).json({ trip });
  } catch (error) {
    console.error("End trip error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createTrip,
  getMyTrips,
  getTripById,
  promoteToAdmin,
  demoteFromAdmin,
  kickMember,
  updateTripBudget,
  endTrip,
};


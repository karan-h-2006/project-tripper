const User = require("../models/User");
const Trip = require("../models/Trip");

const updateProfilePicture = async (req, res) => {
  try {
    const { profilePic } = req.body;
    const userId = req.user && (req.user.id || req.user._id);

    if (!userId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!profilePic || typeof profilePic !== "string") {
      return res.status(400).json({ message: "Profile picture is required" });
    }

    const isSupportedImage = /^data:image\/(png|jpe?g|webp|gif);base64,/.test(
      profilePic
    );

    if (!isSupportedImage) {
      return res.status(400).json({
        message: "Please upload a PNG, JPG, WEBP, or GIF image",
      });
    }

    if (profilePic.length > 1_500_000) {
      return res.status(400).json({
        message: "Profile picture is too large. Please choose a smaller image.",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { profilePic },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "Profile picture updated",
      user,
    });
  } catch (error) {
    console.error("Update profile picture error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const joinTrip = async (req, res) => {
  try {
    const { join_code } = req.body;

    if (!join_code) {
      return res.status(400).json({ message: "Join code is required" });
    }

    const userId = req.user && (req.user.id || req.user._id);

    if (!userId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const trip = await Trip.findOne({ join_code: join_code.toUpperCase() });

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const isAlreadyMember = trip.members.some(
      (memberId) => memberId.toString() === userId.toString()
    );

    if (isAlreadyMember) {
      return res.status(400).json({ message: "User already in this trip" });
    }

    trip.members.addToSet(userId);

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.trips.addToSet(trip._id);

    await Promise.all([trip.save(), user.save()]);

    const populatedTrip = await Trip.findById(trip._id)
      .populate("admin", "-password")
      .populate("members", "username profilePic")
      .populate("admins", "username profilePic");

    const io = req.app.get("io");
    if (io) {
      io.to(trip._id.toString()).emit("trip_members_updated");
    }

    return res.status(200).json({
      message: "Joined trip successfully",
      trip: populatedTrip || trip,
    });
  } catch (error) {
    console.error("Join trip error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  joinTrip,
  updateProfilePicture,
};


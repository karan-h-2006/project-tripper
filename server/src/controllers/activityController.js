const Activity = require("../models/Activity");

const getTripActivities = async (req, res) => {
  try {
    const { tripId } = req.params;

    const activities = await Activity.find({ tripId })
      .populate("userId", "username profilePic")
      .sort({ createdAt: 1 });

    return res.status(200).json(activities);
  } catch (error) {
    console.error("Get trip activities error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getTripActivities,
};


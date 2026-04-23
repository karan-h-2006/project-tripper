const { listActivities } = require("../services/activityFeedService");

const getTripActivities = async (req, res) => {
  try {
    const { tripId } = req.params;
    const activities = await listActivities(tripId);
    return res.status(200).json(activities);
  } catch (error) {
    console.error("Get trip activities error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getTripActivities,
};

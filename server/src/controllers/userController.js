const crypto = require("crypto");
const { getSupabase } = require("../lib/supabase");
const {
  getRequesterId,
  isUuid,
  mapLegacyUser,
  mapSupabaseError,
} = require("../lib/legacyCompat");
const {
  fetchTripSnapshot,
  fetchUserById,
  findTripByJoinCode,
  getMembershipForUser,
  mapTripForRoom,
} = require("../services/tripDataService");

const updateProfilePicture = async (req, res) => {
  try {
    const { profilePic } = req.body;
    const userId = getRequesterId(req);

    if (!userId || !isUuid(userId)) {
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

    const { data: updatedRows, error } = await getSupabase()
      .from("users")
      .update({ avatar_url: profilePic })
      .eq("id", userId)
      .select("id, email, display_name, avatar_url, timezone, created_at, updated_at, deleted_at");

    if (error) {
      const mapped = mapSupabaseError(error);
      return res.status(mapped.status).json({ message: mapped.message });
    }

    const userRow = updatedRows[0] || (await fetchUserById(userId));
    if (!userRow) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "Profile picture updated",
      user: mapLegacyUser(userRow, { compact: false }),
    });
  } catch (error) {
    console.error("Update profile picture error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const joinTrip = async (req, res) => {
  try {
    const { join_code } = req.body;
    const userId = getRequesterId(req);

    if (!join_code) {
      return res.status(400).json({ message: "Join code is required" });
    }

    if (!userId || !isUuid(userId)) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const tripRow = await findTripByJoinCode(join_code);
    if (!tripRow) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const membership = getMembershipForUser(tripRow, userId);
    if (membership) {
      return res.status(400).json({ message: "User already in this trip" });
    }

    const { error } = await getSupabase().from("trip_members").insert({
      id: crypto.randomUUID(),
      trip_id: tripRow.id,
      user_id: userId,
      role: "MEMBER",
    });

    if (error) {
      const mapped = mapSupabaseError(error);
      return res.status(mapped.status).json({ message: mapped.message });
    }

    const updatedTrip = await fetchTripSnapshot(tripRow.id);
    const io = req.app.get("io");
    if (io) {
      io.to(String(tripRow.id)).emit("trip_members_updated");
    }

    return res.status(200).json({
      message: "Joined trip successfully",
      trip: mapTripForRoom(updatedTrip),
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

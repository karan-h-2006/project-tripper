const crypto = require("crypto");
const { getSupabase } = require("../lib/supabase");
const {
  buildJoinCodeFromTripId,
  getRequesterId,
  getRequesterName,
  isUuid,
  mapLegacyTrip,
  mapSupabaseError,
  parseAmount,
  parseTripMeta,
  serializeTripMeta,
} = require("../lib/legacyCompat");
const { createAndEmitActivity } = require("../services/activityFeedService");
const {
  fetchTripSnapshot,
  getMembershipForUser,
  isTripAdminUser,
  listTripsForUser,
  mapTripForDashboard,
  mapTripForRoom,
} = require("../services/tripDataService");
const { runBudgetOptimizer } = require("../services/budgetOptimizer");

const runBudgetOptimizerSafely = async (tripId, io) => {
  try {
    await runBudgetOptimizer(tripId, io);
  } catch (error) {
    console.error("Budget optimizer warning:", error.message);
  }
};

const createTrip = async (req, res) => {
  try {
    const { title, description, total_budget } = req.body;
    const requesterId = getRequesterId(req);

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (!requesterId || !isUuid(requesterId)) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const tripId = crypto.randomUUID();
    const joinCode = buildJoinCodeFromTripId(tripId);

    const { data: tripRows, error: tripError } = await getSupabase()
      .from("trips")
      .insert({
        id: tripId,
        title: String(title).trim(),
        description: description ? String(description).trim() : null,
        base_currency: "INR",
        status: "ACTIVE",
        cover_image_key: serializeTripMeta({
          joinCode,
          totalBudget: parseAmount(total_budget),
          coverImageKey: null,
        }),
      })
      .select("id, title, description, status, cover_image_key, created_at, updated_at");

    if (tripError) {
      const mapped = mapSupabaseError(tripError);
      return res.status(mapped.status).json({ message: mapped.message });
    }

    const { error: membershipError } = await getSupabase().from("trip_members").insert({
      id: crypto.randomUUID(),
      trip_id: tripId,
      user_id: requesterId,
      role: "OWNER",
    });

    if (membershipError) {
      await getSupabase().from("trips").delete().eq("id", tripId);
      const mapped = mapSupabaseError(membershipError);
      return res.status(mapped.status).json({ message: mapped.message });
    }

    return res.status(201).json(
      mapLegacyTrip(
        {
          ...tripRows[0],
          trip_members: [
            {
              id: crypto.randomUUID(),
              trip_id: tripId,
              user_id: requesterId,
              role: "OWNER",
              joined_at: new Date().toISOString(),
              removed_at: null,
              user: null,
            },
          ],
        },
        {
          populateAdmin: false,
          populateMembers: false,
          populateAdmins: false,
        }
      )
    );
  } catch (error) {
    console.error("Create trip error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getMyTrips = async (req, res) => {
  try {
    const requesterId = getRequesterId(req);

    if (!requesterId || !isUuid(requesterId)) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const trips = (await listTripsForUser(requesterId))
      .filter((tripRow) => Boolean(getMembershipForUser(tripRow, requesterId)))
      .map(mapTripForDashboard);

    return res.status(200).json({ trips });
  } catch (error) {
    console.error("Get my trips error:", error);
    const mapped = mapSupabaseError(error);
    return res.status(mapped.status).json({ message: mapped.message });
  }
};

const getTripById = async (req, res) => {
  try {
    const requesterId = getRequesterId(req);
    const tripId = req.params.tripId || req.params.id;

    if (!requesterId || !isUuid(requesterId)) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!isUuid(tripId)) {
      return res.status(400).json({ message: "Invalid trip id" });
    }

    const tripRow = await fetchTripSnapshot(tripId);
    if (!getMembershipForUser(tripRow, requesterId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.status(200).json({ trip: mapTripForRoom(tripRow) });
  } catch (error) {
    console.error("Get trip by id error:", error);
    const mapped = mapSupabaseError(error);
    return res
      .status(mapped.status === 404 ? 404 : mapped.status)
      .json({ message: mapped.status === 404 ? "Trip not found" : mapped.message });
  }
};

const promoteToAdmin = async (req, res) => {
  try {
    const { tripId, userId } = req.params;
    const requesterId = getRequesterId(req);

    if (!requesterId || !isUuid(requesterId)) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!isUuid(tripId) || !isUuid(userId)) {
      return res.status(400).json({ message: "Invalid trip or user id" });
    }

    const tripRow = await fetchTripSnapshot(tripId);
    if (!isTripAdminUser(tripRow, requesterId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!getMembershipForUser(tripRow, userId)) {
      return res.status(404).json({ message: "User is not a member of this trip" });
    }

    const { error } = await getSupabase()
      .from("trip_members")
      .update({ role: "ADMIN" })
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .is("removed_at", null);

    if (error) {
      const mapped = mapSupabaseError(error);
      return res.status(mapped.status).json({ message: mapped.message });
    }

    const updatedTrip = await fetchTripSnapshot(tripId);
    const io = req.app.get("io");
    await createAndEmitActivity({
      io,
      tripId,
      userId: requesterId,
      text: `${getRequesterName(req)} promoted a user to Admin`,
      type: "system",
    });
    io?.to(String(tripId)).emit("trip_members_updated");

    return res.status(200).json(
      mapLegacyTrip(updatedTrip, {
        populateAdmin: false,
        populateMembers: false,
        populateAdmins: false,
      })
    );
  } catch (error) {
    console.error("Promote to admin error:", error);
    const mapped = mapSupabaseError(error);
    return res.status(mapped.status).json({ message: mapped.message });
  }
};

const demoteFromAdmin = async (req, res) => {
  try {
    const { tripId, userId } = req.params;
    const requesterId = getRequesterId(req);

    if (!requesterId || !isUuid(requesterId)) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!isUuid(tripId) || !isUuid(userId)) {
      return res.status(400).json({ message: "Invalid trip or user id" });
    }

    const tripRow = await fetchTripSnapshot(tripId);
    if (!isTripAdminUser(tripRow, requesterId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const targetMembership = getMembershipForUser(tripRow, userId);
    if (!targetMembership) {
      return res.status(404).json({ message: "User is not a member of this trip" });
    }

    if (targetMembership.role === "ADMIN") {
      const { error } = await getSupabase()
        .from("trip_members")
        .update({ role: "MEMBER" })
        .eq("trip_id", tripId)
        .eq("user_id", userId)
        .is("removed_at", null);

      if (error) {
        const mapped = mapSupabaseError(error);
        return res.status(mapped.status).json({ message: mapped.message });
      }
    }

    const updatedTrip = await fetchTripSnapshot(tripId);
    const io = req.app.get("io");
    await createAndEmitActivity({
      io,
      tripId,
      userId: requesterId,
      text: `${getRequesterName(req)} removed Admin privileges from a user`,
      type: "system",
    });
    io?.to(String(tripId)).emit("trip_members_updated");

    return res.status(200).json(
      mapLegacyTrip(updatedTrip, {
        populateAdmin: false,
        populateMembers: false,
        populateAdmins: false,
      })
    );
  } catch (error) {
    console.error("Demote from admin error:", error);
    const mapped = mapSupabaseError(error);
    return res.status(mapped.status).json({ message: mapped.message });
  }
};

const kickMember = async (req, res) => {
  try {
    const { tripId, userId } = req.params;
    const requesterId = getRequesterId(req);

    if (!requesterId || !isUuid(requesterId)) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!isUuid(tripId) || !isUuid(userId)) {
      return res.status(400).json({ message: "Invalid trip or user id" });
    }

    const tripRow = await fetchTripSnapshot(tripId);
    if (!isTripAdminUser(tripRow, requesterId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!getMembershipForUser(tripRow, userId)) {
      return res.status(404).json({ message: "User is not a member of this trip" });
    }

    const { error } = await getSupabase()
      .from("trip_members")
      .update({ removed_at: new Date().toISOString() })
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .is("removed_at", null);

    if (error) {
      const mapped = mapSupabaseError(error);
      return res.status(mapped.status).json({ message: mapped.message });
    }

    const updatedTrip = await fetchTripSnapshot(tripId);
    const io = req.app.get("io");
    await createAndEmitActivity({
      io,
      tripId,
      userId: requesterId,
      text: `${getRequesterName(req)} kicked a user from the trip`,
      type: "system",
    });
    io?.to(String(tripId)).emit("trip_members_updated");
    io?.to(String(tripId)).emit("user_kicked", { userId: String(userId) });

    return res.status(200).json(
      mapLegacyTrip(updatedTrip, {
        populateAdmin: false,
        populateMembers: false,
        populateAdmins: false,
      })
    );
  } catch (error) {
    console.error("Kick member error:", error);
    const mapped = mapSupabaseError(error);
    return res.status(mapped.status).json({ message: mapped.message });
  }
};

const updateTripBudget = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { newBudget } = req.body;
    const requesterId = getRequesterId(req);

    if (!requesterId || !isUuid(requesterId)) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!isUuid(tripId)) {
      return res.status(400).json({ message: "Invalid trip id" });
    }

    const parsedBudget = Number(newBudget);
    if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
      return res.status(400).json({ message: "newBudget must be a valid number" });
    }

    const tripRow = await fetchTripSnapshot(tripId);
    if (!isTripAdminUser(tripRow, requesterId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const currentMeta = parseTripMeta(tripRow.cover_image_key);
    const { error } = await getSupabase()
      .from("trips")
      .update({
        cover_image_key: serializeTripMeta({
          joinCode: currentMeta.joinCode || buildJoinCodeFromTripId(tripId),
          totalBudget: parsedBudget,
          coverImageKey: currentMeta.coverImageKey,
        }),
      })
      .eq("id", tripId);

    if (error) {
      const mapped = mapSupabaseError(error);
      return res.status(mapped.status).json({ message: mapped.message });
    }

    const updatedTrip = await fetchTripSnapshot(tripId);
    const io = req.app.get("io");
    await createAndEmitActivity({
      io,
      tripId,
      userId: requesterId,
      text: `${getRequesterName(req)} updated the trip budget to INR ${parsedBudget}`,
      type: "system",
    });
    io?.to(String(tripId)).emit("budget_updated");
    await runBudgetOptimizerSafely(tripId, io);

    return res.status(200).json({
      trip: mapLegacyTrip(updatedTrip, {
        populateAdmin: false,
        populateMembers: false,
        populateAdmins: false,
      }),
    });
  } catch (error) {
    console.error("Update trip budget error:", error);
    const mapped = mapSupabaseError(error);
    return res.status(mapped.status).json({ message: mapped.message });
  }
};

const endTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const requesterId = getRequesterId(req);

    if (!requesterId || !isUuid(requesterId)) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!isUuid(tripId)) {
      return res.status(400).json({ message: "Invalid trip id" });
    }

    const tripRow = await fetchTripSnapshot(tripId);
    if (!isTripAdminUser(tripRow, requesterId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { error } = await getSupabase()
      .from("trips")
      .update({ status: "COMPLETED" })
      .eq("id", tripId);

    if (error) {
      const mapped = mapSupabaseError(error);
      return res.status(mapped.status).json({ message: mapped.message });
    }

    const updatedTrip = await fetchTripSnapshot(tripId);
    const io = req.app.get("io");
    await createAndEmitActivity({
      io,
      tripId,
      userId: requesterId,
      text: `${getRequesterName(req)} ended the trip. No further expenses can be added.`,
      type: "system",
    });
    io?.to(String(tripId)).emit("trip_ended");

    return res.status(200).json({
      trip: mapLegacyTrip(updatedTrip, {
        populateAdmin: false,
        populateMembers: false,
        populateAdmins: false,
      }),
    });
  } catch (error) {
    console.error("End trip error:", error);
    const mapped = mapSupabaseError(error);
    return res.status(mapped.status).json({ message: mapped.message });
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

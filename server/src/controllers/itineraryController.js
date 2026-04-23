const {
  getRequesterId,
  getRequesterName,
  isUuid,
  parseAmount,
  parseTripMeta,
  toLegacyTripStatus,
} = require("../lib/legacyCompat");
const { createAndEmitActivity } = require("../services/activityFeedService");
const {
  deleteItineraryItem,
  fetchActivityRecord,
  fetchItineraryItems,
  insertItineraryItem,
  updateItineraryItem,
} = require("../services/itineraryDataService");
const { loadTripExpenses } = require("../services/splitwiseService");
const { runBudgetOptimizer } = require("../services/budgetOptimizer");
const {
  fetchTripSnapshot,
  getMembershipForUser,
  isTripAdminUser,
} = require("../services/tripDataService");

const isValidCoordinates = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return false;
  }

  const [lng, lat] = coordinates;
  return (
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    typeof lat === "number" &&
    Number.isFinite(lat)
  );
};

const ensureTripExistsAndMember = async ({ tripId, userId }) => {
  const tripRow = await fetchTripSnapshot(tripId);
  if (!tripRow) {
    return { ok: false, status: 404, message: "Trip not found" };
  }

  if (!getMembershipForUser(tripRow, userId)) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  return { ok: true, trip: tripRow };
};

const ensureTripAdminCanModify = async ({ tripId, userId }) => {
  const tripRow = await fetchTripSnapshot(tripId);
  if (!tripRow) {
    return { ok: false, status: 404, message: "Trip not found" };
  }

  if (toLegacyTripStatus(tripRow.status) === "ended") {
    return { ok: false, status: 403, message: "Trip has ended." };
  }

  if (!isTripAdminUser(tripRow, userId)) {
    return {
      ok: false,
      status: 403,
      message: "Only admins can modify the itinerary.",
    };
  }

  return { ok: true, trip: tripRow };
};

const getBudgetStats = async (tripRow, tripId) => {
  const items = await fetchItineraryItems(tripId);
  const expenses = await loadTripExpenses(tripId);
  const totalBudget = parseAmount(parseTripMeta(tripRow.cover_image_key).totalBudget);
  const totalSpent = parseAmount(
    expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  );
  const remainingBudget = parseAmount(totalBudget - totalSpent);
  const unvisitedCost = parseAmount(
    items.reduce(
      (sum, item) => (item.visited || item.isSkipped ? sum : sum + Number(item.estimated_cost || 0)),
      0
    )
  );

  return { items, remainingBudget, unvisitedCost };
};

const addItineraryItem = async (req, res) => {
  try {
    const userId = getRequesterId(req);
    const { tripId } = req.params;
    const { location_name, coordinates, estimated_cost, priority_score, scheduled_time } = req.body;

    if (!userId || !isUuid(userId)) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!isUuid(tripId)) {
      return res.status(400).json({ message: "Invalid tripId" });
    }

    if (!location_name || typeof location_name !== "string") {
      return res.status(400).json({ message: "location_name is required" });
    }

    if (coordinates && !isValidCoordinates(coordinates)) {
      return res.status(400).json({ message: "coordinates must be [lng, lat] numbers" });
    }

    if (!scheduled_time) {
      return res.status(400).json({ message: "scheduled_time is required" });
    }

    if (Number.isNaN(new Date(scheduled_time).getTime())) {
      return res.status(400).json({ message: "scheduled_time is invalid" });
    }

    const adminAccess = await ensureTripAdminCanModify({ tripId, userId });
    if (!adminAccess.ok) {
      return res.status(adminAccess.status).json({ message: adminAccess.message });
    }

    const item = await insertItineraryItem({
      tripId,
      userId,
      location_name: location_name.trim(),
      estimated_cost:
        typeof estimated_cost === "number" && Number.isFinite(estimated_cost)
          ? estimated_cost
          : 0,
      priority_score:
        typeof priority_score === "number" && Number.isFinite(priority_score)
          ? priority_score
          : 3,
      scheduled_time,
      coordinates: coordinates || [0, 0],
      activity: "",
    });

    const io = req.app.get("io");
    await createAndEmitActivity({
      io,
      tripId,
      userId,
      text: `${getRequesterName(req)} manually added an itinerary stop.`,
      type: "system",
    });
    io?.to(String(tripId)).emit("itinerary_updated");

    return res.status(201).json({ item });
  } catch (error) {
    console.error("Add itinerary item error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getItinerary = async (req, res) => {
  try {
    const userId = getRequesterId(req);
    const { tripId } = req.params;

    if (!userId || !isUuid(userId)) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!isUuid(tripId)) {
      return res.status(400).json({ message: "Invalid tripId" });
    }

    const membership = await ensureTripExistsAndMember({ tripId, userId });
    if (!membership.ok) {
      return res.status(membership.status).json({ message: membership.message });
    }

    const { items, remainingBudget, unvisitedCost } = await getBudgetStats(
      membership.trip,
      tripId
    );

    return res.status(200).json({
      itinerary: items,
      remainingBudget,
      unvisitedCost,
    });
  } catch (error) {
    console.error("Get itinerary error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const updateItineraryItemHandler = async (req, res) => {
  try {
    const userId = getRequesterId(req);
    const { itemId } = req.params;

    if (!userId || !isUuid(userId)) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!isUuid(itemId)) {
      return res.status(400).json({ message: "Invalid itemId" });
    }

    const existing = await fetchActivityRecord(itemId);
    if (!existing) {
      return res.status(404).json({ message: "Itinerary item not found" });
    }

    const tripId = existing.itinerary_day?.trip_id;
    const adminAccess = await ensureTripAdminCanModify({ tripId, userId });
    if (!adminAccess.ok) {
      return res.status(adminAccess.status).json({ message: adminAccess.message });
    }

    const updates = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(updates, "coordinates")) {
      if (!isValidCoordinates(updates.coordinates)) {
        return res.status(400).json({ message: "coordinates must be [lng, lat] numbers" });
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "scheduled_time")) {
      if (Number.isNaN(new Date(updates.scheduled_time).getTime())) {
        return res.status(400).json({ message: "scheduled_time is invalid" });
      }
    }

    delete updates.tripId;
    const updated = await updateItineraryItem(existing, updates);

    const io = req.app.get("io");
    await createAndEmitActivity({
      io,
      tripId,
      userId,
      text: `${getRequesterName(req)} manually updated the itinerary.`,
      type: "system",
    });
    io?.to(String(tripId)).emit("itinerary_updated");

    return res.status(200).json({ item: updated });
  } catch (error) {
    console.error("Update itinerary item error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const deleteItineraryItemHandler = async (req, res) => {
  try {
    const userId = getRequesterId(req);
    const { itemId } = req.params;

    if (!userId || !isUuid(userId)) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!isUuid(itemId)) {
      return res.status(400).json({ message: "Invalid itemId" });
    }

    const existing = await fetchActivityRecord(itemId);
    if (!existing) {
      return res.status(404).json({ message: "Itinerary item not found" });
    }

    const tripId = existing.itinerary_day?.trip_id;
    const adminAccess = await ensureTripAdminCanModify({ tripId, userId });
    if (!adminAccess.ok) {
      return res.status(adminAccess.status).json({ message: adminAccess.message });
    }

    await deleteItineraryItem(itemId);

    const io = req.app.get("io");
    await createAndEmitActivity({
      io,
      tripId,
      userId,
      text: `${getRequesterName(req)} manually updated the itinerary.`,
      type: "system",
    });
    io?.to(String(tripId)).emit("itinerary_updated");

    return res.status(200).json({ message: "Itinerary item deleted successfully" });
  } catch (error) {
    console.error("Delete itinerary item error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const toggleVisitedStatus = async (req, res) => {
  try {
    const userId = getRequesterId(req);
    const { itemId } = req.params;

    if (!userId || !isUuid(userId)) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!isUuid(itemId)) {
      return res.status(400).json({ message: "Invalid itemId" });
    }

    const existing = await fetchActivityRecord(itemId);
    if (!existing) {
      return res.status(404).json({ message: "Itinerary item not found" });
    }

    const tripId = existing.itinerary_day?.trip_id;
    const membership = await ensureTripExistsAndMember({ tripId, userId });
    if (!membership.ok) {
      return res.status(membership.status).json({ message: membership.message });
    }

    if (toLegacyTripStatus(membership.trip.status) === "ended") {
      return res.status(403).json({
        message: "This trip has ended. No further transactions are allowed.",
      });
    }

    const currentItems = await fetchItineraryItems(tripId);
    const currentItem = currentItems.find((item) => String(item._id) === String(itemId));
    const updated = await updateItineraryItem(existing, {
      visited: !currentItem?.visited,
    });

    const io = req.app.get("io");
    if (updated.visited === false) {
      await runBudgetOptimizer(tripId, io);
    }

    io?.to(String(tripId)).emit("itinerary_updated");
    return res.status(200).json(updated);
  } catch (error) {
    console.error("Toggle visited status error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  addItineraryItem,
  getItinerary,
  updateItineraryItem: updateItineraryItemHandler,
  deleteItineraryItem: deleteItineraryItemHandler,
  toggleVisitedStatus,
};

const mongoose = require("mongoose");
const Trip = require("../models/Trip");
const ItineraryItem = require("../models/ItineraryItem");

const getUserIdFromReq = (req) => (req.user && (req.user.id || req.user._id)) || null;

//Note: The server expects a flat coordinates: [lng, lat] array directly in the request body rather than a nested location object — the controller wraps it into GeoJSON internally.

const isValidCoordinates = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return false;
  const [lng, lat] = coordinates;
  return (
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    typeof lat === "number" &&
    Number.isFinite(lat)
  );
};

const ensureTripExistsAndMember = async ({ tripId, userId }) => {
  const trip = await Trip.findById(tripId).select("_id members");
  if (!trip) {
    return { ok: false, status: 404, message: "Trip not found" };
  }

  const isMember = trip.members.some(
    (memberId) => memberId.toString() === userId.toString()
  );

  if (!isMember) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  return { ok: true, trip };
};

const addItineraryItem = async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    const { tripId } = req.params;
    const {
      location_name,
      coordinates,
      estimated_cost,
      priority_score,
      scheduled_time,
    } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(tripId)) {
      return res.status(400).json({ message: "Invalid tripId" });
    }

    if (!location_name || typeof location_name !== "string") {
      return res.status(400).json({ message: "location_name is required" });
    }

    if (!isValidCoordinates(coordinates)) {
      return res
        .status(400)
        .json({ message: "coordinates must be [lng, lat] numbers" });
    }

    if (!scheduled_time) {
      return res.status(400).json({ message: "scheduled_time is required" });
    }

    const parsedDate = new Date(scheduled_time);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "scheduled_time is invalid" });
    }

    const membership = await ensureTripExistsAndMember({ tripId, userId });
    if (!membership.ok) {
      return res.status(membership.status).json({ message: membership.message });
    }

    const item = await ItineraryItem.create({
      tripId,
      location_name: location_name.trim(),
      location: {
        type: "Point",
        coordinates,
      },
      estimated_cost:
        typeof estimated_cost === "number" && Number.isFinite(estimated_cost)
          ? estimated_cost
          : 0,
      priority_score:
        typeof priority_score === "number" ? priority_score : undefined,
      scheduled_time: parsedDate,
    });

    return res.status(201).json({ item });
  } catch (error) {
    console.error("Add itinerary item error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getItinerary = async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    const { tripId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(tripId)) {
      return res.status(400).json({ message: "Invalid tripId" });
    }

    const membership = await ensureTripExistsAndMember({ tripId, userId });
    if (!membership.ok) {
      return res.status(membership.status).json({ message: membership.message });
    }

    const items = await ItineraryItem.find({ tripId }).sort({ scheduled_time: 1 });
    return res.status(200).json({ items });
  } catch (error) {
    console.error("Get itinerary error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const updateItineraryItem = async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    const { itemId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ message: "Invalid itemId" });
    }

    const existing = await ItineraryItem.findById(itemId);
    if (!existing) {
      return res.status(404).json({ message: "Itinerary item not found" });
    }

    // Security: prevent non-members from updating items via guessed IDs
    const membership = await ensureTripExistsAndMember({
      tripId: existing.tripId,
      userId,
    });
    if (!membership.ok) {
      return res.status(membership.status).json({ message: membership.message });
    }

    const updates = { ...req.body };

    // Normalize GeoJSON input if client sends `coordinates`
    if (Object.prototype.hasOwnProperty.call(updates, "coordinates")) {
      if (!isValidCoordinates(updates.coordinates)) {
        return res
          .status(400)
          .json({ message: "coordinates must be [lng, lat] numbers" });
      }
      updates.location = { type: "Point", coordinates: updates.coordinates };
      delete updates.coordinates;
    }

    if (Object.prototype.hasOwnProperty.call(updates, "scheduled_time")) {
      const parsedDate = new Date(updates.scheduled_time);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: "scheduled_time is invalid" });
      }
      updates.scheduled_time = parsedDate;
    }

    // Do not allow trip reassignment through this endpoint
    delete updates.tripId;

    const updated = await ItineraryItem.findByIdAndUpdate(itemId, updates, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({ item: updated });
  } catch (error) {
    console.error("Update itinerary item error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const deleteItineraryItem = async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    const { itemId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ message: "Invalid itemId" });
    }

    const existing = await ItineraryItem.findById(itemId);
    if (!existing) {
      return res.status(404).json({ message: "Itinerary item not found" });
    }

    // Security: prevent non-members from deleting items via guessed IDs
    const membership = await ensureTripExistsAndMember({
      tripId: existing.tripId,
      userId,
    });
    if (!membership.ok) {
      return res.status(membership.status).json({ message: membership.message });
    }

    await ItineraryItem.findByIdAndDelete(itemId);
    return res.status(200).json({ message: "Itinerary item deleted successfully" });
  } catch (error) {
    console.error("Delete itinerary item error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  addItineraryItem,
  getItinerary,
  updateItineraryItem,
  deleteItineraryItem,
};


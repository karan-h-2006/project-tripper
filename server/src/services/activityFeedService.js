const crypto = require("crypto");
const { getSupabase } = require("../lib/supabase");
const {
  ACTIVITY_ENTITY_TYPE,
  USER_SELECT,
  buildLegacyActivity,
  mapLegacyUser,
  mapSupabaseError,
} = require("../lib/legacyCompat");

const emitActivity = (io, tripId, activity) => {
  if (!io) {
    return;
  }

  io.to(String(tripId)).emit("receive_message", activity);
};

const createActivity = async ({ tripId, userId = null, text, type = "system" }) => {
  const activityId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const { error } = await getSupabase().from("audit_log").insert({
    actor_id: userId || null,
    entity_type: ACTIVITY_ENTITY_TYPE(tripId),
    entity_id: activityId,
    operation: "INSERT",
    new_values: {
      tripId: String(tripId),
      userId: userId || null,
      text,
      type,
      createdAt,
    },
  });

  if (error) {
    throw error;
  }

  let user = null;
  if (userId) {
    const { data: userRow } = await getSupabase()
      .from("users")
      .select(USER_SELECT)
      .eq("id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (userRow) {
      user = mapLegacyUser(userRow, { compact: true });
    }
  }

  return buildLegacyActivity({
    id: activityId,
    tripId: String(tripId),
    user,
    userId,
    text,
    type,
    createdAt,
  });
};

const createAndEmitActivity = async ({ io, tripId, userId = null, text, type = "system" }) => {
  try {
    const activity = await createActivity({ tripId, userId, text, type });
    emitActivity(io, tripId, activity);
    return activity;
  } catch (error) {
    console.error("Activity feed persistence error:", mapSupabaseError(error).message);
    const fallback = buildLegacyActivity({
      id: crypto.randomUUID(),
      tripId: String(tripId),
      userId,
      text,
      type,
      createdAt: new Date().toISOString(),
    });
    emitActivity(io, tripId, fallback);
    return fallback;
  }
};

const listActivities = async (tripId) => {
  const { data, error } = await getSupabase()
    .from("audit_log")
    .select("id, actor_id, entity_id, new_values, occurred_at")
    .eq("entity_type", ACTIVITY_ENTITY_TYPE(tripId))
    .order("occurred_at", { ascending: true });

  if (error) {
    throw error;
  }

  const actorIds = [...new Set((data || []).map((row) => row.actor_id).filter(Boolean))];
  const userMap = new Map();

  if (actorIds.length > 0) {
    const { data: users } = await getSupabase()
      .from("users")
      .select(USER_SELECT)
      .in("id", actorIds)
      .is("deleted_at", null);

    (users || []).forEach((userRow) => {
      userMap.set(userRow.id, mapLegacyUser(userRow, { compact: true }));
    });
  }

  return (data || []).map((row) => {
    const payload = row.new_values || {};
    const userId = payload.userId || row.actor_id || null;
    return buildLegacyActivity({
      id: row.entity_id || row.id,
      tripId: payload.tripId || String(tripId),
      user: userId ? userMap.get(userId) || null : null,
      userId,
      text: payload.text || "",
      type: payload.type || "chat",
      createdAt: payload.createdAt || row.occurred_at,
    });
  });
};

module.exports = {
  createActivity,
  createAndEmitActivity,
  emitActivity,
  listActivities,
};

const crypto = require("crypto");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_META_PREFIX = "__TRIPPER_USER_META__:";
const TRIP_META_PREFIX = "__TRIPPER_TRIP_META__:";
const EXPENSE_META_PREFIX = "__TRIPPER_EXPENSE_META__:";
const ITINERARY_META_PREFIX = "__TRIPPER_ITINERARY_META__:";
const ACTIVE_ADMIN_ROLES = new Set(["OWNER", "ADMIN"]);

const USER_SELECT = "id, email, display_name, avatar_url, password_hash, google_id, timezone, created_at, updated_at, deleted_at";
const TRIP_WITH_MEMBERS_SELECT = `
  id,
  title,
  description,
  base_currency,
  status,
  start_date,
  end_date,
  cover_image_key,
  version,
  created_at,
  updated_at,
  trip_members (
    id,
    trip_id,
    user_id,
    role,
    invited_by,
    joined_at,
    removed_at,
    user:users!trip_members_user_id_fkey (
      id,
      email,
      display_name,
      avatar_url,
      timezone,
      created_at,
      updated_at,
      deleted_at
    )
  )
`;

const EXPENSE_SELECT = `
  id,
  trip_id,
  paid_by,
  title,
  amount,
  currency,
  category,
  notes,
  occurred_at,
  created_at,
  updated_at,
  payer:users!expenses_paid_by_fkey (
    id,
    email,
    display_name,
    avatar_url,
    timezone,
    created_at,
    updated_at,
    deleted_at
  ),
  expense_splits (
    id,
    expense_id,
    user_id,
    share_amount,
    share_ratio,
    is_paid,
    created_at
  )
`;

const ACTIVITY_ENTITY_TYPE = (tripId) => `activity_feed:${tripId}`;

const isUuid = (value) => UUID_REGEX.test(String(value || "").trim());

const parsePrefixedJson = (rawValue, prefix, fallback) => {
  if (typeof rawValue !== "string" || !rawValue.startsWith(prefix)) {
    return fallback;
  }

  try {
    return {
      ...fallback,
      ...JSON.parse(rawValue.slice(prefix.length)),
    };
  } catch (error) {
    return fallback;
  }
};

const serializePrefixedJson = (prefix, payload) => `${prefix}${JSON.stringify(payload)}`;

const parseUserMeta = (timezoneValue) =>
  parsePrefixedJson(timezoneValue, USER_META_PREFIX, {
    timezone: typeof timezoneValue === "string" && timezoneValue ? timezoneValue : "UTC",
    passwordHash: null,
    googleId: null,
  });

const serializeUserMeta = ({ timezone = "UTC", passwordHash = null, googleId = null }) =>
  serializePrefixedJson(USER_META_PREFIX, {
    timezone,
    passwordHash,
    googleId,
  });

const parseTripMeta = (coverImageKey) =>
  parsePrefixedJson(coverImageKey, TRIP_META_PREFIX, {
    joinCode: null,
    totalBudget: 0,
    coverImageKey:
      typeof coverImageKey === "string" && !coverImageKey.startsWith(TRIP_META_PREFIX)
        ? coverImageKey
        : null,
  });

const serializeTripMeta = ({ joinCode, totalBudget, coverImageKey = null }) =>
  serializePrefixedJson(TRIP_META_PREFIX, {
    joinCode,
    totalBudget: parseAmount(totalBudget),
    coverImageKey,
  });

const parseExpenseMeta = (notesValue) =>
  parsePrefixedJson(notesValue, EXPENSE_META_PREFIX, {
    description: "",
    prevHash: "0",
    currHash: "",
    category: null,
  });

const serializeExpenseMeta = ({ description, prevHash, currHash, category = null }) =>
  serializePrefixedJson(EXPENSE_META_PREFIX, {
    description,
    prevHash,
    currHash,
    category,
  });

const parseItineraryMeta = (metadataValue = {}) => {
  if (metadataValue && typeof metadataValue === "object" && !Array.isArray(metadataValue)) {
    const legacy = metadataValue.legacy || metadataValue;
    return {
      estimated_cost: parseAmount(legacy.estimated_cost),
      priority_score: Number.isFinite(Number(legacy.priority_score))
        ? Number(legacy.priority_score)
        : 3,
      visited: Boolean(legacy.visited),
      isSkipped: Boolean(legacy.isSkipped),
      coordinates: Array.isArray(legacy.coordinates) && legacy.coordinates.length === 2
        ? legacy.coordinates.map((value) => Number(value))
        : [0, 0],
      day: legacy.day ?? null,
      activity: legacy.activity || "",
      scheduled_time:
        typeof legacy.scheduled_time === "string" && legacy.scheduled_time
          ? legacy.scheduled_time
          : null,
    };
  }

  const parsed = parsePrefixedJson(metadataValue, ITINERARY_META_PREFIX, null);
  if (parsed) {
    return {
      estimated_cost: parseAmount(parsed.estimated_cost),
      priority_score: Number.isFinite(Number(parsed.priority_score))
        ? Number(parsed.priority_score)
        : 3,
      visited: Boolean(parsed.visited),
      isSkipped: Boolean(parsed.isSkipped),
      coordinates: Array.isArray(parsed.coordinates) && parsed.coordinates.length === 2
        ? parsed.coordinates.map((value) => Number(value))
        : [0, 0],
      day: parsed.day ?? null,
      activity: parsed.activity || "",
      scheduled_time: parsed.scheduled_time || null,
    };
  }

  return {
    estimated_cost: 0,
    priority_score: 3,
    visited: false,
    isSkipped: false,
    coordinates: [0, 0],
    day: null,
    activity: "",
    scheduled_time: null,
  };
};

const buildItineraryMeta = ({
  estimated_cost = 0,
  priority_score = 3,
  visited = false,
  isSkipped = false,
  coordinates = [0, 0],
  day = null,
  activity = "",
  scheduled_time = null,
}) => ({
  legacy: {
    estimated_cost: parseAmount(estimated_cost),
    priority_score: Number.isFinite(Number(priority_score)) ? Number(priority_score) : 3,
    visited: Boolean(visited),
    isSkipped: Boolean(isSkipped),
    coordinates:
      Array.isArray(coordinates) && coordinates.length === 2
        ? coordinates.map((value) => Number(value))
        : [0, 0],
    day,
    activity,
    scheduled_time,
  },
});

const parseAmount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

const buildJoinCodeFromTripId = (tripId) =>
  String(tripId || "")
    .replace(/-/g, "")
    .slice(0, 6)
    .toUpperCase();

const toLegacyTripStatus = (status) =>
  ["COMPLETED", "ARCHIVED"].includes(String(status || "").toUpperCase())
    ? "ended"
    : "active";

const toSqlTripStatus = (legacyStatus) =>
  String(legacyStatus || "").toLowerCase() === "ended" ? "COMPLETED" : "ACTIVE";

const mapLegacyUser = (userRow, { compact = false } = {}) => {
  if (!userRow) {
    return null;
  }

  const meta = parseUserMeta(userRow.timezone);
  const mapped = {
    _id: userRow.id,
    username: userRow.display_name || "Unknown user",
    email: userRow.email || "",
    profilePic: userRow.avatar_url || null,
    googleId: userRow.google_id || meta.googleId || null,
    createdAt: userRow.created_at || null,
    updatedAt: userRow.updated_at || null,
  };

  if (!compact) {
    mapped.trips = [];
  }

  return mapped;
};

const sortMembers = (members = []) =>
  [...members].sort((left, right) => {
    const leftTime = new Date(left.joined_at || 0).getTime();
    const rightTime = new Date(right.joined_at || 0).getTime();
    return leftTime - rightTime;
  });

const getActiveMembers = (tripRow) =>
  sortMembers((tripRow?.trip_members || []).filter((member) => !member.removed_at));

const getOwnerMember = (tripRow) =>
  getActiveMembers(tripRow).find((member) => member.role === "OWNER") ||
  getActiveMembers(tripRow)[0] ||
  null;

const getAdminMembers = (tripRow) =>
  getActiveMembers(tripRow).filter((member) => ACTIVE_ADMIN_ROLES.has(member.role));

const mapLegacyTrip = (
  tripRow,
  {
    populateAdmin = false,
    populateMembers = false,
    populateAdmins = false,
    compactMembers = false,
    compactAdmins = false,
  } = {}
) => {
  const meta = parseTripMeta(tripRow.cover_image_key);
  const ownerMember = getOwnerMember(tripRow);
  const adminMembers = getAdminMembers(tripRow);
  const activeMembers = getActiveMembers(tripRow);

  return {
    _id: tripRow.id,
    title: tripRow.title,
    description: tripRow.description || "",
    join_code: meta.joinCode || buildJoinCodeFromTripId(tripRow.id),
    admin: populateAdmin
      ? mapLegacyUser(ownerMember?.user, { compact: true })
      : ownerMember?.user_id || null,
    admins: populateAdmins
      ? adminMembers
          .map((member) => mapLegacyUser(member.user, { compact: compactAdmins }))
          .filter(Boolean)
      : adminMembers.map((member) => member.user_id),
    members: populateMembers
      ? activeMembers
          .map((member) => mapLegacyUser(member.user, { compact: compactMembers }))
          .filter(Boolean)
      : activeMembers.map((member) => member.user_id),
    total_budget: parseAmount(meta.totalBudget),
    balances: [],
    status: toLegacyTripStatus(tripRow.status),
    createdAt: tripRow.created_at,
    updatedAt: tripRow.updated_at,
  };
};

const getRequesterId = (req) => {
  const rawId = req.user && (req.user.id || req.user._id);
  return rawId ? String(rawId) : "";
};

const getRequesterName = (req) => req.user?.username || req.user?.display_name || "A member";

const combineDateAndTime = (planDate, startTime, fallbackScheduledTime = null) => {
  if (fallbackScheduledTime) {
    return fallbackScheduledTime;
  }

  if (!planDate) {
    return null;
  }

  const datePart =
    typeof planDate === "string" ? planDate : new Date(planDate).toISOString().slice(0, 10);
  const timePart = startTime ? String(startTime).slice(0, 8) : "00:00:00";
  return `${datePart}T${timePart}`;
};

const mapLegacyItineraryItem = (activityRow) => {
  const meta = parseItineraryMeta(activityRow.metadata);
  const itineraryDay = activityRow.itinerary_day || activityRow.day || null;
  const coordinates =
    Array.isArray(meta.coordinates) && meta.coordinates.length === 2
      ? meta.coordinates
      : activityRow.longitude != null && activityRow.latitude != null
      ? [Number(activityRow.longitude), Number(activityRow.latitude)]
      : [0, 0];

  return {
    _id: activityRow.id,
    tripId: itineraryDay?.trip_id || null,
    location_name: activityRow.title || "",
    location: {
      type: "Point",
      coordinates,
    },
    estimated_cost: parseAmount(meta.estimated_cost),
    priority_score: Number(meta.priority_score || 3),
    scheduled_time: combineDateAndTime(
      itineraryDay?.plan_date,
      activityRow.start_time,
      meta.scheduled_time
    ),
    visited: Boolean(meta.visited),
    isSkipped: Boolean(meta.isSkipped),
    day: meta.day,
    activity: meta.activity || activityRow.notes || "",
    createdAt: activityRow.created_at || null,
    updatedAt: activityRow.updated_at || null,
  };
};

const buildLegacyActivity = ({ id, tripId, user = null, userId = null, text, type, createdAt }) => ({
  _id: id || crypto.randomUUID(),
  tripId,
  userId: user || userId || null,
  text,
  type: type || "chat",
  createdAt: createdAt || new Date().toISOString(),
});

const mapSupabaseError = (error, fallbackMessage = "Server error") => {
  if (!error) {
    return { status: 500, message: fallbackMessage };
  }

  if (error.code === "PGRST116") {
    return { status: 404, message: "Not found" };
  }

  if (["22P02", "23503"].includes(error.code)) {
    return { status: 400, message: error.message || fallbackMessage };
  }

  if (["23505", "P0001"].includes(error.code)) {
    return { status: 409, message: error.message || fallbackMessage };
  }

  if (
    typeof error.message === "string" &&
    error.message.includes("Cannot remove the last OWNER")
  ) {
    return { status: 409, message: error.message };
  }

  return { status: 500, message: error.message || fallbackMessage };
};

module.exports = {
  ACTIVE_ADMIN_ROLES,
  ACTIVITY_ENTITY_TYPE,
  EXPENSE_SELECT,
  EXPENSE_META_PREFIX,
  ITINERARY_META_PREFIX,
  TRIP_WITH_MEMBERS_SELECT,
  TRIP_META_PREFIX,
  USER_META_PREFIX,
  USER_SELECT,
  buildItineraryMeta,
  buildJoinCodeFromTripId,
  buildLegacyActivity,
  combineDateAndTime,
  getActiveMembers,
  getAdminMembers,
  getOwnerMember,
  getRequesterId,
  getRequesterName,
  isUuid,
  mapLegacyItineraryItem,
  mapLegacyTrip,
  mapLegacyUser,
  mapSupabaseError,
  parseAmount,
  parseExpenseMeta,
  parseItineraryMeta,
  parseTripMeta,
  parseUserMeta,
  serializeExpenseMeta,
  serializeTripMeta,
  serializeUserMeta,
  toLegacyTripStatus,
  toSqlTripStatus,
};

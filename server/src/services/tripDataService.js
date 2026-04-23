const { getSupabase } = require("../lib/supabase");
const {
  ACTIVE_ADMIN_ROLES,
  TRIP_WITH_MEMBERS_SELECT,
  USER_SELECT,
  getActiveMembers,
  mapLegacyTrip,
  mapLegacyUser,
  parseTripMeta,
} = require("../lib/legacyCompat");

const fetchUserById = async (userId) => {
  const { data, error } = await getSupabase()
    .from("users")
    .select(USER_SELECT)
    .eq("id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const fetchUserByEmail = async (email) => {
  const { data, error } = await getSupabase()
    .from("users")
    .select(USER_SELECT)
    .eq("email", String(email || "").toLowerCase())
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const fetchTripSnapshot = async (tripId) => {
  const { data, error } = await getSupabase()
    .from("trips")
    .select(TRIP_WITH_MEMBERS_SELECT)
    .eq("id", tripId)
    .single();

  if (error) {
    throw error;
  }

  return data;
};

const findTripByJoinCode = async (joinCode) => {
  const normalized = String(joinCode || "").trim().toUpperCase();
  const { data, error } = await getSupabase()
    .from("trips")
    .select(TRIP_WITH_MEMBERS_SELECT)
    .ilike("cover_image_key", `%\"joinCode\":\"${normalized}\"%`)
    .limit(1);

  if (error) {
    throw error;
  }

  const exactMatch = (data || []).find((tripRow) => {
    const meta = parseTripMeta(tripRow.cover_image_key);
    return String(meta.joinCode || "").toUpperCase() === normalized;
  });

  return exactMatch || null;
};

const getMembershipForUser = (tripRow, userId) =>
  getActiveMembers(tripRow).find((member) => member.user_id === userId) || null;

const isTripAdminUser = (tripRow, userId) => {
  const membership = getMembershipForUser(tripRow, userId);
  return membership ? ACTIVE_ADMIN_ROLES.has(membership.role) : false;
};

const listTripsForUser = async (userId) => {
  const { data: memberships, error: membershipError } = await getSupabase()
    .from("trip_members")
    .select("trip_id")
    .eq("user_id", userId)
    .is("removed_at", null);

  if (membershipError) {
    throw membershipError;
  }

  const tripIds = [...new Set((memberships || []).map((membership) => membership.trip_id))];
  if (tripIds.length === 0) {
    return [];
  }

  const { data: trips, error: tripError } = await getSupabase()
    .from("trips")
    .select(TRIP_WITH_MEMBERS_SELECT)
    .in("id", tripIds)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (tripError) {
    throw tripError;
  }

  return trips || [];
};

const mapTripMembersAsUsers = (tripRow, { compact = true } = {}) =>
  getActiveMembers(tripRow)
    .map((member) => mapLegacyUser(member.user, { compact }))
    .filter(Boolean);

const mapTripForDashboard = (tripRow) =>
  mapLegacyTrip(tripRow, {
    populateAdmin: true,
    populateMembers: true,
    populateAdmins: false,
    compactMembers: false,
  });

const mapTripForRoom = (tripRow) =>
  mapLegacyTrip(tripRow, {
    populateAdmin: true,
    populateMembers: true,
    populateAdmins: true,
    compactMembers: true,
    compactAdmins: true,
  });

module.exports = {
  fetchTripSnapshot,
  fetchUserByEmail,
  fetchUserById,
  findTripByJoinCode,
  getMembershipForUser,
  isTripAdminUser,
  listTripsForUser,
  mapTripForDashboard,
  mapTripForRoom,
  mapTripMembersAsUsers,
};

const crypto = require("crypto");
const { getSupabase } = require("../lib/supabase");
const {
  buildItineraryMeta,
  mapLegacyItineraryItem,
  parseItineraryMeta,
} = require("../lib/legacyCompat");

const extractDatePart = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
};

const extractTimePart = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(11, 19);
};

const ensureItineraryDay = async (tripId, scheduledTime) => {
  const planDate = extractDatePart(scheduledTime);
  if (!planDate) {
    throw new Error("scheduled_time is invalid");
  }

  const { data: existingDay, error: existingError } = await getSupabase()
    .from("itinerary_days")
    .select("id, trip_id, plan_date, sort_order")
    .eq("trip_id", tripId)
    .eq("plan_date", planDate)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingDay) {
    return existingDay;
  }

  const { data: lastDayRows, error: lastDayError } = await getSupabase()
    .from("itinerary_days")
    .select("sort_order")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (lastDayError) {
    throw lastDayError;
  }

  const nextSortOrder = Number(lastDayRows?.[0]?.sort_order || 0) + 1;

  const { data: insertedRows, error: insertError } = await getSupabase()
    .from("itinerary_days")
    .insert({
      id: crypto.randomUUID(),
      trip_id: tripId,
      plan_date: planDate,
      title: planDate,
      sort_order: nextSortOrder,
    })
    .select("id, trip_id, plan_date, sort_order");

  if (insertError) {
    // Concurrent create can trip the unique constraint; refetch the day.
    const { data: fallbackDay, error: fallbackError } = await getSupabase()
      .from("itinerary_days")
      .select("id, trip_id, plan_date, sort_order")
      .eq("trip_id", tripId)
      .eq("plan_date", planDate)
      .single();

    if (fallbackError) {
      throw insertError;
    }

    return fallbackDay;
  }

  return insertedRows[0];
};

const fetchActivityRecord = async (itemId) => {
  const { data, error } = await getSupabase()
    .from("activities")
    .select(
      `
        id,
        day_id,
        title,
        activity_type,
        start_time,
        end_time,
        address,
        latitude,
        longitude,
        notes,
        metadata,
        sort_order,
        version,
        created_by,
        created_at,
        updated_at,
        itinerary_day:itinerary_days!activities_day_id_fkey (
          id,
          trip_id,
          plan_date,
          sort_order
        )
      `
    )
    .eq("id", itemId)
    .single();

  if (error) {
    throw error;
  }

  return data;
};

const fetchItineraryItems = async (tripId) => {
  const { data: days, error: daysError } = await getSupabase()
    .from("itinerary_days")
    .select("id, trip_id, plan_date, sort_order")
    .eq("trip_id", tripId)
    .order("plan_date", { ascending: true })
    .order("sort_order", { ascending: true });

  if (daysError) {
    throw daysError;
  }

  const dayMap = new Map((days || []).map((day) => [day.id, day]));
  const dayIds = [...dayMap.keys()];
  if (dayIds.length === 0) {
    return [];
  }

  const { data, error } = await getSupabase()
    .from("activities")
    .select(
      `
        id,
        day_id,
        title,
        activity_type,
        start_time,
        end_time,
        address,
        latitude,
        longitude,
        notes,
        metadata,
        sort_order,
        version,
        created_by,
        created_at,
        updated_at
      `
    )
    .in("day_id", dayIds)
    .order("start_time", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || [])
    .map((row) => ({
      ...row,
      itinerary_day: dayMap.get(row.day_id) || null,
    }))
    .sort((left, right) => {
      const leftDate = left.itinerary_day?.plan_date || "";
      const rightDate = right.itinerary_day?.plan_date || "";
      if (leftDate !== rightDate) {
        return leftDate.localeCompare(rightDate);
      }
      const leftTime = left.start_time || "";
      const rightTime = right.start_time || "";
      if (leftTime !== rightTime) {
        return leftTime.localeCompare(rightTime);
      }
      return Number(left.sort_order || 0) - Number(right.sort_order || 0);
    })
    .map(mapLegacyItineraryItem);
};

const insertItineraryItem = async ({
  tripId,
  userId,
  location_name,
  estimated_cost,
  priority_score,
  scheduled_time,
  coordinates = [0, 0],
  activity = "",
}) => {
  const day = await ensureItineraryDay(tripId, scheduled_time);

  const { data: sortRows, error: sortError } = await getSupabase()
    .from("activities")
    .select("sort_order")
    .eq("day_id", day.id)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (sortError) {
    throw sortError;
  }

  const nextSortOrder = Number(sortRows?.[0]?.sort_order || 0) + 1;
  const metadata = buildItineraryMeta({
    estimated_cost,
    priority_score,
    visited: false,
    isSkipped: false,
    coordinates,
    day: null,
    activity,
    scheduled_time,
  });

  const [longitude, latitude] = Array.isArray(coordinates) ? coordinates : [0, 0];

  const { data: insertedRows, error: insertError } = await getSupabase()
    .from("activities")
    .insert({
      id: crypto.randomUUID(),
      day_id: day.id,
      title: location_name,
      activity_type: "OTHER",
      start_time: extractTimePart(scheduled_time),
      notes: activity || null,
      latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : null,
      longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : null,
      metadata,
      sort_order: nextSortOrder,
      created_by: userId,
    })
    .select(
      `
        id,
        day_id,
        title,
        activity_type,
        start_time,
        end_time,
        address,
        latitude,
        longitude,
        notes,
        metadata,
        sort_order,
        version,
        created_by,
        created_at,
        updated_at,
        itinerary_day:itinerary_days!activities_day_id_fkey (
          id,
          trip_id,
          plan_date,
          sort_order
        )
      `
    );

  if (insertError) {
    throw insertError;
  }

  return mapLegacyItineraryItem(insertedRows[0]);
};

const updateItineraryItem = async (existingRow, updates) => {
  const currentMeta = parseItineraryMeta(existingRow.metadata);
  const nextScheduledTime = updates.scheduled_time || currentMeta.scheduled_time;
  const nextCoordinates = Array.isArray(updates.coordinates)
    ? updates.coordinates
    : currentMeta.coordinates;

  let nextDayId = existingRow.day_id;
  if (nextScheduledTime) {
    const currentDatePart = existingRow.itinerary_day?.plan_date || null;
    const nextDatePart = extractDatePart(nextScheduledTime);
    if (nextDatePart && nextDatePart !== currentDatePart) {
      const nextDay = await ensureItineraryDay(existingRow.itinerary_day.trip_id, nextScheduledTime);
      nextDayId = nextDay.id;
    }
  }

  const [longitude, latitude] = Array.isArray(nextCoordinates) ? nextCoordinates : [0, 0];
  const nextMeta = buildItineraryMeta({
    estimated_cost:
      updates.estimated_cost ?? currentMeta.estimated_cost,
    priority_score:
      updates.priority_score ?? currentMeta.priority_score,
    visited: updates.visited ?? currentMeta.visited,
    isSkipped: updates.isSkipped ?? currentMeta.isSkipped,
    coordinates: nextCoordinates,
    day: updates.day ?? currentMeta.day,
    activity: updates.activity ?? currentMeta.activity,
    scheduled_time: nextScheduledTime ?? currentMeta.scheduled_time,
  });

  const payload = {
    day_id: nextDayId,
    title: updates.location_name ?? existingRow.title,
    start_time: nextScheduledTime
      ? extractTimePart(nextScheduledTime)
      : existingRow.start_time,
    notes: updates.activity ?? currentMeta.activity ?? existingRow.notes,
    latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : null,
    longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : null,
    metadata: nextMeta,
    version: Number(existingRow.version || 1) + 1,
  };

  const { data: updatedRows, error } = await getSupabase()
    .from("activities")
    .update(payload)
    .eq("id", existingRow.id)
    .select(
      `
        id,
        day_id,
        title,
        activity_type,
        start_time,
        end_time,
        address,
        latitude,
        longitude,
        notes,
        metadata,
        sort_order,
        version,
        created_by,
        created_at,
        updated_at,
        itinerary_day:itinerary_days!activities_day_id_fkey (
          id,
          trip_id,
          plan_date,
          sort_order
        )
      `
    );

  if (error) {
    throw error;
  }

  return mapLegacyItineraryItem(updatedRows[0]);
};

const deleteItineraryItem = async (itemId) => {
  const { error } = await getSupabase().from("activities").delete().eq("id", itemId);
  if (error) {
    throw error;
  }
};

module.exports = {
  deleteItineraryItem,
  ensureItineraryDay,
  extractDatePart,
  extractTimePart,
  fetchActivityRecord,
  fetchItineraryItems,
  insertItineraryItem,
  updateItineraryItem,
};

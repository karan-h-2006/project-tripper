import { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { CalendarClock, IndianRupee, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "../api/axios";

const ItineraryPanel = ({ tripId, socket, isTripEnded = false, tripData, currentUserId }) => {
  const [itineraryItems, setItineraryItems] = useState([]);
  const [remainingBudget, setRemainingBudget] = useState(0);
  const [unvisitedCost, setUnvisitedCost] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [formData, setFormData] = useState({
    location_name: "",
    estimated_cost: "",
    scheduled_time: "",
  });

  const isCurrentUserAdmin = Array.isArray(tripData?.admins)
    ? tripData.admins.some((admin) => String(admin?._id || admin) === String(currentUserId))
    : false;
  const isTripLocked = tripData?.status === "ended" || isTripEnded;

  const fetchItineraryList = useCallback(async () => {
    if (!tripId) return;

    try {
      const response = await api.get(`/itinerary/${tripId}`);
      const items = response.data?.itinerary || [];
      const budget = Number(response.data?.remainingBudget || 0);
      const upcomingCost = Number(response.data?.unvisitedCost || 0);
      setItineraryItems(items);
      setRemainingBudget(budget);
      setUnvisitedCost(upcomingCost);
      return items;
    } catch (error) {
      console.error("Failed to fetch itinerary:", error);
      return [];
    }
  }, [tripId]);

  const handleToggle = async (itemId) => {
    if (isTripLocked) return;
    try {
      await api.patch(`/itinerary/${itemId}/toggle-visited`);
      await fetchItineraryList();
    } catch (error) {
      console.error("Failed to toggle visited status:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      location_name: "",
      estimated_cost: "",
      scheduled_time: "",
    });
    setEditingItemId(null);
    setShowAddForm(false);
  };

  const handleEditStart = (item) => {
    setEditingItemId(item._id);
    setShowAddForm(true);
    setFormData({
      location_name: item.location_name || "",
      estimated_cost: String(item.estimated_cost ?? ""),
      scheduled_time: item.scheduled_time
        ? new Date(item.scheduled_time).toISOString().slice(0, 16)
        : "",
    });
  };

  const handleDelete = async (itemId) => {
    try {
      await api.delete(`/itinerary/${itemId}`);
      toast.success("Itinerary stop deleted");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete stop");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      location_name: formData.location_name.trim(),
      estimated_cost: Number(formData.estimated_cost || 0),
      scheduled_time: formData.scheduled_time,
    };

    if (!payload.location_name || !payload.scheduled_time) {
      toast.error("Location and schedule are required");
      return;
    }

    try {
      if (editingItemId) {
        await api.put(`/itinerary/${editingItemId}`, payload);
        toast.success("Itinerary stop updated");
      } else {
        await api.post(`/itinerary/${tripId}`, payload);
        toast.success("Itinerary stop added");
      }
      resetForm();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save itinerary stop");
    }
  };

  useEffect(() => {
    fetchItineraryList();
  }, [fetchItineraryList]);

  useEffect(() => {
    if (!socket) return undefined;

    const refreshData = () => {
      fetchItineraryList();
    };

    socket.on("itinerary_updated", refreshData);
    socket.on("budget_updated", refreshData);

    return () => {
      socket.off("itinerary_updated", refreshData);
      socket.off("budget_updated", refreshData);
    };
  }, [socket, tripId, fetchItineraryList]);

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 h-full">
      <div className="text-xl font-bold mb-4">Remaining Budget: ₹{remainingBudget}</div>
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <h2 className="text-base font-semibold text-gray-900">Trip Itinerary</h2>
        <span className="text-xs text-gray-500">{itineraryItems.length} stops</span>
      </div>

      {isCurrentUserAdmin && !isTripLocked && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              if (showAddForm && !editingItemId) {
                resetForm();
                return;
              }
              setShowAddForm(true);
              setEditingItemId(null);
              setFormData({ location_name: "", estimated_cost: "", scheduled_time: "" });
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Stop
          </button>
        </div>
      )}

      {isCurrentUserAdmin && !isTripLocked && showAddForm && (
        <form onSubmit={handleSubmit} className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
          <input
            type="text"
            value={formData.location_name}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, location_name: event.target.value }))
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            placeholder="Location name"
          />
          <div className="grid grid-cols-1 gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.estimated_cost}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, estimated_cost: event.target.value }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              placeholder="Estimated cost"
            />
            <input
              type="datetime-local"
              value={formData.scheduled_time}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, scheduled_time: event.target.value }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
            >
              {editingItemId ? "Save Changes" : "Add Stop"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-4 max-h-[600px] overflow-y-auto pr-1">
        {itineraryItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center">
            <p className="text-sm text-gray-600">No itinerary items yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Add places to start building your timeline.
            </p>
          </div>
        ) : (
          itineraryItems.map((item, index) => (
            <div key={item._id || `${item.location_name}-${index}`} className="relative pl-7">
              {index !== itineraryItems.length - 1 && (
                <span className="absolute left-[11px] top-6 h-[calc(100%+12px)] w-px bg-gray-200" />
              )}
              <span className="absolute left-0 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <MapPin className="h-3.5 w-3.5" />
              </span>

              <div
                className={`rounded-xl border p-3 transition ${
                  item.isSkipped
                    ? "border-red-200 bg-red-50/50 opacity-40 grayscale"
                    : item.visited
                    ? "border-gray-200 bg-gray-100/70 opacity-70"
                    : "border-gray-100 bg-gray-50/60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(item.visited)}
                    onChange={() => handleToggle(item._id)}
                    disabled={isTripLocked || item.isSkipped}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  <p
                    className={`text-sm font-medium ${
                      item.visited ? "text-gray-500 line-through" : "text-gray-900"
                    }`}
                  >
                    {item.location_name}
                  </p>
                  </div>
                  {isCurrentUserAdmin && !isTripLocked && !item.isSkipped && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEditStart(item)}
                        className="rounded p-1 text-amber-600 hover:bg-amber-50"
                        title="Edit stop"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item._id)}
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                        title="Delete stop"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                  <div className="inline-flex items-center gap-1">
                    <IndianRupee className="h-3.5 w-3.5 text-indigo-600" />
                    <span className={item.visited ? "line-through text-gray-500" : ""}>
                      ₹{item.estimated_cost ?? 0}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5 text-indigo-600" />
                    <span className={item.visited ? "line-through text-gray-500" : ""}>
                      {item.scheduled_time
                        ? new Date(item.scheduled_time).toLocaleString()
                        : "Time not set"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div
        className={`mt-6 p-4 rounded-lg font-semibold ${
          unvisitedCost > remainingBudget
            ? "bg-red-50 text-red-600"
            : "bg-green-50 text-green-600"
        }`}
      >
        Total Unvisited Itinerary Cost: ₹{unvisitedCost}
      </div>
    </section>
  );
};

ItineraryPanel.propTypes = {
  tripId: PropTypes.string.isRequired,
  tripData: PropTypes.shape({
    admins: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.object])),
    status: PropTypes.string,
  }),
  currentUserId: PropTypes.string,
  isTripEnded: PropTypes.bool,
  socket: PropTypes.shape({
    on: PropTypes.func,
    off: PropTypes.func,
  }),
};

ItineraryPanel.defaultProps = {
  tripData: null,
  currentUserId: "",
  isTripEnded: false,
  socket: null,
};

export default ItineraryPanel;

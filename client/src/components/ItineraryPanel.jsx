import { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { CalendarClock, IndianRupee, MapPin } from "lucide-react";
import api from "../api/axios";

const ItineraryPanel = ({ tripId, socket }) => {
  const [itineraryItems, setItineraryItems] = useState([]);
  const [remainingBudget, setRemainingBudget] = useState(0);
  const [unvisitedCost, setUnvisitedCost] = useState(0);

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
    try {
      await api.patch(`/itinerary/${itemId}/toggle-visited`);
      await fetchItineraryList();
    } catch (error) {
      console.error("Failed to toggle visited status:", error);
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
                  item.visited
                    ? "border-gray-200 bg-gray-100/70 opacity-70"
                    : "border-gray-100 bg-gray-50/60"
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(item.visited)}
                    onChange={() => handleToggle(item._id)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <p
                    className={`text-sm font-medium ${
                      item.visited ? "text-gray-500 line-through" : "text-gray-900"
                    }`}
                  >
                    {item.location_name}
                  </p>
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
  socket: PropTypes.shape({
    on: PropTypes.func,
    off: PropTypes.func,
  }),
};

ItineraryPanel.defaultProps = {
  socket: null,
};

export default ItineraryPanel;

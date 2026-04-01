import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut,
  MapPin,
  PlusCircle,
  QrCode,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../context/useAuth.js";
import api from "../api/axios";

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [joiningTrip, setJoiningTrip] = useState(false);

  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    total_budget: "",
  });

  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    const fetchTrips = async () => {
      try {
        const res = await api.get("/trips/my");
        const data = res.data;
        const tripsArray = Array.isArray(data?.trips) ? data.trips : [];
        setTrips(tripsArray);
      } catch (error) {
        const message =
          error.response?.data?.message ||
          "Failed to load your trips. Please try again.";
        toast.error(message);
      } finally {
        setLoadingTrips(false);
      }
    };

    fetchTrips();
  }, []);

  const handleCreateTripChange = (e) => {
    const { name, value } = e.target;
    setCreateForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateTrip = async (e) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      toast.error("Trip title is required");
      return;
    }
    setCreatingTrip(true);
    try {
      const payload = {
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        total_budget: createForm.total_budget
          ? Number(createForm.total_budget)
          : 0,
      };
      const res = await api.post("/trips/create", payload);
      const trip = res.data;
      setTrips((prev) => [trip, ...prev]);
      setCreateForm({ title: "", description: "", total_budget: "" });
      toast.success("Trip created");
    } catch (error) {
      const message =
        error.response?.data?.message ||
        "Failed to create trip. Please try again.";
      toast.error(message);
    } finally {
      setCreatingTrip(false);
    }
  };

  const handleJoinTrip = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) {
      toast.error("Enter a 6-character join code");
      return;
    }
    setJoiningTrip(true);
    try {
      const res = await api.post("/users/join", {
        join_code: joinCode.trim().toUpperCase(),
      });
      const joinedTrip = res.data?.trip;
      if (joinedTrip) {
        setTrips((prev) => {
          const exists = prev.some((t) => t._id === joinedTrip._id);
          return exists ? prev : [joinedTrip, ...prev];
        });
      }
      setJoinCode("");
      toast.success("Joined trip successfully");
    } catch (error) {
      const message =
        error.response?.data?.message ||
        "Failed to join trip. Please check the code and try again.";
      toast.error(message);
    } finally {
      setJoiningTrip(false);
    }
  };

  const handleOpenTrip = (trip) => {
    navigate(`/trip/${trip._id}`, { state: { trip } });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-2xl bg-indigo-600 text-white shadow-sm">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Tripper</p>
              <p className="text-xs text-gray-500">
                Hi, {user?.username || user?.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-md border border-gray-100 p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-gray-900">
                Your Trips
              </h2>
              <span className="text-xs text-gray-400">
                {trips.length} active
              </span>
            </div>

            {loadingTrips ? (
              <div className="flex items-center justify-center py-10">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                  <p className="text-xs text-gray-500">
                    Loading your trips...
                  </p>
                </div>
              </div>
            ) : trips.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 mb-3">
                  <MapPin className="w-5 h-5" />
                </div>
                <p className="text-sm font-medium text-gray-900">
                  No trips yet
                </p>
                <p className="mt-1 text-xs text-gray-500 max-w-xs">
                  Create a new trip for your next getaway or join an existing
                  one using a friend&apos;s join code.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {trips.map((trip) => (
                  <button
                    key={trip._id}
                    type="button"
                    onClick={() => handleOpenTrip(trip)}
                    className="flex flex-col items-start rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm hover:shadow-md hover:border-indigo-100 transition"
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <h3 className="text-sm font-semibold text-gray-900 line-clamp-1">
                        {trip.title}
                      </h3>
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                        <Users className="w-3 h-3" />
                        {trip.members?.length ?? 1}
                      </span>
                    </div>
                    {trip.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mb-2">
                        {trip.description}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between w-full text-xs text-gray-500">
                      <span>
                        Budget:{" "}
                        <span className="font-semibold text-gray-800">
                          ₹{trip.total_budget ?? 0}
                        </span>
                      </span>
                      {trip.join_code && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5">
                          Code: {trip.join_code}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">
                  Create new trip
                </h2>
                <PlusCircle className="w-4 h-4 text-indigo-500" />
              </div>
              <form className="space-y-3" onSubmit={handleCreateTrip}>
                <div>
                  <label
                    htmlFor="title"
                    className="block text-xs font-medium text-gray-700"
                  >
                    Trip title
                  </label>
                  <input
                    id="title"
                    name="title"
                    type="text"
                    value={createForm.title}
                    onChange={handleCreateTripChange}
                    className="mt-1 block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Goa with friends"
                  />
                </div>
                <div>
                  <label
                    htmlFor="description"
                    className="block text-xs font-medium text-gray-700"
                  >
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={2}
                    value={createForm.description}
                    onChange={handleCreateTripChange}
                    className="mt-1 block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    placeholder="Long weekend, 4 friends, 3 nights"
                  />
                </div>
                <div>
                  <label
                    htmlFor="total_budget"
                    className="block text-xs font-medium text-gray-700"
                  >
                    Total budget (₹)
                  </label>
                  <input
                    id="total_budget"
                    name="total_budget"
                    type="number"
                    min="0"
                    value={createForm.total_budget}
                    onChange={handleCreateTripChange}
                    className="mt-1 block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Optional"
                  />
                </div>
                <button
                  type="submit"
                  disabled={creatingTrip}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-medium text-white shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  <PlusCircle className="w-4 h-4" />
                  {creatingTrip ? "Creating..." : "Create trip"}
                </button>
              </form>
            </div>

            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">
                  Join a trip
                </h2>
                <QrCode className="w-4 h-4 text-indigo-500" />
              </div>
              <form className="space-y-3" onSubmit={handleJoinTrip}>
                <div>
                  <label
                    htmlFor="joinCode"
                    className="block text-xs font-medium text-gray-700"
                  >
                    6-character join code
                  </label>
                  <input
                    id="joinCode"
                    name="joinCode"
                    type="text"
                    maxLength={6}
                    value={joinCode}
                    onChange={(e) =>
                      setJoinCode(e.target.value.toUpperCase())
                    }
                    className="mt-1 block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs shadow-sm tracking-[0.3em] uppercase focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="ABC123"
                  />
                </div>
                <button
                  type="submit"
                  disabled={joiningTrip}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-600 bg-white px-3 py-2 text-xs font-medium text-indigo-700 shadow-sm hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  <Users className="w-4 h-4" />
                  {joiningTrip ? "Joining..." : "Join trip"}
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Dashboard;


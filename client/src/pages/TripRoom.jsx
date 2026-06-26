import { useCallback, useEffect, useState } from "react";
import { io } from 'socket.io-client';
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, IndianRupee, KeyRound, MapPinned, QrCode } from "lucide-react";
import toast from "react-hot-toast";
import api, { API_ORIGIN } from "../api/axios";
import { useAuth } from "../context/useAuth.js";
import ActivityFeed from "../components/ActivityFeed.jsx";
import ItineraryPanel from "../components/ItineraryPanel.jsx";
import UpiScannerModal from "../components/UpiScannerModal.jsx";
import LedgerPanel from "../components/LedgerPanel.jsx";
import MembersPanel from "../components/MembersPanel.jsx";

const TripRoom = () => {
  const { id } = useParams();
  const tripId = id;
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const currentUserId = user?._id || "";
  const [trip, setTrip] = useState(location.state?.trip || null);
  const [loading, setLoading] = useState(!location.state?.trip);
  const [upiModalOpen, setUpiModalOpen] = useState(false);
  const [socket, setSocket] = useState(null);
  const [ledgerRefresh, setLedgerRefresh] = useState(0);

  const fetchTripData = useCallback(
    async ({ suppressRedirect = false } = {}) => {
      if (!id) return;
      try {
        const res = await api.get(`/trips/${id}`);
        setTrip(res.data?.trip || res.data);
      } catch (error) {
        if (!suppressRedirect) {
          const message =
            error.response?.data?.message ||
            "Failed to load trip. Returning to dashboard.";
          toast.error(message);
          navigate("/dashboard", { replace: true });
        }
      } finally {
        if (!suppressRedirect) {
          setLoading(false);
        }
      }
    },
    [id, navigate]
  );

  useEffect(() => {
    if (trip || !id) return;
    fetchTripData();
  }, [id, trip, fetchTripData]);

  const handleRecorded = () => {
    setLedgerRefresh((prev) => prev + 1);
  };

  useEffect(() => {
    const token = localStorage.getItem("tripper_token");
    const socketClient = io(API_ORIGIN, {
      auth: { token },
    });
    setSocket(socketClient);

    if (id) {
      socketClient.emit("join_trip_room", id);
    }

    socketClient.on("budget_updated", (data) => {
      if (data?.message) {
        toast.success(data.message);
      }
    });

    socketClient.on("connect_error", (err) => {
      console.error("Socket connection failed:", err.message);
      toast.error("Real-time connection failed. Please log in again.");
    });

    return () => {
      setSocket(null);
      socketClient.disconnect();
    };
  }, [id]);

  useEffect(() => {
    if (!socket || !tripId) return;

    const refreshTripData = () => {
      fetchTripData({ suppressRedirect: true });
    };

    socket.on("budget_updated", refreshTripData);
    socket.on("trip_members_updated", refreshTripData);
    socket.on("trip_ended", refreshTripData);
    socket.on("user_kicked", (payload) => {
      const kickedId = String(payload?.userId);
      let activeUserId = String(currentUserId);

      try {
        const localUser = JSON.parse(localStorage.getItem("user"));
        if (localUser && localUser._id) {
          activeUserId = String(localUser._id);
        }
      } catch (e) {
        // Ignore malformed local storage fallback values.
      }

      console.log(`[Socket] Kick event received for: ${kickedId}. My ID is: ${activeUserId}`);

      if (kickedId === activeUserId) {
        toast.error("You have been removed from the trip by an Admin.");
        socket.emit("leave_room", tripId);
        navigate("/dashboard");
      }
    });

    return () => {
      socket.off("budget_updated", refreshTripData);
      socket.off("trip_members_updated", refreshTripData);
      socket.off("trip_ended", refreshTripData);
      socket.off("user_kicked");
    };
  }, [socket, tripId, currentUserId, navigate, fetchTripData]);

 
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-xs text-gray-500">Loading trip...</p>
        </div>
      </div>
    );
  }

  if (!trip) {
    return null;
  }

  const isTripEnded = trip.status === "ended";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-100 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-gray-500">
              Share this join code with friends
            </span>
            {trip.join_code && (
              <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800">
                <KeyRound className="w-3 h-3 text-indigo-600" />
                Code: {trip.join_code}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {isTripEnded && (
          <div className="lg:col-span-12 bg-red-100 text-red-800 p-3 text-center font-bold rounded-xl border border-red-200">
            This trip has ended. The ledger is locked and balances are final.
          </div>
        )}

        <section className="lg:col-span-4">
          <ItineraryPanel
            tripId={id}
            socket={socket}
            isTripEnded={isTripEnded}
            tripData={trip}
            currentUserId={currentUserId}
          />
        </section>

        <div className="lg:col-span-5 space-y-5 min-h-0">
        <section className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-indigo-600 text-white shadow-md">
              <MapPinned className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {trip.title}
              </h1>
              {trip.description && (
                <p className="mt-1 text-xs text-gray-500 max-w-xl">
                  {trip.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1">
                  <IndianRupee className="w-3 h-3 text-indigo-600" />
                  <span className="font-medium">
                    Total budget: ₹{trip.total_budget ?? 0}
                  </span>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1">
                  <span>Members:</span>
                  <span className="font-medium">
                    {trip.members?.length ?? 1}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {!isTripEnded && (
            <button
              type="button"
              onClick={() => setUpiModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <QrCode className="w-4 h-4" />
              Scan & Pay
            </button>
          )}
        </section>

        <MembersPanel
          tripData={trip}
          currentUserId={currentUserId}
          onMembersChanged={fetchTripData}
        />

        <LedgerPanel tripId={id} socket={socket} refreshTrigger={ledgerRefresh} />
        </div>

        <section className="lg:col-span-3 min-h-0">
          <ActivityFeed
            tripId={id}
            socket={socket}
            currentUserId={currentUserId}
          />
        </section>
      </main>

      <UpiScannerModal
        open={upiModalOpen}
        onClose={() => setUpiModalOpen(false)}
        tripId={trip._id}
        onRecorded={handleRecorded}
        isTripEnded={isTripEnded}
      />
    </div>
  );
};

export default TripRoom;


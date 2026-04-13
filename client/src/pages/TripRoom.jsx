import { useEffect, useState } from "react";
import { io } from 'socket.io-client';
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, IndianRupee, KeyRound, MapPinned, QrCode } from "lucide-react";
import toast from "react-hot-toast";
import api from "../api/axios";
import { useAuth } from "../context/useAuth.js";
import ActivityFeed from "../components/ActivityFeed.jsx";
import ItineraryPanel from "../components/ItineraryPanel.jsx";
import UpiScannerModal from "../components/UpiScannerModal.jsx";
import LedgerPanel from "../components/LedgerPanel.jsx";
import MembersPanel from "../components/MembersPanel.jsx";

const TripRoom = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [trip, setTrip] = useState(location.state?.trip || null);
  const [loading, setLoading] = useState(!location.state?.trip);
  const [upiModalOpen, setUpiModalOpen] = useState(false);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (trip || !id) return;

    const fetchTrip = async () => {
      try {
        // Assumes a GET /api/trips/:id endpoint that returns the trip.
        // Adjust the path / response shape to match your backend.
        const res = await api.get(`/trips/${id}`);
        setTrip(res.data?.trip || res.data);
      } catch (error) {
        const message =
          error.response?.data?.message ||
          "Failed to load trip. Returning to dashboard.";
        toast.error(message);
        navigate("/dashboard", { replace: true });
      } finally {
        setLoading(false);
      }
    };

    fetchTrip();
  }, [id, trip, navigate]);

  const handleRecorded = () => {
    // In future we can refetch balances or ledger here.
  };

  useEffect(() => {
    // Grab the token from localStorage (or your AuthContext)
    const token = localStorage.getItem('tripper_token'); // Adjust this if you store it differently!

    // Pass the token in the auth object
    const socket = io('http://localhost:5000', {
      auth: {
        token: token
      }
    });
    setSocket(socket);

    if (id) {
      socket.emit('join_trip_room', id);
    }

    socket.on('budget_updated', (data) => {
        toast.success(data.message);
        // fetchTripData(); 
    });

    // Catch authentication errors sent by the backend
    socket.on('connect_error', (err) => {
      console.error('Socket connection failed:', err.message);
      toast.error('Real-time connection failed. Please log in again.');
    });

    return () => {
      setSocket(null);
      socket.disconnect();
    };
  }, [id]);

 
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
        <section className="lg:col-span-4">
          <ItineraryPanel tripId={id} socket={socket} />
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

          <button
            type="button"
            onClick={() => setUpiModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <QrCode className="w-4 h-4" />
            Record UPI expense
          </button>
        </section>

        <MembersPanel tripData={trip} currentUserId={user?._id || ""} />

        <LedgerPanel tripId={id} socket={socket} />
        </div>

        <section className="lg:col-span-3 min-h-0">
          <ActivityFeed
            tripId={id}
            socket={socket}
            currentUserId={user?._id || ""}
          />
        </section>
      </main>

      <UpiScannerModal
        open={upiModalOpen}
        onClose={() => setUpiModalOpen(false)}
        tripId={trip._id}
        onRecorded={handleRecorded}
      />
    </div>
  );
};

export default TripRoom;


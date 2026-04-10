import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import api from "../api/axios";
import { Send } from "lucide-react";

const ActivityFeed = ({ tripId, socket, currentUserId }) => {
  const [activities, setActivities] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activities]);

  useEffect(() => {
    if (!tripId) return;

    const fetchHistory = async () => {
      try {
        const res = await api.get(`/activities/${tripId}`);
        // Backend returns the raw array directly: res.status(200).json(activities)
        setActivities(res.data);
      } catch (err) {
        console.error("Failed to fetch history:", err);
      }
    };

    fetchHistory();
  }, [tripId]);

  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (message) => {
      setActivities((prev) => [...prev, message]);
    };

    socket.on("receive_message", handleReceiveMessage);

    return () => {
      socket.off("receive_message", handleReceiveMessage);
    };
  }, [socket]);

  const sendMessage = () => {
    const trimmedMessage = newMessage.trim();
    if (!trimmedMessage || !socket || !tripId || !currentUserId) return;

    socket.emit("send_message", {
      tripId,
      userId: currentUserId,
      text: trimmedMessage,
      type: "chat",
    });
    setNewMessage("");
  };

  return (
    <div className="h-[500px] flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activities.map((activity) => {
          const senderId = activity?.userId?._id || activity?.userId;
          const isMine = String(senderId) === String(currentUserId);
          const senderName =
            activity?.userId?.username ||
            activity?.username ||
            (isMine ? "You" : "Member");

          if (activity?.type === "system") {
            return (
              <div key={activity._id || activity.createdAt || activity.text} className="text-center">
                <p className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
                  {activity.text}
                </p>
              </div>
            );
          }

          return (
            <div
              key={activity._id || activity.createdAt || activity.text}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[80%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                <p className="mb-1 px-1 text-[10px] text-gray-500">{senderName}</p>
                <div
                  className={`rounded-2xl px-3 py-2 text-sm ${
                    isMine ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {activity?.text}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-2 py-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
            placeholder="Write a message..."
            className="flex-1 bg-transparent px-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={sendMessage}
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 p-2 text-white transition hover:bg-indigo-700"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

ActivityFeed.propTypes = {
  tripId: PropTypes.string.isRequired,
  socket: PropTypes.shape({
    on: PropTypes.func,
    off: PropTypes.func,
    emit: PropTypes.func,
  }),
  currentUserId: PropTypes.string,
};

ActivityFeed.defaultProps = {
  socket: null,
  currentUserId: "",
};

export default ActivityFeed;

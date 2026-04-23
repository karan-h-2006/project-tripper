require("dotenv").config();
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const tripRoutes = require("./routes/tripRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const userRoutes = require("./routes/userRoutes");
const itineraryRoutes = require("./routes/itineraryRoutes");
const ledgerRoutes = require("./routes/ledgerRoutes");
const { createAndEmitActivity } = require("./services/activityFeedService");

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : []),
];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  },
});

app.set("io", io);
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/users", userRoutes);
app.use("/api/itinerary", itineraryRoutes);
app.use("/api/activities", require("./routes/activityRoutes"));
app.use("/api/ledger", ledgerRoutes);

app.get("/", (req, res) => {
  res.json({ message: "API is running..." });
});

app.use((error, req, res, next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      message: "Image is too large. Please choose a smaller file.",
    });
  }

  return next(error);
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (error) {
    return next(new Error("Authentication error: Invalid token"));
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join_trip_room", (tripId) => {
    try {
      socket.join(String(tripId));
      console.log(`User ${socket.id} joined trip room: ${tripId}`);
    } catch (error) {
      console.error("Error joining trip room:", error.message);
    }
  });

  socket.on("leave_room", (tripId) => {
    try {
      socket.leave(String(tripId));
    } catch (error) {
      console.error("Error leaving trip room:", error.message);
    }
  });

  socket.on("send_message", async (data) => {
    try {
      const { tripId, userId, text, type } = data || {};
      if (!tripId || !text) {
        return;
      }

      await createAndEmitActivity({
        io,
        tripId,
        userId: userId || socket.userId || null,
        text,
        type: type || "chat",
      });
    } catch (error) {
      console.error("send_message error:", error);
    }
  });

  socket.on("error", (err) => {
    console.error("Socket error:", err.message);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const startServer = async () => {
  try {
    await connectDB();
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();

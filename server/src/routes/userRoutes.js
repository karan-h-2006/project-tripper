const express = require("express");
const {
  joinTrip,
  updateProfilePicture,
} = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/join", protect, joinTrip);
router.patch("/profile-picture", protect, updateProfilePicture);

module.exports = router;


const express = require("express");
const { recordUpiPayment } = require("../controllers/paymentController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/record-upi", protect, recordUpiPayment);

module.exports = router;


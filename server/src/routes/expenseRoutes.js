const express = require("express");
const { createExpense } = require("../controllers/expenseController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createExpense);

module.exports = router;


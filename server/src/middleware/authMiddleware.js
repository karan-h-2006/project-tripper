const jwt = require("jsonwebtoken");
const { mapLegacyUser, mapSupabaseError } = require("../lib/legacyCompat");
const { fetchUserById } = require("../services/tripDataService");

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userRow = await fetchUserById(decoded.id);

      if (!userRow) {
        return res
          .status(401)
          .json({ message: "Not authorized, user not found" });
      }

      req.user = mapLegacyUser(userRow, { compact: false });
      req.user.id = req.user._id;
      return next();
    } catch (error) {
      console.error("Auth middleware error:", mapSupabaseError(error).message);
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
};

module.exports = {
  protect,
};

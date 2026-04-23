const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { getSupabase } = require("../lib/supabase");
const {
  USER_SELECT,
  mapLegacyUser,
  mapSupabaseError,
  parseUserMeta,
  serializeUserMeta,
} = require("../lib/legacyCompat");
const { fetchUserByEmail } = require("../services/tripDataService");

const googleClient = new OAuth2Client();

const generateToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });

const formatUserResponse = (userRow) => mapLegacyUser(userRow, { compact: false });

const getUsernameFromGooglePayload = (payload = {}) => {
  const name = payload.name?.trim();
  if (name) {
    return name;
  }

  if (payload.email) {
    return payload.email.split("@")[0];
  }

  return "Tripper User";
};

const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "Please provide all fields" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await fetchUserByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const { data: insertedRows, error } = await getSupabase()
      .from("users")
      .insert({
        id: crypto.randomUUID(),
        email: normalizedEmail,
        display_name: String(username).trim(),
        avatar_url: null,
        password_hash: passwordHash,
        google_id: null,
        timezone: serializeUserMeta({
          timezone: "UTC",
          passwordHash: null,
          googleId: null,
        }),
      })
      .select(USER_SELECT);

    if (error) {
      const mapped = mapSupabaseError(error, "Server error");
      return res.status(mapped.status).json({ message: mapped.message });
    }

    const userRow = insertedRows[0];
    return res.status(201).json({
      user: formatUserResponse(userRow),
      token: generateToken(userRow.id),
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Please provide all fields" });
    }

    const userRow = await fetchUserByEmail(email);
    if (!userRow) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const userMeta = parseUserMeta(userRow.timezone);
    const hashToCompare = userRow.password_hash || userMeta.passwordHash;
    if (!hashToCompare) {
      return res.status(400).json({
        message: "This account uses Google sign-in. Continue with Google.",
      });
    }

    const isMatch = await bcrypt.compare(String(password), hashToCompare);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    return res.status(200).json({
      user: formatUserResponse(userRow),
      token: generateToken(userRow.id),
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "Google token is required" });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        message: "Google authentication is not configured on the server",
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload?.email || !payload.email_verified) {
      return res.status(400).json({
        message: "Google account email could not be verified",
      });
    }

    const normalizedEmail = payload.email.toLowerCase();
    let userRow = await fetchUserByEmail(normalizedEmail);

    if (!userRow) {
      const { data: insertedRows, error } = await getSupabase()
        .from("users")
        .insert({
          id: crypto.randomUUID(),
          email: normalizedEmail,
          display_name: getUsernameFromGooglePayload(payload),
          avatar_url: payload.picture || null,
          password_hash: null,
          google_id: payload.sub,
          timezone: serializeUserMeta({
            timezone: "UTC",
            passwordHash: null,
            googleId: null,
          }),
        })
        .select(USER_SELECT);

      if (error) {
        const mapped = mapSupabaseError(error, "Google authentication failed");
        return res.status(mapped.status).json({ message: mapped.message });
      }

      userRow = insertedRows[0];
    } else {
      const userMeta = parseUserMeta(userRow.timezone);
      
      const updatePayload = {};
      if (!userRow.google_id && !userMeta.googleId) {
        updatePayload.google_id = payload.sub;
      }
      if (!userRow.avatar_url && payload.picture) {
        updatePayload.avatar_url = payload.picture;
      }

      if (Object.keys(updatePayload).length > 0) {
        const { data: updatedRows, error } = await getSupabase()
          .from("users")
          .update(updatePayload)
          .eq("id", userRow.id)
          .select(USER_SELECT);

        if (error) {
          const mapped = mapSupabaseError(error, "Google authentication failed");
          return res.status(mapped.status).json({ message: mapped.message });
        }

        userRow = updatedRows[0];
      }
    }

    return res.status(200).json({
      user: formatUserResponse(userRow),
      token: generateToken(userRow.id),
    });
  } catch (error) {
    console.error("Google login error:", error);
    return res.status(500).json({ message: "Google authentication failed" });
  }
};

module.exports = {
  register,
  login,
  googleLogin,
};

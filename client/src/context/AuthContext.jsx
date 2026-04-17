import { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../api/axios";
import { AuthContext } from "./authContext.js";

const TOKEN_KEY = "tripper_token";
const USER_KEY = "tripper_user";

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    setLoading(false);
  }, []);

  const persistAuth = (nextToken, nextUser) => {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  };

  const clearAuth = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const login = useCallback(async (credentials) => {
    try {
      const res = await api.post("/auth/login", credentials);
      const { token: jwt, user: userData } = res.data || {};

      if (!jwt || !userData) {
        throw new Error("Invalid login response from server");
      }

      persistAuth(jwt, userData);
      toast.success("Welcome back to Tripper!");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const message =
        error.response?.data?.message || "Failed to login. Please try again.";
      toast.error(message);
      throw error;
    }
  }, [navigate]);

  const register = useCallback(async (payload) => {
    try {
      const res = await api.post("/auth/register", payload);
      const { token: jwt, user: userData } = res.data || {};

      if (!jwt || !userData) {
        throw new Error("Invalid register response from server");
      }

      persistAuth(jwt, userData);
      toast.success("Account created. Welcome to Tripper!");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const message =
        error.response?.data?.message ||
        "Failed to register. Please try again.";
      toast.error(message);
      throw error;
    }
  }, [navigate]);

  const updateUser = useCallback((nextUser) => {
    setUser(nextUser);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  }, []);

  const googleLogin = useCallback(async (idToken) => {
    try {
      const res = await api.post("/auth/google", { idToken });
      const { token: jwt, user: userData } = res.data || {};

      if (!jwt || !userData) {
        throw new Error("Invalid Google login response from server");
      }

      persistAuth(jwt, userData);
      toast.success("Signed in with Google");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const message =
        error.response?.data?.message ||
        "Google sign-in failed. Please try again.";
      toast.error(message);
      throw error;
    }
  }, [navigate]);

  const logout = useCallback(() => {
    clearAuth();
    toast.success("Logged out");
    navigate("/login", { replace: true });
  }, [navigate]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      loading,
      login,
      register,
      updateUser,
      googleLogin,
      logout,
    }),
    [user, token, loading, login, register, updateUser, googleLogin, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import toast from "react-hot-toast";
import { useAuth } from "../context/useAuth.js";

const GoogleAuthButton = () => {
  const { googleLogin } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const handleSuccess = async (credentialResponse) => {
    if (!credentialResponse?.credential) {
      return;
    }

    setSubmitting(true);

    try {
      await googleLogin(credentialResponse.credential);
    } finally {
      setSubmitting(false);
    }
  };

  if (!googleClientId) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex w-full items-center justify-center rounded-xl border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-400"
      >
        Google sign-in unavailable until `VITE_GOOGLE_CLIENT_ID` is set
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className={submitting ? "pointer-events-none opacity-70" : ""}>
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={() => {
            toast.error("Google sign-in was cancelled or could not start.");
          }}
          shape="pill"
          size="large"
          text="continue_with"
          width="100%"
        />
      </div>
      {submitting && (
        <p className="text-center text-xs text-gray-500">Signing in...</p>
      )}
    </div>
  );
};

export default GoogleAuthButton;

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiClient } from "../../services/api/apiClient";
import { AlertCircle } from "lucide-react";

/**
 * GoogleSignInButton Component
 *
 * Renders a Google Sign-In button for customer SSO authentication.
 * Uses Google Identity Services (GIS) SDK.
 * Dynamically resolves Google Client ID from environment or backend config.
 */
export default function GoogleSignInButton({ onSuccess, onError, label = "Sign in with Google" }) {
  const { signInWithGoogle } = useAuth();
  const [isSdkLoaded, setIsSdkLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [clientId, setClientId] = useState(import.meta.env.VITE_GOOGLE_CLIENT_ID || "");
  const buttonContainerRef = useRef(null);

  // Fetch Client ID from backend if missing or placeholder in frontend env
  useEffect(() => {
    let cancelled = false;
    if (!clientId || clientId.includes("your-google-client-id")) {
      apiClient.get("/auth/oauth/config", { scope: "none" })
        .then((res) => {
          if (!cancelled && res?.google_client_id && !res.google_client_id.includes("your-google-client-id")) {
            setClientId(res.google_client_id);
          }
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [clientId]);

  // Load Google Identity Services script dynamically
  useEffect(() => {
    if (!clientId || clientId.includes("your-google-client-id")) return;

    if (window.google?.accounts?.id) {
      setIsSdkLoaded(true);
      return;
    }

    const existingScript = document.getElementById("google-gis-script");
    if (existingScript) {
      existingScript.addEventListener("load", () => setIsSdkLoaded(true));
      return;
    }

    const script = document.createElement("script");
    script.id = "google-gis-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setIsSdkLoaded(true);
    script.onerror = () => setErrorMsg("Failed to load Google Sign-In service.");
    document.body.appendChild(script);
  }, [clientId]);

  // Handle credential response from Google SDK
  const handleCredentialResponse = async (response) => {
    if (!response.credential) {
      setErrorMsg("Google Sign-In was cancelled or failed.");
      if (onError) onError("Google Sign-In was cancelled or failed.");
      return;
    }

    setIsLoading(true);
    setErrorMsg("");

    try {
      const result = await signInWithGoogle({ idToken: response.credential });
      if (result.ok) {
        if (onSuccess) onSuccess(result.user);
      } else {
        const msg = result.error || "Google authentication failed on backend.";
        setErrorMsg(msg);
        if (onError) onError(msg);
      }
    } catch (err) {
      const msg = err.message || "An unexpected error occurred during Google sign in.";
      setErrorMsg(msg);
      if (onError) onError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize Google ID client & render button
  useEffect(() => {
    const isConfigured = clientId && !clientId.includes("your-google-client-id");
    if (isSdkLoaded && isConfigured && window.google?.accounts?.id && buttonContainerRef.current) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: false,
        });

        // Clear container before rendering
        buttonContainerRef.current.innerHTML = "";

        window.google.accounts.id.renderButton(buttonContainerRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: buttonContainerRef.current.offsetWidth || 320,
        });
      } catch (err) {
        console.error("Google SSO initialization error:", err);
      }
    }
  }, [isSdkLoaded, clientId]);

  // Fallback trigger if manual button clicked before GIS render
  const handleManualClick = () => {
    const isConfigured = clientId && !clientId.includes("your-google-client-id");
    if (!isConfigured) {
      setErrorMsg("Please set GOOGLE_CLIENT_ID in your backend .env file to enable Google Login.");
      return;
    }
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      setErrorMsg("Google Sign-In script is still loading. Please try again in a moment.");
    }
  };

  const isConfigured = clientId && !clientId.includes("your-google-client-id");

  return (
    <div className="w-full">
      {/* Error alert if any */}
      {errorMsg && (
        <div className="mb-3 flex items-center gap-2 border border-accent/40 bg-accent/5 p-3 text-accent text-xs">
          <AlertCircle size={14} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Container for rendered official Google GIS Button */}
      {isConfigured ? (
        <div className="w-full min-h-[44px] flex justify-center items-center">
          <div ref={buttonContainerRef} className="w-full flex justify-center" />
        </div>
      ) : (
        /* Styled Button when GOOGLE_CLIENT_ID is pending setup */
        <button
          type="button"
          onClick={handleManualClick}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 border border-pearl bg-canvas hover:bg-surface/80 py-3.5 px-4 font-ui text-sm font-medium text-ink transition-colors focus:outline-none focus:ring-1 focus:ring-ink"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{isLoading ? "Signing in..." : label}</span>
        </button>
      )}
    </div>
  );
}

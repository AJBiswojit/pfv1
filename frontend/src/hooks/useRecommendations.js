import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadRecommendationSections } from "../services/api/recommendationsApi";

/** Per-mount request state, not a second catalogue or behavioral repository. */
export function useRecommendations({ placement, productId = null, cartIds = [] }) {
  const { user } = useAuth();
  const customerId = user?.id ?? null;
  const key = JSON.stringify([placement, productId, customerId, cartIds]);
  const [state, setState] = useState({ key: null, sections: {}, status: "loading" });
  useEffect(() => {
    let cancelled = false;
    const [placement, productId, customerId, cartIds] = JSON.parse(key);
    setState({ key, sections: {}, status: "loading" });
    loadRecommendationSections({ placement, productId, customerId, cartIds })
      .then((result) => { if (!cancelled) setState({ key, ...result }); })
      .catch(() => { if (!cancelled) setState({ key, sections: {}, status: "error" }); });
    return () => { cancelled = true; };
  }, [key]);
  // Never flash a previous customer's results (or previous product) while the
  // replacement request's effect is waiting to run.
  return state.key === key ? state : { sections: {}, status: "loading" };
}

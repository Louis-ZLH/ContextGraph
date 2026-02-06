import { useEffect } from "react";
import { Outlet, useNavigation, useLocation } from "react-router";
import nprogress from "nprogress";
import "nprogress/nprogress.css";
import "../../index.css"; // Ensure global styles are loaded if needed, or rely on main entry

// Configure NProgress (no spinner, standard YouTube-like feel)
nprogress.configure({ showSpinner: false, speed: 400, minimum: 0.1 });

export default function GlobalLayout() {
  const navigation = useNavigation();
  const location = useLocation();

  // Handle loading state from data routers (loaders/actions)
  useEffect(() => {
    if (navigation.state === "loading" || navigation.state === "submitting") {
      nprogress.start();
    } else {
      nprogress.done();
    }
  }, [navigation.state]);

  // Handle simple route changes (cleanup in case of quick transitions)
  useEffect(() => {
    // When location changes, we ensure bar completes if it was running
    // This acts as a fallback or for instant transitions
    nprogress.done();
    
    // Optional: Start it briefly on location change to give feedback even for instant renders?
    // YouTube usually only shows it for actual data fetching delays.
    // React Router's `navigation.state` handles the "delay" part perfectly.
    // So we just ensure it cleans up on mount/change.
    return () => {
      nprogress.done();
    };
  }, [location.pathname]);

  return (
    <>
      <Outlet />
    </>
  );
}

// src/App.jsx 1.5

import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import MinCMainDashboard from "./pages/MinCMainDashboard";
import MinCVeguDashboard from "./pages/MinCVeguDashboard";
import MinCLandingPage from "./pages/MinCLandingPage";
import MinCLoginPage from "./pages/MinCLoginPage";
import MinCRegisterPage from "./pages/MinCRegisterPage";
import MinCContactSupportPage from "./pages/MinCContactSupportPage";
import MinCVeguInstitutionsDashboard from "./pages/MinCVEGUInstitutionsDashboard";
import MinCVEGUInstitutionUpdate from "./pages/MinCVEGUInstitutionUpdate";
import MinCVEGURespondersDashboard from "./pages/MinCVEGURespondersDashboard";
import MinCVEGUResponderUpdate from "./pages/MinCVEGUResponderUpdate";
import MinCVEGUUsersDashboard from "./pages/MinCVEGUUsersDashboard";
import MinCVEGUUserUpdate from "./pages/MinCVEGUUserUpdate";

function getSessionUser() {
  try {
    const raw = sessionStorage.getItem("mincUser");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// RequireAuth: protects private routes
function RequireAuth({ children }) {
  const loc = useLocation();
  const user = getSessionUser();
  if (!user) {
    // send to login and replace history so Back won't return here
    return <Navigate to="/login" replace state={{ from: loc }} />;
  }
  return children;
}

// RedirectIfAuthed: keeps logged-in users out of login/register
function RedirectIfAuthed({ children }) {
  const user = getSessionUser();
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MinCLandingPage />} />

        {/* Guest-only routes */}
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <MinCLoginPage />
            </RedirectIfAuthed>
          }
        />
        <Route path="/register" element={<MinCRegisterPage />} />
        <Route path="/contact" element={<MinCContactSupportPage />} />
        
        {/* Protected routes */}
        <Route path="/dashboard" element={<RequireAuth><MinCMainDashboard /></RequireAuth>} />
        <Route path="/minc-vegu-dashboard" element={<RequireAuth><MinCVeguDashboard /></RequireAuth>} />
        <Route path="/vegu/institutions" element={<RequireAuth><MinCVeguInstitutionsDashboard /></RequireAuth>} />
        <Route path="/vegu/institutions/update" element={<RequireAuth><MinCVEGUInstitutionUpdate /></RequireAuth>} />
        <Route path="/vegu/responders" element={<MinCVEGURespondersDashboard />} />
        <Route path="/vegu/responders/update" element={<MinCVEGUResponderUpdate />} />
        <Route path="/vegu/users" element={<MinCVEGUUsersDashboard />} />
        <Route path="/vegu/users/update" element={<MinCVEGUUserUpdate />} />
      </Routes>
    </Router>
  );
}

export default App;
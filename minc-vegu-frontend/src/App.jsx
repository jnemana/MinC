import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import MinCMainDashboard from "./pages/MinCMainDashboard";
import MinCVeguDashboard from "./pages/MinCVeguDashboard";
import MinCLandingPage from "./pages/MinCLandingPage";
import MinCLoginPage from "./pages/MinCLoginPage";
import MinCRegisterPage from "./pages/MinCRegisterPage";
import MinCContactSupportPage from "./pages/MinCContactSupportPage";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MinCLandingPage />} />
        <Route path="/login" element={<MinCLoginPage />} />
        <Route path="/register" element={<MinCRegisterPage />} />
        <Route path="/contact" element={<MinCContactSupportPage />} />
        <Route path="/dashboard" element={<MinCMainDashboard />} />
        <Route path="/vegu" element={<MinCVeguDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
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
      </Routes>
    </Router>
  );
}

export default App;
import { useNavigate } from "react-router-dom";
import UsePageTitle from "../utils/UsePageTitle";

export default function MinCVeguDashboard() {
  UsePageTitle("MinC: VEGU Dashboard");

  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow p-8 w-full max-w-3xl text-center">
        <h1 className="text-3xl md:text-4xl font-extrabold text-emerald-900">
          VEGU Workplace Dashboard
        </h1>
        <p className="mt-3 text-emerald-700">
          Placeholder dashboard. Wire in widgets/tables next.
        </p>

        <div className="mt-8">
          <button
            onClick={() => nav("/dashboard")}
            className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition"
          >
            Back to Main Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import { BASENAME } from "./followupConfig";
import GatePage from "./pages/GatePage";
import SurveyPage from "./pages/SurveyPage";

function App() {
  return (
    <BrowserRouter basename={BASENAME}>
      <Routes>
        <Route path="/" element={<GatePage />} />
        <Route path="/survey" element={<SurveyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

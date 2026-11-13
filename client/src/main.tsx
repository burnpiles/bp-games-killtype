import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initAnalytics } from "./game/analytics";

initAnalytics();

createRoot(document.getElementById("root")!).render(<App />);

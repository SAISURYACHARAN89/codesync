import React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Create a root for rendering the app
const root = createRoot(document.getElementById("root"));

// Render the app inside StrictMode
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

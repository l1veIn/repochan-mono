import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Theme override: ?theme=light|dark (persisted) wins over prefers-color-scheme.
const themeParam = new URLSearchParams(window.location.search).get("theme");
if (themeParam === "light" || themeParam === "dark") {
  window.localStorage.setItem("repochan-browse-theme", themeParam);
}
const theme = themeParam ?? window.localStorage.getItem("repochan-browse-theme");
if (theme === "light" || theme === "dark") {
  document.documentElement.dataset.theme = theme;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

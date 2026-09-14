import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { instalarArmazenamento } from "./armazenamento-local.js";
import App from "./App.jsx";

instalarArmazenamento();
createRoot(document.getElementById("root")).render(<App />);

// Deixa o sistema abrir sem internet depois do primeiro acesso (campo offline)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((erro) => console.warn("Modo offline indisponível", erro));
  });
}

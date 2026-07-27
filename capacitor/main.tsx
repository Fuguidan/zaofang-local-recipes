import React from "react";
import { createRoot } from "react-dom/client";
import RecipeApp from "../app/components/RecipeApp";
import { ErrorBoundary } from "../app/components/ErrorBoundary";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("找不到 Android 应用挂载节点");
}

createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RecipeApp />
    </ErrorBoundary>
  </React.StrictMode>,
);

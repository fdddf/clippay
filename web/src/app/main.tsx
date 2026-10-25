import "@/styles/globals.css";
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const UiPreview = import.meta.env.DEV ? lazy(() => import("./pages/UiPreview.tsx")) : null;

function App() {
  return (
    <Routes>
      {UiPreview && <Route path="/_ui" element={<Suspense><UiPreview /></Suspense>} />}
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider delayDuration={200}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  </StrictMode>,
);

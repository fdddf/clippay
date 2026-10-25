import "@/styles/globals.css";
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Layout } from "./Layout";
import { queryClient } from "./queries";
import { WalletProvider } from "./wallet";
import CampaignPage from "./pages/Campaign";
import Campaigns from "./pages/Campaigns";
import { NotFound } from "./pages/NotFound";

const UiPreview = import.meta.env.DEV ? lazy(() => import("./pages/UiPreview.tsx")) : null;

function App() {
  return (
    <Routes>
      {UiPreview && <Route path="/_ui" element={<Suspense><UiPreview /></Suspense>} />}
      <Route element={<Layout />}>
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/c/:id" element={<CampaignPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <BrowserRouter>
          <WalletProvider>
            <App />
          </WalletProvider>
        </BrowserRouter>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);

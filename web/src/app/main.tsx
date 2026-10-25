import "@/styles/globals.css";
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Layout } from "./Layout";
import { DashboardLayout } from "./dashboard/Layout";
import { queryClient } from "./queries";
import { WalletProvider } from "./wallet";
import BriefPage from "./pages/BriefPage";
import CampaignPage from "./pages/Campaign";
import Campaigns from "./pages/Campaigns";
import { NotFound } from "./pages/NotFound";

const NewCampaign = lazy(() => import("./pages/NewCampaign"));
const Overview = lazy(() => import("./dashboard/Overview"));
const DashboardCampaigns = lazy(() => import("./dashboard/Campaigns"));
const CampaignManage = lazy(() => import("./dashboard/CampaignManage"));
const Submissions = lazy(() => import("./dashboard/Submissions"));
const Earnings = lazy(() => import("./dashboard/Earnings"));
const WalletPage = lazy(() => import("./dashboard/Wallet"));
const Settings = lazy(() => import("./dashboard/Settings"));

/** A lazily loaded page, holding its space while it loads. */
const page = (el: React.ReactNode) => <Suspense fallback={<div className="min-h-96" />}>{el}</Suspense>;

const UiPreview = import.meta.env.DEV ? lazy(() => import("./pages/UiPreview.tsx")) : null;

function App() {
  return (
    <Routes>
      {UiPreview && <Route path="/_ui" element={<Suspense><UiPreview /></Suspense>} />}
      <Route element={<Layout />}>
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/c/:id" element={<CampaignPage />} />
        <Route path="/b/:hash" element={<BriefPage />} />
        <Route
          path="/new"
          element={
            <Suspense fallback={<div className="min-h-[calc(100svh-4rem)]" />}>
              <NewCampaign />
            </Suspense>
          }
        />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={page(<Overview />)} />
          <Route path="campaigns" element={page(<DashboardCampaigns />)} />
          <Route path="campaigns/:id" element={page(<CampaignManage />)} />
          <Route path="submissions" element={page(<Submissions />)} />
          <Route path="earnings" element={page(<Earnings />)} />
          <Route path="wallet" element={page(<WalletPage />)} />
          <Route path="settings" element={page(<Settings />)} />
        </Route>
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

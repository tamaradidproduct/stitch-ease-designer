import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./auth/useSession";
import { supabase } from "./supabase/client";
import { createSupabaseDocStore } from "./storage/supabaseDocStore";
import { localChartStore, setActiveChartStore } from "./storage/store";
import { ChartEditor } from "./ui/ChartEditor";
import { ChartList } from "./ui/ChartList";
import { MigrateLocalCharts } from "./ui/MigrateLocalCharts";
import { SignIn } from "./ui/SignIn";

/**
 * Hash routing, not browser history: GitHub Pages serves static files with no
 * server-side rewrites, so a deep link like /c/abc would 404 on refresh.
 * `#/c/abc` is always served by index.html.
 */
export default function App() {
  const session = useSession();

  if (session.status === "loading") {
    return (
      <div className="app app--message">
        <p>Loading…</p>
      </div>
    );
  }

  if (session.status === "signedOut") {
    return <SignIn />;
  }

  if (session.backend === "devLocal") {
    return <DevLocal />;
  }

  return <SignedIn userId={session.session.user.id} />;
}

function ChartRoutes() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<ChartList />} />
        <Route path="/c/:id" element={<ChartEditor />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

/**
 * Split out so `chartStore` is pointed at Supabase and the local-charts
 * migration offer runs exactly once per sign-in — keyed on `userId`, so
 * switching accounts (sign out, sign in as someone else) redoes both rather
 * than leaving the previous account's store or a stale "already asked" state
 * in place.
 */
function SignedIn({ userId }: { userId: string }) {
  const [migrationDone, setMigrationDone] = useState(false);
  const supabaseStore = useState(() => createSupabaseDocStore(supabase))[0];

  useEffect(() => {
    setActiveChartStore(supabaseStore);
    setMigrationDone(false);
  }, [userId, supabaseStore]);

  if (!migrationDone) {
    return (
      <MigrateLocalCharts targetStore={supabaseStore} onDone={() => setMigrationDone(true)} />
    );
  }

  return <ChartRoutes />;
}

/**
 * DEV_SKIP_AUTH's signed-in state: chartStore stays on browser storage, never
 * Supabase (there's no real account to save to), and there's no migration
 * offer — nothing to migrate *into*.
 *
 * This component's code does still ship in a production bundle — confirmed
 * by grepping dist/: unreachability here crosses a module boundary
 * (`session.backend` is a runtime value from a hook one file away), which is
 * further than Terser's dead-code elimination traces. What's actually
 * verified absent from the bundle, by the same grep, is the DEV_SKIP_AUTH
 * flag and its UI string in src/auth/useSession.ts — which is what matters:
 * `useSession()` can never produce the `backend: "devLocal"` state that
 * would render this component, so it's unreachable dead code there, just not
 * physically stripped.
 */
function DevLocal() {
  useEffect(() => {
    setActiveChartStore(localChartStore);
  }, []);

  return <ChartRoutes />;
}

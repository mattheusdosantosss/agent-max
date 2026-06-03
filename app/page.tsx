import Dashboard from "@/components/Dashboard";
import { getMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await getMetrics();
  return <Dashboard initial={initial} />;
}

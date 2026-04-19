import { connection } from "next/server";
import { AmbientFieldLandingRoute } from "@/features/ambient-field/routes/AmbientFieldLandingRoute";
import { fetchActiveGraphBundle } from "@/features/graph/lib/fetch";

export default async function AmbientFieldLabPage() {
  await connection();
  const bundle = await fetchActiveGraphBundle().catch(() => null);

  return <AmbientFieldLandingRoute bundle={bundle} />;
}

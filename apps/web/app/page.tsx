import { connection } from "next/server";
import { FieldLandingRoute } from "@/features/field/routes/FieldLandingRoute";
import { fetchActiveGraphBundle } from "@/features/graph/lib/fetch";

export default async function HomePage() {
  await connection();
  const bundle = await fetchActiveGraphBundle().catch(() => null);

  return <FieldLandingRoute bundle={bundle} />;
}

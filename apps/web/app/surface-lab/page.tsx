import { getSurfaceLabInventory } from "@/features/graph/components/panels/PanelShell/surface-lab/get-surface-lab-inventory";
import { SurfaceLabPage } from "@/features/graph/components/panels/PanelShell/surface-lab/SurfaceLabPage";

export default async function Page() {
  const inventoryRows = await getSurfaceLabInventory();
  return <SurfaceLabPage inventoryRows={inventoryRows} />;
}

import { getSurfaceLabInventory } from "@/features/graph/components/panels/PanelShell/surface-lab/get-surface-lab-inventory";
import { SurfaceLabPage } from "@/features/graph/components/panels/PanelShell/surface-lab/SurfaceLabPage";
import { ModeColorSync } from "@/features/graph/components/shell/ModeColorSync";

export default async function Page() {
  const inventoryRows = await getSurfaceLabInventory();
  return (
    <>
      {/* Mirrors live dashboard behavior — without this, clicking mode chips
          in the prompt preview updates the store but --mode-accent never
          rewrites, so the submit button can't cross-fade. */}
      <ModeColorSync />
      <SurfaceLabPage inventoryRows={inventoryRows} />
    </>
  );
}

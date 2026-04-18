import { registerModule } from "@/features/wiki/module-runtime/registry";
import { manifest } from "./manifest";

registerModule({
  manifest,
  load: () => import("./page"),
  loadContent: () => import("./content"),
});

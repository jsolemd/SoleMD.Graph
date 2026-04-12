import { registerModule } from "@/features/learn/registry";
import { manifest } from "./manifest";

registerModule({
  manifest,
  load: () => import("./page"),
  loadContent: () => import("./content"),
});

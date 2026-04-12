const MODULE_ASSET_BASE_PATH = "/wiki/modules";

type ModuleAssetKind = "audio" | "lottie" | "manim" | "models";

export function moduleAssetPath(
  kind: ModuleAssetKind,
  src: string,
): string {
  const normalizedSrc = src.replace(/^\/+/, "");
  return `${MODULE_ASSET_BASE_PATH}/${kind}/${normalizedSrc}`;
}

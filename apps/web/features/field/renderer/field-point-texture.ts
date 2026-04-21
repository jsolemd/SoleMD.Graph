"use client";

import {
  LinearFilter,
  RGBAFormat,
  TextureLoader,
} from "three";

let fieldPointTextureCache: ReturnType<TextureLoader["load"]> | null = null;

export function getFieldPointTexture() {
  if (fieldPointTextureCache) {
    return fieldPointTextureCache;
  }

  const texture = new TextureLoader().load("/research/maze-particle.png");
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.format = RGBAFormat;
  texture.needsUpdate = true;

  fieldPointTextureCache = texture;
  return texture;
}

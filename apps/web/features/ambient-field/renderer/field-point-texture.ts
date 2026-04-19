"use client";

import {
  CanvasTexture,
  LinearFilter,
  RGBAFormat,
} from "three";

let fieldPointTextureCache: CanvasTexture | null = null;

function drawPointSprite(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("2D canvas context unavailable");
  }

  const center = size / 2;
  const radius = center - 1.5;
  const coreRadius = radius * 0.6;
  const featherRadius = radius * 0.92;
  const featherGradient = context.createRadialGradient(
    center,
    center,
    coreRadius,
    center,
    center,
    featherRadius,
  );

  featherGradient.addColorStop(0, "rgba(255,255,255,1)");
  featherGradient.addColorStop(0.44, "rgba(255,255,255,0.96)");
  featherGradient.addColorStop(0.72, "rgba(255,255,255,0.42)");
  featherGradient.addColorStop(0.9, "rgba(255,255,255,0.08)");
  featherGradient.addColorStop(1, "rgba(255,255,255,0)");

  context.clearRect(0, 0, size, size);
  context.beginPath();
  context.arc(center, center, coreRadius, 0, Math.PI * 2);
  context.closePath();
  context.fillStyle = "rgba(255,255,255,1)";
  context.fill();

  context.beginPath();
  context.arc(center, center, featherRadius, 0, Math.PI * 2);
  context.closePath();
  context.fillStyle = featherGradient;
  context.fill();

  return canvas;
}

export function getFieldPointTexture() {
  if (fieldPointTextureCache) {
    return fieldPointTextureCache;
  }

  const texture = new CanvasTexture(drawPointSprite(32));
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.format = RGBAFormat;
  texture.needsUpdate = true;

  fieldPointTextureCache = texture;
  return texture;
}

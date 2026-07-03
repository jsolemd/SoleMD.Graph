---
name: WebGPU canonical sources
description: Upstream authorities the references draw from — spec, browser docs, the practitioner sites that lead the field
---

# Canonical sources

## Spec and standards

| Resource | URL |
|---|---|
| W3C WebGPU spec (TR) | https://www.w3.org/TR/webgpu/ |
| WebGPU editor's draft | https://gpuweb.github.io/gpuweb/ |
| WGSL spec (TR) | https://www.w3.org/TR/WGSL/ |
| WGSL editor's draft | https://gpuweb.github.io/gpuweb/wgsl/ |
| GPU for the Web wiki | https://github.com/gpuweb/gpuweb/wiki |
| Implementation Status | https://github.com/gpuweb/gpuweb/wiki/Implementation-Status |

## Practitioner references

| Resource | URL |
|---|---|
| webgpufundamentals.org | https://webgpufundamentals.org/ |
| Toji.dev best practices | https://toji.dev/webgpu-best-practices/ |
| Toji.dev profiling | https://toji.dev/webgpu-profiling/ |
| Surma's WebGPU series | https://surma.dev/things/webgpu/ |
| Tour of WGSL | https://google.github.io/tour-of-wgsl/ |
| WebGPU samples | https://webgpu.github.io/webgpu-samples/ |
| WebGPU Unleashed | https://shi-yan.github.io/webgpuunleashed/ |
| compute.toys | https://compute.toys |
| Élie Michel — Learn WebGPU (C++ but principles apply) | https://eliemichel.github.io/LearnWebGPU/ |
| Don McCurdy — Texture formats for the web | https://www.donmccurdy.com/2024/02/11/web-texture-formats/ |

## Implementations

| Resource | URL |
|---|---|
| Dawn (Chrome's WebGPU) | https://google.github.io/dawn/ |
| wgpu (Firefox's WebGPU) | https://docs.rs/wgpu |
| WebKit WebGPU | https://github.com/WebKit/WebKit/tree/main/Source/WebGPU |
| Chrome WebGPU release notes ("What's new in WebGPU") | https://developer.chrome.com/blog/new-in-webgpu-127 (and successive releases) |
| Chrome WebGPU troubleshooting | https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips |

## MDN

| Topic | URL |
|---|---|
| WebGPU API root | https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API |
| GPU.requestAdapter | https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter |
| GPUDevice.lost | https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost |
| GPUDevice.pushErrorScope | https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/pushErrorScope |
| GPUSupportedLimits | https://developer.mozilla.org/en-US/docs/Web/API/GPUSupportedLimits |
| GPUDevice.createComputePipelineAsync | https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createComputePipelineAsync |
| WGSLLanguageFeatures | https://developer.mozilla.org/en-US/docs/Web/API/WGSLLanguageFeatures |

## Tooling

| Tool | URL |
|---|---|
| WebGPU Inspector (Chrome extension, Brendan Duncan) | https://github.com/brendan-duncan/webgpu_inspector |
| webgpu-devtools (Chrome extension, takahirox) | https://github.com/takahirox/webgpu-devtools |
| WebGPU Report (live device dump) | https://webgpureport.org/ |
| RenderDoc | https://renderdoc.org/ |
| PIX on Windows | https://devblogs.microsoft.com/pix/ |
| Perfetto | https://perfetto.dev/ |
| Spector.js (WebGL only — does NOT work for WebGPU) | https://spector.babylonjs.com/ |

## Reference implementations to read

| Project | Why |
|---|---|
| `kishimisu/WebGPU-Radix-Sort` | Production-quality GPU radix sort |
| `KeKsBoTer/wgpu_sort` | Alternative high-quality sort |
| `harp-lab/GraphWaGu` | WebGPU graph layout (Barnes-Hut LBVH) |
| `pmndrs/postprocessing` | Effect-merging composer (WebGL but principles transfer) |
| three.js `three/webgpu` examples | Real WebGPURenderer + TSL usage |
| `Transformers.js v4` (Hugging Face) | Production WebGPU ML inference |

## Live status references

| What | URL |
|---|---|
| caniuse WebGPU | https://caniuse.com/webgpu |
| WebKit blog (Safari WebGPU updates) | https://webkit.org/blog/ |
| Firefox WebGPU bugs | https://bugzilla.mozilla.org/ (search "WebGPU") |
| Apple Developer — Unlock GPU computing with WebGPU (WWDC25) | https://developer.apple.com/videos/play/wwdc2025/236/ |

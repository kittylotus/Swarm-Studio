import assert from "node:assert/strict";
import { mergeComfyRuntimeFlags, parseLaunchArgs, readCliFlagValue, hasCliFlag } from "../src/runtime/args.ts";

const original = '--preview-method latent2rgb --cuda-device 2 --disable-pinned-memory --custom-extension-mode "very weird"';
const knownGood = mergeComfyRuntimeFlags(original, {
  cudaDevice: "0",
  disableDynamicVram: false,
  disablePinnedMemory: false,
  disableAsyncOffload: false,
});
const knownGoodArgs = parseLaunchArgs(knownGood);
assert.equal(readCliFlagValue(knownGoodArgs, "--cuda-device"), "0", "known-good preset must force CUDA device 0");
assert.equal(hasCliFlag(knownGoodArgs, "--disable-pinned-memory"), false, "known-good preset must remove stale pinned-memory diagnostics");
assert.equal(hasCliFlag(knownGoodArgs, "--disable-dynamic-vram"), false, "known-good preset must not disable dynamic VRAM");
assert.equal(hasCliFlag(knownGoodArgs, "--disable-async-offload"), false, "known-good preset must not disable async offload");
assert.equal(readCliFlagValue(knownGoodArgs, "--preview-method"), "latent2rgb", "unmanaged Comfy flags must survive managed flag edits");
assert.equal(readCliFlagValue(knownGoodArgs, "--custom-extension-mode"), "very weird", "quoted unmanaged values must survive round-trip formatting");

const diagnostics = mergeComfyRuntimeFlags('--cuda-device=3 --listen 0.0.0.0', {
  cudaDevice: "0",
  disableDynamicVram: true,
  disablePinnedMemory: true,
  disableAsyncOffload: true,
});
const diagnosticArgs = parseLaunchArgs(diagnostics);
assert.equal(readCliFlagValue(diagnosticArgs, "--cuda-device"), "0", "managed CUDA flag must replace equals-form values");
assert.equal(hasCliFlag(diagnosticArgs, "--disable-dynamic-vram"), true);
assert.equal(hasCliFlag(diagnosticArgs, "--disable-pinned-memory"), true);
assert.equal(hasCliFlag(diagnosticArgs, "--disable-async-offload"), true);
assert.equal(readCliFlagValue(diagnosticArgs, "--listen"), "0.0.0.0", "unmanaged network flags must not be eaten");

const cleared = parseLaunchArgs(mergeComfyRuntimeFlags(diagnostics, {
  cudaDevice: "",
  disableDynamicVram: false,
  disablePinnedMemory: false,
  disableAsyncOffload: false,
}));
assert.equal(hasCliFlag(cleared, "--cuda-device"), false);
assert.equal(hasCliFlag(cleared, "--disable-dynamic-vram"), false);
assert.equal(hasCliFlag(cleared, "--disable-pinned-memory"), false);
assert.equal(hasCliFlag(cleared, "--disable-async-offload"), false);
assert.equal(readCliFlagValue(cleared, "--listen"), "0.0.0.0", "clear must only remove Studio-managed runtime flags");

console.log("Comfy runtime flag contract OK.");

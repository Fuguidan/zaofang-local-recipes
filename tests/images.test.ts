import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRecipeImageFile } from "../app/lib/images.ts";

test("passes browser-readable images through without conversion", async () => {
  const file = new File(["jpg"], "dish.jpg", { type: "image/jpeg" });
  const result = await normalizeRecipeImageFile(file, {
    nativeConvert: async () => {
      throw new Error("should not convert");
    },
    heic2anyConvert: async () => {
      throw new Error("should not convert");
    },
  });
  assert.equal(result.status, "passthrough");
  assert.equal(result.file, file);
  assert.equal(result.aiReady, true);
});

test("converts HEIC with native browser decoding first", async () => {
  const file = new File(["heic"], "dish.HEIC", { type: "image/heic" });
  const result = await normalizeRecipeImageFile(file, {
    nativeConvert: async () => new Blob(["jpeg"], { type: "image/jpeg" }),
    heic2anyConvert: async () => {
      throw new Error("fallback should not run");
    },
  });
  assert.equal(result.status, "converted");
  assert.equal(result.file.name, "dish.jpg");
  assert.equal(result.file.type, "image/jpeg");
  assert.equal(await result.file.text(), "jpeg");
  assert.equal(result.aiReady, true);
});

test("falls back to heic2any when native HEIC decoding fails", async () => {
  const file = new File(["heic"], "dish.heif", { type: "image/heif" });
  const result = await normalizeRecipeImageFile(file, {
    nativeConvert: async () => {
      throw new Error("native_decode_failed");
    },
    heic2anyConvert: async () => new Blob(["jpeg-fallback"], { type: "image/jpeg" }),
  });
  assert.equal(result.status, "converted");
  assert.equal(result.file.name, "dish.jpg");
  assert.equal(await result.file.text(), "jpeg-fallback");
  assert.match(result.failureSummary || "", /native_decode_failed/);
});

test("keeps original HEIC when all conversion paths fail", async () => {
  const file = new File(["original-heic"], "dish.HEIC", { type: "" });
  const result = await normalizeRecipeImageFile(file, {
    nativeConvert: async () => {
      throw new Error("native_decode_failed");
    },
    heic2anyConvert: async () => {
      throw new Error("ERR_LIBHEIF format not supported");
    },
  });
  assert.equal(result.status, "unsupported");
  assert.equal(result.file.name, "dish.HEIC");
  assert.equal(result.file.type, "image/heic");
  assert.equal(await result.file.text(), "original-heic");
  assert.equal(result.aiReady, false);
  assert.match(result.failureSummary || "", /ERR_LIBHEIF/);
});

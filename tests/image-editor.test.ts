import assert from "node:assert/strict";
import test from "node:test";
import { calculateImageTransform, clampImageOffset, normalizeRotation, rotatedImageSize } from "../app/lib/image-editor.ts";

test("normalizes rotation and swaps dimensions at quarter turns", () => {
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(450), 90);
  assert.deepEqual(rotatedImageSize(1600, 900, 90), { width: 900, height: 1600 });
  assert.deepEqual(rotatedImageSize(1600, 900, 180), { width: 1600, height: 900 });
});

test("calculates cover scale for a four by three crop", () => {
  const transform = calculateImageTransform({
    imageWidth: 1600,
    imageHeight: 900,
    canvasWidth: 1200,
    canvasHeight: 900,
    rotation: 0,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  });
  assert.equal(transform.scale, 1);
  assert.equal(transform.centerX, 600);
  assert.equal(transform.centerY, 450);
});

test("clamps drag offset so the crop never exposes empty space", () => {
  const offset = clampImageOffset({
    imageWidth: 1600,
    imageHeight: 900,
    canvasWidth: 1200,
    canvasHeight: 900,
    rotation: 0,
    zoom: 1,
    offsetX: 999,
    offsetY: 999,
  });
  assert.deepEqual(offset, { x: 200, y: 0 });
});

test("zoom increases the output scale and available pan range", () => {
  const transform = calculateImageTransform({
    imageWidth: 1200,
    imageHeight: 900,
    canvasWidth: 1200,
    canvasHeight: 900,
    rotation: 0,
    zoom: 2,
    offsetX: 300,
    offsetY: -300,
  });
  assert.equal(transform.scale, 2);
  assert.equal(transform.centerX, 900);
  assert.equal(transform.centerY, 150);
});

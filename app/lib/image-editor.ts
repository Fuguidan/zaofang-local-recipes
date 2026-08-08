export interface ImageTransform {
  centerX: number;
  centerY: number;
  scale: number;
  rotationRadians: number;
}

export const MIN_IMAGE_ZOOM = 0.5;
export const MAX_IMAGE_ZOOM = 3;

export function normalizeImageZoom(zoom: number) {
  return Math.max(MIN_IMAGE_ZOOM, Math.min(MAX_IMAGE_ZOOM, zoom));
}

export function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

export function rotatedImageSize(width: number, height: number, rotation: number) {
  const normalized = normalizeRotation(rotation);
  return normalized === 90 || normalized === 270
    ? { width: height, height: width }
    : { width, height };
}

export function clampImageOffset({
  imageWidth,
  imageHeight,
  canvasWidth,
  canvasHeight,
  rotation,
  zoom,
  offsetX,
  offsetY,
}: {
  imageWidth: number;
  imageHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  rotation: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
}) {
  const rotated = rotatedImageSize(imageWidth, imageHeight, rotation);
  const coverScale = Math.max(canvasWidth / rotated.width, canvasHeight / rotated.height);
  const scale = coverScale * normalizeImageZoom(zoom);
  const maxX = Math.max(0, (rotated.width * scale - canvasWidth) / 2);
  const maxY = Math.max(0, (rotated.height * scale - canvasHeight) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, offsetX)),
    y: Math.max(-maxY, Math.min(maxY, offsetY)),
  };
}

export function calculateImageTransform({
  imageWidth,
  imageHeight,
  canvasWidth,
  canvasHeight,
  rotation,
  zoom,
  offsetX,
  offsetY,
}: {
  imageWidth: number;
  imageHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  rotation: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
}): ImageTransform {
  const normalized = normalizeRotation(rotation);
  const rotated = rotatedImageSize(imageWidth, imageHeight, normalized);
  const clamped = clampImageOffset({
    imageWidth,
    imageHeight,
    canvasWidth,
    canvasHeight,
    rotation: normalized,
    zoom,
    offsetX,
    offsetY,
  });
  return {
    centerX: canvasWidth / 2 + clamped.x,
    centerY: canvasHeight / 2 + clamped.y,
    scale: Math.max(canvasWidth / rotated.width, canvasHeight / rotated.height) * normalizeImageZoom(zoom),
    rotationRadians: normalized * Math.PI / 180,
  };
}

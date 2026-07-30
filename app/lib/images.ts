import { AppError } from "./errors.ts";

const HEIC_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_EXTENSIONS = /\.(heic|heif)$/i;

export function isHeicImage(file: File) {
  return HEIC_TYPES.has(file.type.toLowerCase()) || HEIC_EXTENSIONS.test(file.name);
}

function jpegName(name: string) {
  return HEIC_EXTENSIONS.test(name) ? name.replace(HEIC_EXTENSIONS, ".jpg") : `${name}.jpg`;
}

export async function normalizeRecipeImageFile(file: File) {
  if (!isHeicImage(file)) return file;
  try {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    const jpeg = Array.isArray(converted) ? converted[0] : converted;
    return new File([jpeg], jpegName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
  } catch (error) {
    throw new AppError("IMAGE", "无法处理该 HEIC 图片，请换成 JPG/PNG 或重新拍摄。", error);
  }
}

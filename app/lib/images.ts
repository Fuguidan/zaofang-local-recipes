const HEIC_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_EXTENSIONS = /\.(heic|heif)$/i;
const AI_READY_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type NormalizedRecipeImage =
  | { status: "passthrough"; file: File; aiReady: boolean; failureSummary?: undefined }
  | { status: "converted"; file: File; aiReady: true; failureSummary?: string }
  | { status: "unsupported"; file: File; aiReady: false; failureSummary: string };

export interface ImageNormalizeDependencies {
  nativeConvert?: (file: File) => Promise<Blob>;
  heic2anyConvert?: (file: File) => Promise<Blob | Blob[]>;
}

export function isHeicImage(file: File) {
  return HEIC_TYPES.has(file.type.toLowerCase()) || HEIC_EXTENSIONS.test(file.name);
}

export function isAiSupportedImage(image?: Blob) {
  return Boolean(image && AI_READY_IMAGE_TYPES.has(image.type.toLowerCase()));
}

function jpegName(name: string) {
  return HEIC_EXTENSIONS.test(name) ? name.replace(HEIC_EXTENSIONS, ".jpg") : `${name}.jpg`;
}

function heicTypedFile(file: File) {
  if (file.type) return file;
  const type = /\.heif$/i.test(file.name) ? "image/heif" : "image/heic";
  return new File([file], file.name, { type, lastModified: file.lastModified });
}

function errorSummary(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .slice(0, 180);
}

function toJpegFile(blob: Blob, original: File) {
  return new File([blob], jpegName(original.name), { type: "image/jpeg", lastModified: original.lastModified });
}

async function heic2anyConvert(file: File) {
  const { default: heic2any } = await import("heic2any");
  return heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
}

async function nativeConvert(file: File) {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    throw new Error("native_decode_unavailable");
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("native_decode_failed"));
    });
    image.src = url;
    if ("decode" in image) await image.decode().catch(() => loaded);
    else await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) throw new Error("canvas_unavailable");
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas_to_blob_failed"));
      }, "image/jpeg", 0.92);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function normalizeRecipeImageFile(
  file: File,
  dependencies: ImageNormalizeDependencies = {},
): Promise<NormalizedRecipeImage> {
  if (!isHeicImage(file)) {
    return { status: "passthrough", file, aiReady: isAiSupportedImage(file) };
  }
  const source = heicTypedFile(file);
  const failures: string[] = [];
  try {
    const jpeg = await (dependencies.nativeConvert || nativeConvert)(source);
    return { status: "converted", file: toJpegFile(jpeg, source), aiReady: true };
  } catch (error) {
    failures.push(`native:${errorSummary(error)}`);
  }
  try {
    const converted = await (dependencies.heic2anyConvert || heic2anyConvert)(source);
    const jpeg = Array.isArray(converted) ? converted[0] : converted;
    return { status: "converted", file: toJpegFile(jpeg, source), aiReady: true, failureSummary: failures.join(";") };
  } catch (error) {
    failures.push(`heic2any:${errorSummary(error)}`);
  }
  return { status: "unsupported", file: source, aiReady: false, failureSummary: failures.join(";") };
}

import { Capacitor, registerPlugin } from "@capacitor/core";

interface NativeImageConverterPlugin {
  convertHeicToJpeg(options: { data: string; filename: string; mimeType: string }): Promise<{
    data: string;
    filename: string;
    mimeType: string;
  }>;
}

const NativeImageConverter = registerPlugin<NativeImageConverterPlugin>("NativeImageConverter");

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string, mimeType: string) {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",").pop() || "" : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

export async function convertHeicWithAndroid(file: File) {
  if (Capacitor.getPlatform() !== "android") throw new Error("android_native_unavailable");
  const result = await NativeImageConverter.convertHeicToJpeg({
    data: await blobToDataUrl(file),
    filename: file.name,
    mimeType: file.type || "image/heic",
  });
  return new File([dataUrlToBlob(result.data, result.mimeType || "image/jpeg")], result.filename || file.name.replace(/\.(heic|heif)$/i, ".jpg"), {
    type: result.mimeType || "image/jpeg",
    lastModified: file.lastModified,
  });
}

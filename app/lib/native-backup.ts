import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativeBackupSaveResult {
  uri: string;
  filename: string;
  mimeType: string;
  displayPath?: string;
}

interface NativeBackupFilePlugin {
  saveZip(options: { data: string; filename: string; mimeType: string }): Promise<NativeBackupSaveResult>;
  openSavedFile(options: { uri: string; mimeType: string }): Promise<void>;
}

const NativeBackupFile = registerPlugin<NativeBackupFilePlugin>("NativeBackupFile");

export function isAndroidNativeBackupAvailable(platform = Capacitor.getPlatform()) {
  return platform === "android";
}

export async function saveBackupWithAndroid(
  blob: Blob,
  filename: string,
  plugin: Pick<NativeBackupFilePlugin, "saveZip"> = NativeBackupFile,
) {
  return plugin.saveZip({
    data: await blobToBase64(blob),
    filename,
    mimeType: "application/zip",
  });
}

export async function openAndroidSavedBackup(
  uri: string,
  plugin: Pick<NativeBackupFilePlugin, "openSavedFile"> = NativeBackupFile,
) {
  await plugin.openSavedFile({ uri, mimeType: "application/zip" });
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  if (typeof Buffer !== "undefined") return Buffer.from(buffer).toString("base64");
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

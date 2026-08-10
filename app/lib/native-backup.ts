import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativeBackupSaveResult {
  uri: string;
  filename: string;
  mimeType: string;
  displayPath?: string;
}

export interface NativeBackupFilePlugin {
  beginZip(options: { filename: string; mimeType: string }): Promise<{ exportId: string }>;
  appendZipChunk(options: { exportId: string; data: string }): Promise<{ bytesWritten: number }>;
  finishZip(options: { exportId: string; expectedBytes: number }): Promise<NativeBackupSaveResult>;
  abortZip(options: { exportId: string }): Promise<void>;
  openSavedFile(options: { uri: string; mimeType: string }): Promise<void>;
}

const NativeBackupFile = registerPlugin<NativeBackupFilePlugin>("NativeBackupFile");

export const ANDROID_BACKUP_CHUNK_BYTES = 256 * 1024;

export function isAndroidNativeBackupAvailable(platform = Capacitor.getPlatform()) {
  return platform === "android";
}

export async function saveBackupWithAndroid(
  blob: Blob,
  filename: string,
  plugin: Pick<NativeBackupFilePlugin, "beginZip" | "appendZipChunk" | "finishZip" | "abortZip"> = NativeBackupFile,
) {
  const writer = await beginAndroidBackup(filename, plugin);
  try {
    for (let offset = 0; offset < blob.size; offset += ANDROID_BACKUP_CHUNK_BYTES) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + ANDROID_BACKUP_CHUNK_BYTES).arrayBuffer());
      await writer.write(bytes);
    }
    return await writer.finish(blob.size);
  } catch (error) {
    await writer.abort();
    throw error;
  }
}

export async function beginAndroidBackup(
  filename: string,
  plugin: Pick<NativeBackupFilePlugin, "beginZip" | "appendZipChunk" | "finishZip" | "abortZip"> = NativeBackupFile,
) {
  const { exportId } = await plugin.beginZip({ filename, mimeType: "application/zip" });
  let completed = false;
  let bytesWritten = 0;
  return {
    exportId,
    get bytesWritten() { return bytesWritten; },
    async write(chunk: Uint8Array) {
      if (completed) throw new Error("backup_writer_already_closed");
      for (let offset = 0; offset < chunk.byteLength; offset += ANDROID_BACKUP_CHUNK_BYTES) {
        const part = chunk.subarray(offset, Math.min(offset + ANDROID_BACKUP_CHUNK_BYTES, chunk.byteLength));
        const result = await plugin.appendZipChunk({ exportId, data: bytesToBase64(part) });
        bytesWritten = result.bytesWritten;
      }
    },
    async finish(expectedBytes = bytesWritten) {
      if (completed) throw new Error("backup_writer_already_closed");
      const result = await plugin.finishZip({ exportId, expectedBytes });
      completed = true;
      return result;
    },
    async abort() {
      if (completed) return;
      completed = true;
      try {
        await plugin.abortZip({ exportId });
      } catch {
        // Preserve the original export error; native cache cleanup is best effort.
      }
    },
  };
}

export async function openAndroidSavedBackup(
  uri: string,
  plugin: Pick<NativeBackupFilePlugin, "openSavedFile"> = NativeBackupFile,
) {
  await plugin.openSavedFile({ uri, mimeType: "application/zip" });
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

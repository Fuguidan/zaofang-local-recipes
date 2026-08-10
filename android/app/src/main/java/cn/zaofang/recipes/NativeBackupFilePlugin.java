package cn.zaofang.recipes;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.UUID;

@CapacitorPlugin(name = "NativeBackupFile")
public class NativeBackupFilePlugin extends Plugin {
    private static final String MIME_ZIP = "application/zip";
    private static final int COPY_BUFFER_SIZE = 64 * 1024;
    private String pendingTempPath;
    private String pendingFilename;
    private String pendingMimeType;
    private String activeExportId;
    private String activeTempPath;
    private String activeFilename;
    private String activeMimeType;
    private long activeBytesWritten;

    @PluginMethod
    public void beginZip(PluginCall call) {
        String filename = call.getString("filename", "灶房菜谱备份.zip");
        String mimeType = call.getString("mimeType", MIME_ZIP);
        if (pendingTempPath != null) {
            call.reject("backup_picker_in_progress", "CONFLICT");
            return;
        }
        try {
            clearActive();
            activeExportId = UUID.randomUUID().toString();
            activeTempPath = createTempBackupFile().getAbsolutePath();
            activeFilename = sanitizeFilename(filename);
            activeMimeType = mimeType == null || mimeType.length() == 0 ? MIME_ZIP : mimeType;
            activeBytesWritten = 0;
            JSObject result = new JSObject();
            result.put("exportId", activeExportId);
            result.put("filename", activeFilename);
            result.put("mimeType", activeMimeType);
            call.resolve(result);
        } catch (Exception exception) {
            clearActive();
            call.reject(safeMessage(exception), exception.getClass().getSimpleName(), exception);
        }
    }

    @PluginMethod
    public void appendZipChunk(PluginCall call) {
        String exportId = call.getString("exportId");
        String data = call.getString("data");
        if (!isActiveExport(exportId)) {
            call.reject("backup_export_not_active", "VALIDATION");
            return;
        }
        if (data == null || data.length() == 0) {
            call.reject("missing_backup_chunk", "VALIDATION");
            return;
        }
        try {
            byte[] decoded = Base64.decode(stripDataUrlPrefix(data), Base64.DEFAULT);
            try (FileOutputStream output = new FileOutputStream(new File(activeTempPath), true)) {
                output.write(decoded);
                output.flush();
            }
            activeBytesWritten += decoded.length;
            call.getData().remove("data");
            JSObject result = new JSObject();
            result.put("bytesWritten", activeBytesWritten);
            call.resolve(result);
        } catch (Exception exception) {
            clearActive();
            call.reject(safeMessage(exception), exception.getClass().getSimpleName(), exception);
        }
    }

    @PluginMethod
    public void finishZip(PluginCall call) {
        String exportId = call.getString("exportId");
        Long expectedBytes = call.getLong("expectedBytes");
        if (!isActiveExport(exportId)) {
            call.reject("backup_export_not_active", "VALIDATION");
            return;
        }
        File tempFile = new File(activeTempPath);
        if (!tempFile.exists() || tempFile.length() == 0) {
            clearActive();
            call.reject("temp_backup_file_empty", "STORAGE");
            return;
        }
        if (expectedBytes != null && expectedBytes.longValue() != tempFile.length()) {
            clearActive();
            call.reject("backup_size_mismatch", "STORAGE");
            return;
        }

        pendingTempPath = activeTempPath;
        pendingFilename = activeFilename;
        pendingMimeType = activeMimeType;
        activeExportId = null;
        activeTempPath = null;
        activeFilename = null;
        activeMimeType = null;
        activeBytesWritten = 0;
        call.getData().put("tempPath", pendingTempPath);
        call.getData().put("filename", pendingFilename);
        call.getData().put("mimeType", pendingMimeType);

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(pendingMimeType);
        intent.putExtra(Intent.EXTRA_TITLE, pendingFilename);
        startActivityForResult(call, intent, "saveZipResult");
    }

    @PluginMethod
    public void abortZip(PluginCall call) {
        String exportId = call.getString("exportId");
        if (isActiveExport(exportId)) clearActive();
        call.resolve();
    }

    @ActivityCallback
    private void saveZipResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            clearPending();
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            clearPending();
            call.reject("export_cancelled", "CANCELLED");
            return;
        }
        Uri uri = result.getData().getData();
        String tempPath = call.getString("tempPath", pendingTempPath);
        String filename = call.getString("filename", pendingFilename);
        String mimeType = call.getString("mimeType", pendingMimeType == null ? MIME_ZIP : pendingMimeType);
        if (tempPath == null || tempPath.length() == 0) {
            clearPending();
            call.reject("missing_temp_backup_file", "STORAGE");
            return;
        }
        File tempFile = new File(tempPath);
        if (!tempFile.exists() || tempFile.length() == 0) {
            clearPending();
            call.reject("temp_backup_file_empty", "STORAGE");
            return;
        }
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "w")) {
            if (stream == null) throw new IllegalStateException("open_output_stream_failed");
            copyFileToStream(tempFile, stream);
            stream.flush();

            int flags = result.getData().getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (flags != 0) {
                try {
                    getContext().getContentResolver().takePersistableUriPermission(uri, flags);
                } catch (Exception ignored) {
                    // Some document providers do not offer persistable grants. The file is still saved.
                }
            }

            JSObject payload = new JSObject();
            payload.put("uri", uri.toString());
            payload.put("filename", filename);
            payload.put("mimeType", mimeType);
            payload.put("displayPath", uri.toString());
            clearPending();
            deleteQuietly(tempFile);
            call.resolve(payload);
        } catch (Exception exception) {
            clearPending();
            call.reject(safeMessage(exception), exception.getClass().getSimpleName(), exception);
        }
    }

    @PluginMethod
    public void openSavedFile(PluginCall call) {
        String uriValue = call.getString("uri");
        String mimeType = call.getString("mimeType", MIME_ZIP);
        if (uriValue == null || uriValue.length() == 0) {
            call.reject("missing_file_uri", "VALIDATION");
            return;
        }
        try {
            Uri uri = Uri.parse(uriValue);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, mimeType == null || mimeType.length() == 0 ? MIME_ZIP : mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(intent, "打开备份文件");
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception exception) {
            try {
                Intent fallback = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                getActivity().startActivity(fallback);
                call.resolve();
            } catch (Exception fallbackException) {
                call.reject(safeMessage(exception), exception.getClass().getSimpleName(), exception);
            }
        }
    }

    private void clearPending() {
        if (pendingTempPath != null) deleteQuietly(new File(pendingTempPath));
        pendingTempPath = null;
        pendingFilename = null;
        pendingMimeType = null;
    }

    private void clearActive() {
        if (activeTempPath != null) deleteQuietly(new File(activeTempPath));
        activeExportId = null;
        activeTempPath = null;
        activeFilename = null;
        activeMimeType = null;
        activeBytesWritten = 0;
    }

    private boolean isActiveExport(String exportId) {
        return exportId != null && exportId.equals(activeExportId) && activeTempPath != null;
    }

    private File createTempBackupFile() throws Exception {
        File directory = new File(getContext().getCacheDir(), "backup-export");
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("create_temp_dir_failed");
        File[] staleFiles = directory.listFiles((dir, name) -> name.startsWith("zaofang-backup-") && name.endsWith(".zip"));
        if (staleFiles != null) {
            for (File staleFile : staleFiles) deleteQuietly(staleFile);
        }
        return File.createTempFile("zaofang-backup-", ".zip", directory);
    }

    private void copyFileToStream(File file, OutputStream output) throws Exception {
        try (FileInputStream input = new FileInputStream(file)) {
            copyStream(input, output);
        }
    }

    private void copyStream(java.io.InputStream input, OutputStream output) throws Exception {
        byte[] buffer = new byte[COPY_BUFFER_SIZE];
        int read;
        while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
    }

    private String stripDataUrlPrefix(String data) {
        int comma = data.indexOf(',');
        return comma >= 0 ? data.substring(comma + 1) : data;
    }

    private void deleteQuietly(File file) {
        try {
            if (file != null && file.exists()) file.delete();
        } catch (Exception ignored) {
            // Temporary cache cleanup is best-effort.
        }
    }

    private String sanitizeFilename(String filename) {
        String trimmed = filename == null ? "" : filename.trim();
        if (trimmed.length() == 0) return "灶房菜谱备份.zip";
        return trimmed.toLowerCase().endsWith(".zip") ? trimmed : trimmed + ".zip";
    }

    private String safeMessage(Exception exception) {
        String message = exception.getMessage();
        return message == null || message.length() == 0 ? exception.getClass().getSimpleName() : message;
    }
}

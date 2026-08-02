package cn.zaofang.recipes;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;
import android.util.Base64InputStream;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "NativeBackupFile")
public class NativeBackupFilePlugin extends Plugin {
    private static final String MIME_ZIP = "application/zip";
    private static final int COPY_BUFFER_SIZE = 64 * 1024;
    private String pendingTempPath;
    private String pendingFilename;
    private String pendingMimeType;

    @PluginMethod
    public void saveZip(PluginCall call) {
        String data = call.getString("data");
        String filename = call.getString("filename", "灶房菜谱备份.zip");
        String mimeType = call.getString("mimeType", MIME_ZIP);
        if (data == null || data.length() == 0) {
            call.reject("missing_backup_data", "VALIDATION");
            return;
        }
        try {
            pendingFilename = sanitizeFilename(filename);
            pendingMimeType = mimeType == null || mimeType.length() == 0 ? MIME_ZIP : mimeType;
            pendingTempPath = writeBackupToTempFile(data).getAbsolutePath();
            call.getData().remove("data");
            call.getData().put("tempPath", pendingTempPath);
            call.getData().put("filename", pendingFilename);
            call.getData().put("mimeType", pendingMimeType);
        } catch (Exception exception) {
            clearPending();
            call.reject(safeMessage(exception), exception.getClass().getSimpleName(), exception);
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(pendingMimeType);
        intent.putExtra(Intent.EXTRA_TITLE, pendingFilename);
        startActivityForResult(call, intent, "saveZipResult");
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

    private File writeBackupToTempFile(String data) throws Exception {
        File directory = new File(getContext().getCacheDir(), "backup-export");
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("create_temp_dir_failed");
        File file = File.createTempFile("zaofang-backup-", ".zip", directory);
        String base64 = stripDataUrlPrefix(data);
        try (
            ByteArrayInputStream input = new ByteArrayInputStream(base64.getBytes(StandardCharsets.US_ASCII));
            Base64InputStream decoded = new Base64InputStream(input, Base64.DEFAULT);
            FileOutputStream output = new FileOutputStream(file)
        ) {
            copyStream(decoded, output);
        }
        if (file.length() == 0) throw new IllegalStateException("temp_backup_file_empty");
        return file;
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

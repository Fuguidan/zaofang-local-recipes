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
import java.io.OutputStream;

@CapacitorPlugin(name = "NativeBackupFile")
public class NativeBackupFilePlugin extends Plugin {
    private static final String MIME_ZIP = "application/zip";
    private String pendingBase64;
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
        pendingBase64 = data;
        pendingFilename = sanitizeFilename(filename);
        pendingMimeType = mimeType == null || mimeType.length() == 0 ? MIME_ZIP : mimeType;

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
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "w")) {
            if (stream == null) throw new IllegalStateException("open_output_stream_failed");
            byte[] bytes = Base64.decode(pendingBase64, Base64.DEFAULT);
            stream.write(bytes);
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
            payload.put("filename", pendingFilename);
            payload.put("mimeType", pendingMimeType);
            payload.put("displayPath", uri.toString());
            clearPending();
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
        pendingBase64 = null;
        pendingFilename = null;
        pendingMimeType = null;
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

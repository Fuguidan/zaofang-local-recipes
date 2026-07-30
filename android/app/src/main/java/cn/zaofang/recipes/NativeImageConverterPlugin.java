package cn.zaofang.recipes;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageDecoder;
import android.os.Build;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;

@CapacitorPlugin(name = "NativeImageConverter")
public class NativeImageConverterPlugin extends Plugin {
    private static final int JPEG_QUALITY = 88;
    private static final int MAX_DIMENSION = 2200;

    @PluginMethod
    public void convertHeicToJpeg(PluginCall call) {
        String data = call.getString("data");
        String filename = call.getString("filename", "image.heic");
        if (data == null || data.length() == 0) {
            call.reject("missing_image_data", "VALIDATION");
            return;
        }
        try {
            byte[] input = Base64.decode(stripDataUrlPrefix(data), Base64.DEFAULT);
            Bitmap bitmap = decodeBitmap(input);
            if (bitmap == null) {
                call.reject("android_decode_failed", "DECODE");
                return;
            }
            Bitmap output = scaleDown(bitmap);
            ByteArrayOutputStream stream = new ByteArrayOutputStream();
            output.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream);
            if (output != bitmap) output.recycle();
            bitmap.recycle();

            JSObject result = new JSObject();
            result.put("data", "data:image/jpeg;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP));
            result.put("filename", jpegName(filename));
            result.put("mimeType", "image/jpeg");
            call.resolve(result);
        } catch (Exception exception) {
            call.reject(safeMessage(exception), exception.getClass().getSimpleName(), exception);
        }
    }

    private Bitmap decodeBitmap(byte[] input) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ImageDecoder.Source source = ImageDecoder.createSource(input);
            return ImageDecoder.decodeBitmap(source, (decoder, info, src) -> decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE));
        }
        return BitmapFactory.decodeByteArray(input, 0, input.length);
    }

    private Bitmap scaleDown(Bitmap bitmap) {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int largest = Math.max(width, height);
        if (largest <= MAX_DIMENSION) return bitmap;
        float ratio = (float) MAX_DIMENSION / (float) largest;
        return Bitmap.createScaledBitmap(bitmap, Math.round(width * ratio), Math.round(height * ratio), true);
    }

    private String stripDataUrlPrefix(String data) {
        int comma = data.indexOf(',');
        return comma >= 0 ? data.substring(comma + 1) : data;
    }

    private String jpegName(String filename) {
        return filename.replaceAll("(?i)\\.(heic|heif)$", ".jpg");
    }

    private String safeMessage(Exception exception) {
        String message = exception.getMessage();
        return message == null || message.length() == 0 ? exception.getClass().getSimpleName() : message;
    }
}

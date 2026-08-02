package cn.zaofang.recipes;

import android.graphics.Color;
import com.getcapacitor.BridgeActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(NativeImageConverterPlugin.class);
        registerPlugin(NativeBackupFilePlugin.class);
        super.onCreate(savedInstanceState);

        // Keep the WebView content below system bars on Android devices that
        // enforce edge-to-edge, while retaining readable system-bar contrast.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.rgb(36, 41, 35));
        getWindow().setNavigationBarColor(Color.rgb(247, 243, 236));
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(true);
    }
}

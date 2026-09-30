import android.app.UiAutomation;
import android.view.accessibility.AccessibilityNodeInfo;
import java.io.File;
import java.lang.reflect.Method;

/** Read-only, API30 shell capture for the dedicated fictional emulator package.
 * Dynamic OTP countdowns need a snapshot, not a globally idle accessibility tree.
 * The host must still check owned AVD, installed artifact, focus and ANR/crash.
 * Uses Android's shell-only internal wrapper; other Android APIs are unverified.
 * Output can contain private inputs: capture privately and redact before display.
 */
public final class FixtureUiCapture {
    private static final String PACKAGE = "in.gurucold.warehouse.fixture";

    public static void main(String[] args) {
        Object wrapper = null;
        Class<?> shell = null;
        boolean connected = false;
        int result = 1;
        try {
            if (args.length != 0 || android.os.Build.VERSION.SDK_INT != 30
                    || !android.os.Build.FINGERPRINT.contains("generic")) {
                throw new IllegalStateException("Requires the owned API30 emulator");
            }
            shell = Class.forName("com.android.uiautomator.core.UiAutomationShellWrapper");
            wrapper = shell.getConstructor().newInstance();
            shell.getMethod("connect").invoke(wrapper);
            connected = true;
            shell.getMethod("setCompressedLayoutHierarchy", boolean.class).invoke(wrapper, false);
            UiAutomation automation = (UiAutomation) shell.getMethod("getUiAutomation").invoke(wrapper);
            AccessibilityNodeInfo root = null;
            long deadline = android.os.SystemClock.uptimeMillis() + 5000;
            while (root == null && android.os.SystemClock.uptimeMillis() < deadline) {
                root = automation.getRootInActiveWindow();
                if (root == null) android.os.SystemClock.sleep(100);
            }
            if (root == null || !PACKAGE.contentEquals(root.getPackageName())) {
                throw new IllegalStateException("Expected fictional app root unavailable");
            }
            try {
                Class<?> dumper = Class.forName("com.android.uiautomator.core.AccessibilityNodeInfoDumper");
                Method dump = dumper.getMethod("dumpWindowToFile", AccessibilityNodeInfo.class,
                        File.class, int.class, int.class, int.class);
                // Pinned portrait viewport; callers verify wm size/density first.
                dump.invoke(null, root, new File("/proc/self/fd/1"), 0, 720, 1280);
                result = 0;
            } finally {
                root.recycle();
            }
        } catch (Exception error) {
            // Do not include exception messages: node contents may be private.
            System.err.println("Fixture UI snapshot failed; no input values logged");
        } finally {
            if (connected) {
                try { shell.getMethod("disconnect").invoke(wrapper); }
                catch (Exception ignored) { result = 1; }
            }
        }
        System.exit(result);
    }
}

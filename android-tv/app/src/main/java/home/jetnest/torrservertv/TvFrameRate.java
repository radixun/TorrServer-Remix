package home.jetnest.torrservertv;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.MediaFormat;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.WindowManager;

import androidx.annotation.OptIn;
import androidx.media3.common.Format;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.video.VideoFrameMetadataListener;

import java.lang.reflect.Method;

/** X98 firmware exposes only the current HDMI mode to Android, so Surface.setFrameRate cannot switch it. */
@OptIn(markerClass = UnstableApi.class)
final class TvFrameRate implements VideoFrameMetadataListener, Player.Listener {
    private static final String TAG = "TorrServerFrameRate";
    private static final String MODE = "/sys/class/display/mode";
    private static final String FRAC = "/sys/class/amhdmitx/amhdmitx0/frac_rate_policy";
    private static final String ENV = "ubootenv.var.";
    private static final String[] SAVED_KEYS = {"is.bestmode", "frac_rate_policy", "colorattribute"};
    private static final float[] RATES = {24000f / 1001, 24, 25, 30000f / 1001, 30, 50, 60000f / 1001, 60};
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Context context;
    private final ExoPlayer player;
    private final Object manager;
    private final Method read, getEnv, setEnv, setMode;
    private final SharedPreferences recovery;
    private volatile boolean closed, requested;
    private boolean switching, internalPause, resume;
    private long firstTimeUs = -1, lastTimeUs = -1, firstIntervalUs;
    private int intervals;

    static TvFrameRate attach(Context context, ExoPlayer player) {
        if (!"X98_S500".equals(Build.MODEL)) return null;
        try {
            TvFrameRate control = new TvFrameRate(context, player);
            control.restore();
            player.setVideoFrameMetadataListener(control);
            player.addListener(control);
            Log.i(TAG, "X98 frame rate matching active");
            return control;
        } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
            Log.w(TAG, "HDMI matching unavailable; keeping the current mode", error);
            return null;
        }
    }

    static void recover(Context context) {
        if (!"X98_S500".equals(Build.MODEL)
                || !context.getSharedPreferences("hdmi_restore", Context.MODE_PRIVATE).contains("mode")) return;
        try { new TvFrameRate(context, null).restore(); }
        catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
            Log.w(TAG, "Cannot restore the previous HDMI mode yet", error);
        }
    }

    private TvFrameRate(Context context, ExoPlayer player) throws ReflectiveOperationException {
        this.context = context;
        this.player = player;
        recovery = context.getSharedPreferences("hdmi_restore", Context.MODE_PRIVATE);
        Class<?> type = Class.forName("com.droidlogic.app.SystemControlManager");
        manager = type.getMethod("getInstance").invoke(null);
        read = type.getMethod("readSysFs", String.class);
        getEnv = type.getMethod("getBootenv", String.class, String.class);
        setEnv = type.getMethod("setBootenv", String.class, String.class);
        setMode = type.getMethod("setMboxOutputMode", String.class);
    }

    @Override public void onVideoFrameAboutToBeRendered(long timeUs, long releaseNs, Format format,
            MediaFormat mediaFormat) {
        if (closed || requested) return;
        float rate = format.frameRate;
        if (rate <= 0) {
            // Matroska often omits a declared rate. Three seconds of stable timestamps
            // distinguish 23.976 from 24 even when timestamps have millisecond precision.
            long interval = timeUs - lastTimeUs;
            if (lastTimeUs < 0 || interval < 5000 || interval > 100000
                    || (intervals > 0 && Math.abs(interval - firstIntervalUs) > 1100)) {
                firstTimeUs = timeUs;
                intervals = 0;
            } else {
                if (intervals == 0) firstIntervalUs = interval;
                intervals++;
            }
            lastTimeUs = timeUs;
            if (timeUs - firstTimeUs < 3000000) return;
            rate = intervals * 1000000f / (timeUs - firstTimeUs);
        }
        float matched = matchRate(rate);
        if (matched == 0) return;
        requested = true;
        handler.post(() -> switchTo(matched));
    }

    static float matchRate(float measured) {
        float best = 0, error = 0.015f;
        for (float rate : RATES) {
            float distance = Math.abs(rate - measured);
            if (distance < error) { best = rate; error = distance; }
        }
        return best;
    }

    private String read(String path) throws ReflectiveOperationException {
        return ((String) read.invoke(manager, path)).trim();
    }

    private void set(String key, String value) throws ReflectiveOperationException {
        // This firmware appends CR to colorattribute reads; do not accumulate it on every exit.
        setEnv.invoke(manager, ENV + key, value.trim());
    }

    private void switchTo(float rate) {
        if (closed) return;
        try {
            // A prior process may have died during the HDMI transition. Never replace
            // its recovery record until the original mode has actually returned.
            if (recovery.contains("mode") && !restore()) return;
            String original = read(MODE);
            if (!original.matches("(720|1080|2160)p[0-9]+hz")) return;
            String target = original.replaceFirst("[0-9]+hz$", Math.round(rate) + "hz");
            String fractional = Math.abs(rate - Math.round(rate)) > 0.001 ? "1" : "0";
            String capabilities = read("/sys/class/amhdmitx/amhdmitx0/disp_cap").replace("*", "");
            // SystemControlManager removes newlines from the kernel's mode list.
            if (!capabilities.contains(target)) {
                Log.i(TAG, "The connected display does not offer " + target);
                return;
            }
            if (target.equals(original) && fractional.equals(read(FRAC))) return;
            SharedPreferences.Editor saved = recovery.edit().putString("mode", original);
            for (String key : SAVED_KEYS) saved.putString(key,
                    ((String) getEnv.invoke(manager, ENV + key, "")).trim());
            if (!saved.commit()) return;
            resume = player.getPlayWhenReady();
            switching = true;
            internalPause = true;
            player.pause();
            internalPause = false;
            set("is.bestmode", "false");
            set("frac_rate_policy", fractional);
            setMode.invoke(manager, target);
            Log.i(TAG, "Requested " + rate + " fps: " + original + " -> " + target + " fractional=" + fractional);
            awaitMode(target, fractional, rate, 0);
        } catch (ReflectiveOperationException | RuntimeException error) {
            Log.w(TAG, "HDMI switch failed", error);
            restore();
            finishSwitch();
        }
    }

    private void awaitMode(String target, String fractional, float rate, int attempt) {
        if (closed) return;
        try {
            float actual = ((WindowManager) context.getSystemService(Context.WINDOW_SERVICE))
                    .getDefaultDisplay().getRefreshRate();
            if (target.equals(read(MODE)) && fractional.equals(read(FRAC)) && Math.abs(actual - rate) < 0.05f) {
                Log.i(TAG, "HDMI matched: mode=" + target + " refreshHz=" + actual);
                finishSwitch();
                return;
            }
        } catch (ReflectiveOperationException | RuntimeException error) { Log.w(TAG, "Reading HDMI mode", error); }
        if (attempt < 40) handler.postDelayed(() -> awaitMode(target, fractional, rate, attempt + 1), 200);
        else {
            Log.w(TAG, "HDMI did not confirm the requested rate; restoring the previous mode");
            restore();
            finishSwitch();
        }
    }

    @Override public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
        if (switching && !internalPause) resume = playWhenReady;
    }

    private void finishSwitch() {
        boolean restart = switching && resume && !closed;
        switching = false;
        if (restart) player.play();
    }

    void close() {
        closed = true;
        handler.removeCallbacksAndMessages(null);
        player.clearVideoFrameMetadataListener(this);
        player.removeListener(this);
        restore();
    }

    private boolean restore() {
        String original = recovery.getString("mode", "");
        if (original.isEmpty()) return true;
        try {
            if (isRestored(original)) {
                recovery.edit().clear().commit();
                return true;
            }
            // Restore the exact previous selection before restoring automatic mode selection.
            set("is.bestmode", "false");
            for (String key : SAVED_KEYS) if (!key.equals("is.bestmode")) set(key, recovery.getString(key, ""));
            setMode.invoke(manager, original);
            set("is.bestmode", recovery.getString("is.bestmode", "true"));
            if (isRestored(original)) {
                recovery.edit().clear().commit();
                Log.i(TAG, "Restored HDMI mode=" + original);
                return true;
            } else Log.w(TAG, "HDMI restore pending; retained recovery settings for the next launch");
        } catch (ReflectiveOperationException | RuntimeException error) {
            Log.w(TAG, "HDMI restore failed; retained recovery settings for the next launch", error);
        }
        return false;
    }

    private boolean isRestored(String original) throws ReflectiveOperationException {
        return original.equals(read(MODE))
                && recovery.getString("frac_rate_policy", "1").trim().equals(read(FRAC))
                && recovery.getString("colorattribute", "").trim()
                        .equals(read("/sys/class/amhdmitx/amhdmitx0/attr"))
                && recovery.getString("is.bestmode", "true").trim()
                        .equals(((String) getEnv.invoke(manager, ENV + "is.bestmode", "")).trim());
    }
}

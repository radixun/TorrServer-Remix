package home.jetnest.torrservertv;

import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.test.ActivityInstrumentationTestCase2;
import android.test.InstrumentationTestRunner;
import android.util.Log;
import android.view.WindowManager;

import androidx.media3.common.Player;
import androidx.media3.exoplayer.DecoderCounters;
import androidx.media3.exoplayer.ExoPlayer;

import java.lang.reflect.Field;

/** Long playback checks run only on the physical TV box, using explicitly supplied media. */
@SuppressWarnings("deprecation")
public final class PlaybackCadenceDeviceTest extends ActivityInstrumentationTestCase2<PlayerActivity> {
    public PlaybackCadenceDeviceTest() { super(PlayerActivity.class); }

    public void testSustainedPlayback() throws Exception {
        Bundle args = ((InstrumentationTestRunner) getInstrumentation()).getArguments();
        String url = args.getString("stream_url");
        assertNotNull("Supply an authorized test stream URL", url);
        long duration = Long.parseLong(args.getString("duration_ms", "90000"));
        assertTrue(duration >= 30000 && duration <= 300000);
        setActivityIntent(new Intent().putExtra(PlayerActivity.EXTRA_URL, url)
                .putExtra(PlayerActivity.EXTRA_DIAGNOSTIC, true)
                .putExtra("diagnostic_position_ms", Long.parseLong(args.getString("position_ms", "600000"))));
        PlayerActivity activity = getActivity();
        Field field = PlayerActivity.class.getDeclaredField("player");
        field.setAccessible(true);
        ExoPlayer player = (ExoPlayer) field.get(activity);
        try {
            boolean[] ready = {false};
            long deadline = SystemClock.elapsedRealtime() + 30000;
            do {
                getInstrumentation().runOnMainSync(() -> {
                    assertEquals(0f, player.getVolume());
                    ready[0] = player.isPlaying() && player.getVideoDecoderCounters() != null
                            && player.getVideoDecoderCounters().renderedOutputBufferCount >= 120;
                });
                if (!ready[0]) SystemClock.sleep(200);
            } while (!ready[0] && SystemClock.elapsedRealtime() < deadline);
            assertTrue("Video must render before the measurement", ready[0]);
            float[] refresh = new float[1];
            getInstrumentation().runOnMainSync(() -> {
                refresh[0] = activity.getWindowManager().getDefaultDisplay().getRefreshRate();
                Log.i("TorrServerCadenceTest", "sourceFps=" + player.getVideoFormat().frameRate + " refreshHz=" + refresh[0]);
            });
            if (!"true".equals(args.getString("baseline")))
                assertEquals("HDMI must match the movie's cadence", 24000f / 1001, refresh[0], 0.02f);
            int[] buffering = {0};
            long[] before = new long[3], after = new long[3];
            getInstrumentation().runOnMainSync(() -> {
                player.addListener(new Player.Listener() {
                    @Override public void onPlaybackStateChanged(int state) {
                        if (state == Player.STATE_BUFFERING) buffering[0]++;
                    }
                });
                sample(player, before);
            });
            SystemClock.sleep(duration);
            getInstrumentation().runOnMainSync(() -> sample(player, after));
            long rendered = after[1] - before[1], dropped = after[2] - before[2];
            Log.i("TorrServerCadenceTest", "durationMs=" + duration + " advancedMs=" + (after[0] - before[0])
                    + " rendered=" + rendered + " dropped=" + dropped + " rebuffer=" + buffering[0]);
            assertTrue("Playback must advance throughout the sample", after[0] - before[0] > duration * 0.95);
            assertEquals("No network rebuffering during the sample", 0, buffering[0]);
            if (!"true".equals(args.getString("baseline"))) assertEquals("No steady-state frame drops", 0L, dropped);
        } finally {
            getInstrumentation().runOnMainSync(activity::finish);
            boolean[] destroyed = {false};
            long deadline = SystemClock.elapsedRealtime() + 15000;
            do {
                getInstrumentation().runOnMainSync(() -> destroyed[0] = activity.isDestroyed());
                if (!destroyed[0]) SystemClock.sleep(100);
            } while (!destroyed[0] && SystemClock.elapsedRealtime() < deadline);
            assertTrue("The activity must release playback before instrumentation exits", destroyed[0]);
            awaitRefresh(60000f / 1001);
        }
    }

    public void testHdmiRatesMatchOrRestore() throws Exception {
        android.content.Context context = getInstrumentation().getTargetContext();
        getInstrumentation().runOnMainSync(() -> TvFrameRate.recover(context));
        awaitRefresh(60000f / 1001);
        float original = refreshRate();
        String url = ((InstrumentationTestRunner) getInstrumentation()).getArguments().getString("stream_url");
        assertNotNull(url);
        setActivityIntent(new Intent().putExtra(PlayerActivity.EXTRA_URL, url)
                .putExtra(PlayerActivity.EXTRA_DIAGNOSTIC, true));
        PlayerActivity activity = getActivity();
        Field playerField = PlayerActivity.class.getDeclaredField("player");
        playerField.setAccessible(true);
        ExoPlayer player = (ExoPlayer) playerField.get(activity);
        Field controlField = PlayerActivity.class.getDeclaredField("frameRate");
        controlField.setAccessible(true);
        TvFrameRate initial = (TvFrameRate) controlField.get(activity);
        boolean[] videoReady = {false};
        long deadline = SystemClock.elapsedRealtime() + 30000;
        do {
            getInstrumentation().runOnMainSync(() -> videoReady[0] = player.isPlaying()
                    && player.getVideoDecoderCounters() != null
                    && player.getVideoDecoderCounters().renderedOutputBufferCount >= 12);
            if (!videoReady[0]) SystemClock.sleep(100);
        } while (!videoReady[0] && SystemClock.elapsedRealtime() < deadline);
        assertTrue("The hardware output surface must be active before mode checks", videoReady[0]);
        getInstrumentation().runOnMainSync(() -> {
            if (initial != null) initial.close();
        });
        controlField.set(activity, null);
        try {
            for (float rate : new float[]{24, 25, 30000f / 1001}) {
                TvFrameRate[] control = new TvFrameRate[1];
                try {
                    getInstrumentation().runOnMainSync(() -> control[0] = TvFrameRate.attach(activity, player));
                    assertNotNull("X98 firmware integration must be available", control[0]);
                    control[0].onVideoFrameAboutToBeRendered(0, 0,
                            new androidx.media3.common.Format.Builder().setFrameRate(rate).build(), null);
                    Field switching = TvFrameRate.class.getDeclaredField("switching");
                    switching.setAccessible(true);
                    boolean[] pending = {true};
                    long switchDeadline = SystemClock.elapsedRealtime() + 15000;
                    do {
                        getInstrumentation().runOnMainSync(() -> {
                            try { pending[0] = switching.getBoolean(control[0]); }
                            catch (IllegalAccessException error) { throw new AssertionError(error); }
                        });
                        if (pending[0]) SystemClock.sleep(200);
                    } while (pending[0] && SystemClock.elapsedRealtime() < switchDeadline);
                    assertFalse("The HDMI transition must finish or roll back", pending[0]);
                    if (Math.abs(refreshRate() - rate) < 0.02f) {
                        Log.i("TorrServerCadenceTest", "Verified hardware refreshHz=" + refreshRate());
                    } else {
                        // The X98 firmware can reject a mode even when EDID lists it.
                        // An unconfirmed request must restore all settings and resume video.
                        awaitRefresh(original);
                        assertFalse("Rejected mode must restore the saved HDMI settings",
                                context.getSharedPreferences("hdmi_restore", android.content.Context.MODE_PRIVATE)
                                        .contains("mode"));
                        Log.i("TorrServerCadenceTest", "Firmware rejected " + rate + "; verified fallback=" + refreshRate());
                    }
                    boolean[] playing = {false};
                    getInstrumentation().runOnMainSync(() -> playing[0] = player.isPlaying());
                    assertTrue("Playback must resume after the transition", playing[0]);
                } finally {
                    getInstrumentation().runOnMainSync(() -> { if (control[0] != null) control[0].close(); });
                    awaitRefresh(original);
                    getInstrumentation().runOnMainSync(() -> TvFrameRate.recover(context));
                }
            }
            assertFalse("Successful restoration must clear the recovery record",
                    context.getSharedPreferences("hdmi_restore", android.content.Context.MODE_PRIVATE).contains("mode"));
        } finally {
            getInstrumentation().runOnMainSync(activity::finish);
            SystemClock.sleep(1000);
        }
    }

    public void testUnknownFrameRatesKeepTheCurrentMode() {
        assertEquals(0f, TvFrameRate.matchRate(Float.NaN));
        assertEquals(0f, TvFrameRate.matchRate(0));
        assertEquals(0f, TvFrameRate.matchRate(26));
        assertEquals(24000f / 1001, TvFrameRate.matchRate(23.975f));
        assertEquals(24f, TvFrameRate.matchRate(24));
    }

    private float refreshRate() {
        float[] rate = new float[1];
        getInstrumentation().runOnMainSync(() -> rate[0] = ((WindowManager)
                getInstrumentation().getTargetContext().getSystemService(android.content.Context.WINDOW_SERVICE))
                .getDefaultDisplay().getRefreshRate());
        return rate[0];
    }

    private void awaitRefresh(float expected) {
        long deadline = SystemClock.elapsedRealtime() + 12000;
        while (Math.abs(refreshRate() - expected) > 0.02f && SystemClock.elapsedRealtime() < deadline)
            SystemClock.sleep(200);
        assertEquals("Physical display refresh rate", expected, refreshRate(), 0.02f);
    }

    private static void sample(ExoPlayer player, long[] values) {
        DecoderCounters counters = player.getVideoDecoderCounters();
        assertNotNull(counters);
        counters.ensureUpdated();
        values[0] = player.getCurrentPosition();
        values[1] = counters.renderedOutputBufferCount;
        values[2] = counters.droppedBufferCount;
    }
}

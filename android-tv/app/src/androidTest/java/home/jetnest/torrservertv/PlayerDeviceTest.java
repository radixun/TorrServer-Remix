package home.jetnest.torrservertv;

import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.test.ActivityInstrumentationTestCase2;
import android.test.InstrumentationTestRunner;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;

import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.Tracks;
import androidx.media3.decoder.ffmpeg.FfmpegLibrary;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.analytics.AnalyticsListener;
import androidx.media3.ui.DefaultTimeBar;
import androidx.media3.ui.PlayerView;

import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Field;

/** Runs on the real Android box. Pass an authorized media URL with -e stream_url. */
@SuppressWarnings("deprecation")
public final class PlayerDeviceTest extends ActivityInstrumentationTestCase2<PlayerActivity> {
    public PlayerDeviceTest() { super(PlayerActivity.class); }

    public void testEveryAudioTrackDecodesAndSeeks() throws Exception {
        android.os.Bundle args = ((InstrumentationTestRunner) getInstrumentation()).getArguments();
        String url = args.getString("stream_url");
        assertNotNull("Supply the affected film URL", url);
        int expected = Integer.parseInt(args.getString("audio_track_count", "6"));
        assertTrue("Software decoder must load on this ABI", FfmpegLibrary.isAvailable());
        for (String mime : new String[]{"audio/vnd.dts", "audio/vnd.dts.hd", "audio/true-hd"})
            assertTrue(mime, FfmpegLibrary.supportsFormat(mime));
        setActivityIntent(new Intent().putExtra(PlayerActivity.EXTRA_URL, url)
                .putExtra(PlayerActivity.EXTRA_DIAGNOSTIC, true).putExtra("diagnostic_position_ms", 180_000L));
        PlayerActivity activity = getActivity();
        ExoPlayer player = (ExoPlayer) findPlayer(activity.findViewById(android.R.id.content)).getPlayer();
        String[] decoder = {""};
        getInstrumentation().runOnMainSync(() -> player.addAnalyticsListener(new AnalyticsListener() {
            @Override public void onAudioDecoderInitialized(EventTime time, String name, long timestamp, long duration) {
                decoder[0] = name;
            }
        }));
        awaitPlayer(() -> player.getPlaybackState() == androidx.media3.common.Player.STATE_READY, 60_000);
        java.util.List<Format> formats = new java.util.ArrayList<>();
        getInstrumentation().runOnMainSync(() -> {
            assertEquals(0f, player.getVolume());
            for (Tracks.Group group : player.getCurrentTracks().getGroups()) {
                if (group.getType() != C.TRACK_TYPE_AUDIO) continue;
                for (int i = 0; i < group.length; i++) {
                    assertTrue("Track must be playable: " + group.getTrackFormat(i), group.isTrackSupported(i));
                    formats.add(group.getTrackFormat(i));
                }
            }
        });
        assertEquals("All container audio tracks must reach the player", expected, formats.size());
        PlaybackOptions options = (PlaybackOptions) field(activity, "playbackOptions");
        android.content.SharedPreferences prefs = AppPreferences.playback(activity);
        String originalLanguage = prefs.getString("audio_language", null);
        try {
            for (int i = 0; i < formats.size(); i++) {
                final int index = i;
                Format wanted = formats.get(i);
                getInstrumentation().runOnMainSync(options::showAudio);
                AlertDialog dialog = (AlertDialog) field(options, "dialog");
                getInstrumentation().runOnMainSync(() -> {
                    assertEquals(expected, dialog.getListView().getCount());
                    assertTrue(dialog.getListView().getAdapter().isEnabled(index));
                    dialog.getListView().performItemClick(null, index, index);
                });
                awaitPlayer(() -> wanted.equals(player.getAudioFormat())
                        && player.getPlaybackState() == androidx.media3.common.Player.STATE_READY, 40_000);
                long[] before = new long[2];
                getInstrumentation().runOnMainSync(() -> {
                    before[0] = player.getAudioDecoderCounters().renderedOutputBufferCount;
                    before[1] = player.getCurrentPosition();
                });
                awaitPlayer(() -> player.getPlayerError() == null
                        && player.getAudioDecoderCounters().renderedOutputBufferCount > before[0] + 12
                        && player.getCurrentPosition() > before[1] + 250, 30_000);
                if (wanted.sampleMimeType.contains("dts")) assertTrue(decoder[0], decoder[0].startsWith("ffmpeg"));
                getInstrumentation().runOnMainSync(() -> player.seekTo(185_000L + index * 2_000L));
                awaitPlayer(() -> wanted.equals(player.getAudioFormat()) && player.isPlaying()
                        && player.getCurrentPosition() >= 185_250L + index * 2_000L, 40_000);
                android.util.Log.i("AudioTrackTest", "PASS track=" + index + " mime=" + wanted.sampleMimeType
                        + " label=" + wanted.label + " decoder=" + decoder[0]);
            }
            getInstrumentation().runOnMainSync(options::showAudio);
            capture(((AlertDialog) field(options, "dialog")).getWindow().getDecorView(), "all-audio-tracks.png");
        } finally {
            prefs.edit().putString("audio_language", originalLanguage).commit();
            getInstrumentation().runOnMainSync(() -> { options.close(); player.pause(); });
        }
    }

    private void awaitPlayer(java.util.concurrent.Callable<Boolean> condition, long timeout) throws Exception {
        boolean[] ready = {false};
        long deadline = android.os.SystemClock.elapsedRealtime() + timeout;
        do {
            getInstrumentation().runOnMainSync(() -> {
                try { ready[0] = condition.call(); }
                catch (Exception error) { throw new AssertionError(error); }
            });
            if (!ready[0]) android.os.SystemClock.sleep(100);
        } while (!ready[0] && android.os.SystemClock.elapsedRealtime() < deadline);
        assertTrue("Player condition timed out", ready[0]);
    }

    public void testHdr10FallbackIsLimitedToCompatibleProfile7() {
        assertTrue(TvPlayback.hasHdr10BaseLayer(new byte[]{1, 0, 14, 55, 96}));
        assertFalse(TvPlayback.hasHdr10BaseLayer(new byte[]{1, 0, 10, 55, 96})); // Profile 5
        assertFalse(TvPlayback.hasHdr10BaseLayer(new byte[]{1, 0, 16, 55, 96})); // Profile 8
        assertFalse(TvPlayback.hasHdr10BaseLayer(new byte[]{1, 0, 14, 54, 96})); // No base layer
        assertFalse(TvPlayback.hasHdr10BaseLayer(new byte[]{1, 0, 14, 55, 0}));  // No HDR10 compatibility
        for (int size = 0; size < 5; size++) assertFalse(TvPlayback.hasHdr10BaseLayer(new byte[size]));
        assertFalse(TvPlayback.hasHdr10BaseLayer(null));
    }

    public void testDecodedOutputAndRemoteFocus() throws Exception {
        String url = ((InstrumentationTestRunner) getInstrumentation()).getArguments().getString("stream_url");
        assertNotNull("Supply an authorized test stream URL", url);
        setActivityIntent(new Intent().putExtra(PlayerActivity.EXTRA_URL, url)
                .putExtra(PlayerActivity.EXTRA_DIAGNOSTIC, true));
        PlayerActivity activity = getActivity();
        PlayerView view = findPlayer(activity.findViewById(android.R.id.content));
        assertNotNull(view);
        assertNull("The full-screen video container must never get a focus frame", view.getForeground());
        ExoPlayer player = (ExoPlayer) view.getPlayer();
        getInstrumentation().runOnMainSync(() -> player.setVolume(0));

        boolean[] decoded = {false};
        long deadline = android.os.SystemClock.elapsedRealtime() + 30_000;
        while (!decoded[0] && android.os.SystemClock.elapsedRealtime() < deadline) {
            getInstrumentation().runOnMainSync(() -> decoded[0] = player.getVideoDecoderCounters() != null
                    && player.getVideoDecoderCounters().renderedOutputBufferCount > 12
                    && player.getAudioDecoderCounters() != null
                    && player.getAudioDecoderCounters().renderedOutputBufferCount > 12);
            if (!decoded[0]) android.os.SystemClock.sleep(200);
        }
        assertTrue("Must produce decoded video AND audio, not only a moving clock", decoded[0]);
        getInstrumentation().runOnMainSync(() -> {
            assertTrue(player.getCurrentTracks().isTypeSelected(C.TRACK_TYPE_VIDEO));
            assertTrue(player.getCurrentTracks().isTypeSelected(C.TRACK_TYPE_AUDIO));
            player.pause();
            view.showController();
            view.findViewById(androidx.media3.ui.R.id.exo_play_pause).requestFocus();
        });
        key(KeyEvent.KEYCODE_DPAD_LEFT);
        assertFocus(activity, androidx.media3.ui.R.id.exo_rew_with_amount);
        capture(activity.getWindow().getDecorView(), "focus-rewind.png");
        key(KeyEvent.KEYCODE_DPAD_RIGHT);
        assertFocus(activity, androidx.media3.ui.R.id.exo_play_pause);
        capture(activity.getWindow().getDecorView(), "focus-play.png");
        key(KeyEvent.KEYCODE_DPAD_RIGHT);
        assertFocus(activity, androidx.media3.ui.R.id.exo_ffwd_with_amount);
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        assertFocus(activity, androidx.media3.ui.R.id.exo_progress);
        capture(activity.getWindow().getDecorView(), "focus-timebar.png");

        key(KeyEvent.KEYCODE_MEDIA_AUDIO_TRACK);
        PlaybackOptions options = (PlaybackOptions) field(activity, "playbackOptions");
        AlertDialog audio = (AlertDialog) field(options, "dialog");
        assertTrue(audio.isShowing());
        assertTrue(audio.getListView().hasFocus());
        int selected = audio.getListView().getSelectedItemPosition();
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        assertEquals(selected + 1, audio.getListView().getSelectedItemPosition());
        capture(audio.getWindow().getDecorView(), "focus-audio-menu.png");
        key(KeyEvent.KEYCODE_BACK);
        waitForPlayerWindow(activity);

        key(KeyEvent.KEYCODE_CAPTIONS);
        AlertDialog captions = (AlertDialog) field(options, "dialog");
        assertTrue(captions.isShowing());
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        assertEquals(1, captions.getListView().getSelectedItemPosition());
        capture(captions.getWindow().getDecorView(), "focus-subtitle-menu.png");
        key(KeyEvent.KEYCODE_BACK);
        waitForPlayerWindow(activity);
        getInstrumentation().runOnMainSync(() -> {
            view.hideController();
            view.requestFocus();
        });
        capture(activity.getWindow().getDecorView(), "focus-video-hidden.png");
    }

    private void key(int code) { sendKeys(code); getInstrumentation().waitForIdleSync(); }

    private void waitForPlayerWindow(PlayerActivity activity) {
        // An idle main looper does not mean the closing dialog has released input focus.
        boolean[] focused = {false};
        long deadline = android.os.SystemClock.elapsedRealtime() + 3_000;
        do {
            getInstrumentation().runOnMainSync(() -> focused[0] = activity.hasWindowFocus());
            if (!focused[0]) android.os.SystemClock.sleep(50);
        } while (!focused[0] && android.os.SystemClock.elapsedRealtime() < deadline);
        assertTrue("Dialog must return input focus to the player", focused[0]);
    }

    private void assertFocus(PlayerActivity activity, int id) {
        View[] focused = new View[1];
        getInstrumentation().runOnMainSync(() -> {
            focused[0] = activity.getCurrentFocus();
        });
        assertNotNull(focused[0]);
        assertEquals(id, focused[0].getId());
        if (focused[0] instanceof DefaultTimeBar) {
            assertNull("The time bar highlights its scrubber, without a rectangular frame", focused[0].getForeground());
        } else {
            assertNotNull("Focus must have a visible foreground", focused[0].getForeground());
            assertTrue(focused[0].getForeground().isStateful());
        }
    }

    private void capture(View view, String name) {
        getInstrumentation().runOnMainSync(() -> {
            // Amlogic HDMI surfaces return black to screencap; draw the actual native UI without video.
            Bitmap bitmap = Bitmap.createBitmap(view.getWidth(), view.getHeight(), Bitmap.Config.ARGB_8888);
            view.draw(new Canvas(bitmap));
            File directory = new File(getInstrumentation().getTargetContext().getExternalFilesDir(null), "player-test");
            directory.mkdirs();
            try (FileOutputStream out = new FileOutputStream(new File(directory, name))) {
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
            } catch (Exception error) { throw new AssertionError(error); }
            finally { bitmap.recycle(); }
        });
    }

    private static Object field(Object object, String name) throws Exception {
        Field field = object.getClass().getDeclaredField(name);
        field.setAccessible(true);
        return field.get(object);
    }

    private static PlayerView findPlayer(View view) {
        if (view instanceof PlayerView) return (PlayerView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                PlayerView found = findPlayer(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }
}

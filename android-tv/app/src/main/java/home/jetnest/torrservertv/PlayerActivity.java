package home.jetnest.torrservertv;

import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.Context;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.KeyEvent;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

@OptIn(markerClass = UnstableApi.class)
public final class PlayerActivity extends AppCompatActivity {
    private static final String TAG = "TorrServerTV";
    public static final String EXTRA_URL = "stream_url";
    public static final String EXTRA_TITLE = "stream_title";
    static final String EXTRA_DIAGNOSTIC = "diagnostic_playback";
    private ExoPlayer player;
    private PlayerView playerView;
    private String url;
    private PlaybackOptions playbackOptions;
    private LinearLayout quickControls;
    private boolean renderedVideo;
    private boolean showingPlaybackError;
    private boolean diagnosticPlayback;
    private TvFrameRate frameRate;

    @Override protected void attachBaseContext(Context base) {
        String language = AppPreferences.playback(base).getString("ui_language", "");
        if (!language.isEmpty()) {
            Configuration config = new Configuration(base.getResources().getConfiguration());
            config.setLocale(java.util.Locale.forLanguageTag(language));
            base = base.createConfigurationContext(config);
        }
        super.attachBaseContext(base);
    }
    private final Handler progressHandler = new Handler(Looper.getMainLooper());
    private final Runnable progressTick = new Runnable() {
        @Override public void run() {
            if (player == null) return;
            savePosition();
            logPlaybackHealth();
            progressHandler.postDelayed(this, 10000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Letterboxing must stay black even when HDR makes the library theme brighter.
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(android.graphics.Color.BLACK));
        getWindow().setNavigationBarColor(android.graphics.Color.BLACK);
        getWindow().setStatusBarColor(android.graphics.Color.BLACK);
        hideSystemUi();
        url = getIntent().getStringExtra(EXTRA_URL);
        if (url == null || url.isEmpty()) {
            finish();
            return;
        }
        playerView = new PlayerView(this);
        playerView.setBackgroundColor(android.graphics.Color.BLACK);
        playerView.setShutterBackgroundColor(android.graphics.Color.BLACK);
        playerView.setUseController(true);
        playerView.setControllerShowTimeoutMs(5000);
        playerView.setControllerAutoShow(true);
        playerView.setControllerAnimationEnabled(false);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);
        playerView.setShowSubtitleButton(false);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(android.graphics.Color.BLACK);
        root.addView(playerView, new FrameLayout.LayoutParams(-1, -1));
        quickControls = new LinearLayout(this);
        quickControls.setGravity(Gravity.END);
        Button audio = new Button(this);
        audio.setText(R.string.audio_language);
        audio.setOnClickListener(v -> { if (playbackOptions != null) playbackOptions.showAudio(); });
        Button captions = new Button(this);
        captions.setText(R.string.subtitles);
        captions.setOnClickListener(v -> { if (playbackOptions != null) playbackOptions.showSubtitles(); });
        quickControls.addView(audio);
        quickControls.addView(captions);
        for (Button button : new Button[]{audio, captions}) {
            button.setTextColor(android.graphics.Color.WHITE);
            button.setAllCaps(false);
            android.graphics.drawable.GradientDrawable surface = new android.graphics.drawable.GradientDrawable();
            surface.setColor(0xee24272d);
            surface.setCornerRadius(12 * getResources().getDisplayMetrics().density);
            button.setBackground(surface);
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, -2);
            layout.leftMargin = Math.round(8 * getResources().getDisplayMetrics().density);
            button.setLayoutParams(layout);
        }
        FrameLayout.LayoutParams controls = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
        controls.setMargins(24, 24, 36, 0);
        root.addView(quickControls, controls);
        playerView.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener)
                visibility -> quickControls.setVisibility(visibility));
        setContentView(root);
        PlayerFocus.apply(root);
    }

    @Override protected void onStart() {
        super.onStart();
        initializePlayer();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String next = intent.getStringExtra(EXTRA_URL);
        if (next == null || next.isEmpty() || next.equals(url)) return;
        savePosition();
        releasePlayer();
        setIntent(intent);
        url = next;
        initializePlayer();
    }

    @Override protected void onStop() {
        savePosition();
        releasePlayer();
        super.onStop();
    }

    private void initializePlayer() {
        if (player != null) return;
        diagnosticPlayback = (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
                && getIntent().getBooleanExtra(EXTRA_DIAGNOSTIC, false);
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent("TorrServerTV/0.2 (Android TV)")
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15_000)
                .setReadTimeoutMs(60_000);
        renderedVideo = false;
        showingPlaybackError = false;
        player = new ExoPlayer.Builder(this, TvPlayback.renderers(this))
                .setMediaSourceFactory(new DefaultMediaSourceFactory(http, TvPlayback.extractors()))
                .build();
        // Device checks must be silent before prepare and must not alter the owner's resume position.
        if (diagnosticPlayback) player.setVolume(0);
        frameRate = TvFrameRate.attach(this, player);
        playerView.setPlayer(player);
        playbackOptions = new PlaybackOptions(this, player, playerView.getSubtitleView());
        player.addListener(new Player.Listener() {
            @Override public void onTracksChanged(@NonNull Tracks tracks) {
                boolean hasVideo = false, selectedVideo = false, hasAudio = false, selectedAudio = false;
                for (Tracks.Group group : tracks.getGroups()) {
                    if (group.getType() == androidx.media3.common.C.TRACK_TYPE_VIDEO) {
                        hasVideo = true;
                        selectedVideo |= group.isSelected();
                    } else if (group.getType() == androidx.media3.common.C.TRACK_TYPE_AUDIO) {
                        hasAudio = true;
                        selectedAudio |= group.isSelected();
                    }
                    if (group.getType() != androidx.media3.common.C.TRACK_TYPE_VIDEO
                            && group.getType() != androidx.media3.common.C.TRACK_TYPE_AUDIO) continue;
                    for (int i = 0; i < group.length; i++) {
                        androidx.media3.common.Format format = group.getTrackFormat(i);
                        Log.i(TAG, "Track type=" + group.getType() + " selected=" + group.isTrackSelected(i)
                                + " support=" + group.getTrackSupport(i) + " mime=" + format.sampleMimeType
                                + " codecs=" + format.codecs + " language=" + format.language
                                + " size=" + format.width + "x" + format.height + " fps=" + format.frameRate
                                + " channels=" + format.channelCount);
                    }
                }
                if (hasVideo && !selectedVideo) showPlaybackError(R.string.player_video_unsupported);
                else if (hasAudio && !selectedAudio) showPlaybackError(R.string.player_audio_unsupported);
            }
            @Override public void onPlaybackStateChanged(int playbackState) {
                Log.i(TAG, "Playback state=" + playbackState + " positionMs=" + player.getCurrentPosition()
                        + " bufferedMs=" + player.getTotalBufferedDuration());
                if (playbackState == Player.STATE_READY) {
                    Log.i(TAG, "Internal player ready: " + Uri.parse(url).getPath());
                } else if (playbackState == Player.STATE_ENDED) {
                    Log.i(TAG, "Internal player reached end of media");
                }
            }

            @Override public void onRenderedFirstFrame() {
                renderedVideo = true;
                Log.i(TAG, "First video frame rendered");
            }

            @Override public void onPlayerError(@NonNull PlaybackException error) {
                Log.e(TAG, "Internal playback failed: " + Uri.parse(url).getPath(), error);
                showPlaybackError(R.string.player_error);
            }
        });
        player.setMediaItem(MediaItem.fromUri(url));
        long saved = diagnosticPlayback ? getIntent().getLongExtra("diagnostic_position_ms", 0L)
                : AppPreferences.playback(this).getLong(positionKey(),
                AppPreferences.playback(this).getLong("position_" + Integer.toHexString(url.hashCode()), 0L));
        if (saved > 5_000L) player.seekTo(saved);
        player.prepare();
        player.play();
        playerView.showController();
        playerView.findViewById(androidx.media3.ui.R.id.exo_play_pause).requestFocus();
        progressHandler.postDelayed(progressTick, 10000);
    }

    private void logPlaybackHealth() {
        if (player == null) return;
        androidx.media3.exoplayer.DecoderCounters counters = player.getVideoDecoderCounters();
        androidx.media3.exoplayer.DecoderCounters audio = player.getAudioDecoderCounters();
        androidx.media3.common.Format audioFormat = player.getAudioFormat();
        if (counters != null) counters.ensureUpdated();
        if (audio != null) audio.ensureUpdated();
        Log.i(TAG, "Playback health positionMs=" + player.getCurrentPosition()
                + " bufferedMs=" + player.getTotalBufferedDuration() + " playing=" + player.isPlaying()
                + " volume=" + player.getVolume()
                + " rendered=" + (counters == null ? 0 : counters.renderedOutputBufferCount)
                + " dropped=" + (counters == null ? 0 : counters.droppedBufferCount)
                + " audio=" + (audioFormat == null ? "none" : audioFormat.sampleMimeType + "/" + audioFormat.language)
                + " audioBuffers=" + (audio == null ? 0 : audio.renderedOutputBufferCount));
    }

    private void savePosition() {
        if (diagnosticPlayback || player == null || !renderedVideo) return;
        long position = player.getCurrentPosition();
        long duration = player.getDuration();
        if (duration > 0 && position > duration - 30_000L) position = 0L;
        AppPreferences.playback(this).edit().putLong(positionKey(), position)
                .putLong("duration_" + StreamUrls.mediaKey(url), Math.max(0, duration))
                .putLong("updated_" + StreamUrls.mediaKey(url), System.currentTimeMillis()).apply();
    }

    private String positionKey() { return "position_" + StreamUrls.mediaKey(url); }

    private void releasePlayer() {
        progressHandler.removeCallbacks(progressTick);
        if (player == null) return;
        logPlaybackHealth();
        if (playbackOptions != null) playbackOptions.close();
        playbackOptions = null;
        playerView.setPlayer(null);
        if (frameRate != null) frameRate.close();
        frameRate = null;
        player.release();
        player = null;
    }

    private void showPlaybackError(int message) {
        if (isFinishing() || showingPlaybackError) return;
        showingPlaybackError = true;
        if (player != null) player.pause();
        AlertDialog dialog = new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                .setMessage(message)
                .setPositiveButton(R.string.open_vlc, (d, w) -> openExternal("org.videolan.vlc"))
                .setNeutralButton(R.string.open_kodi, (d, w) -> openExternal("org.xbmc.kodi"))
                .setNegativeButton(R.string.close, (d, w) -> finish())
                .create();
        PlayerFocus.show(dialog);
    }

    private void openExternal(String packageName) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(Uri.parse(url), "video/*");
            intent.setPackage(packageName);
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, R.string.player_error, Toast.LENGTH_LONG).show();
        }
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN && player != null) {
            if (event.getKeyCode() >= KeyEvent.KEYCODE_DPAD_UP && event.getKeyCode() <= KeyEvent.KEYCODE_DPAD_CENTER
                    && playerView.isControllerFullyVisible()) playerView.showController();
            switch (event.getKeyCode()) {
                case KeyEvent.KEYCODE_MENU:
                case KeyEvent.KEYCODE_CAPTIONS:
                    if (playbackOptions != null) playbackOptions.showSubtitles();
                    return true;
                case KeyEvent.KEYCODE_MEDIA_AUDIO_TRACK:
                    if (playbackOptions != null) playbackOptions.showAudio();
                    return true;
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                    if (player.isPlaying()) player.pause(); else player.play();
                    return true;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                    if (playerView.isControllerFullyVisible()) break;
                    if (player.isPlaying()) player.pause(); else player.play();
                    playerView.showController();
                    return true;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    if (playerView.isControllerFullyVisible()) break;
                    player.seekTo(Math.max(0, player.getCurrentPosition() - 10_000));
                    playerView.showController();
                    return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    if (playerView.isControllerFullyVisible()) break;
                    player.seekTo(player.getCurrentPosition() + 10_000);
                    playerView.showController();
                    return true;
                case KeyEvent.KEYCODE_DPAD_UP:
                    if (playerView.isControllerFullyVisible()) break;
                    playerView.showController();
                    quickControls.getChildAt(0).requestFocus();
                    return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && playerView != null) playerView.showController();
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
}

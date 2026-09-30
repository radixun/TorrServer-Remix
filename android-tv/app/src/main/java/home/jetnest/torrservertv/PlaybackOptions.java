package home.jetnest.torrservertv;

import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;

import androidx.annotation.OptIn;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.Tracks;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.CaptionStyleCompat;
import androidx.media3.ui.SubtitleView;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Playback-only actions, reachable directly without leaving the video. */
@OptIn(markerClass = UnstableApi.class)
final class PlaybackOptions {
    private final Context context;
    private final ExoPlayer player;
    private final SubtitleView subtitles;
    private final SharedPreferences prefs;
    private AlertDialog dialog;

    PlaybackOptions(Context context, ExoPlayer player, SubtitleView subtitles) {
        this.context = context;
        this.player = player;
        this.subtitles = subtitles;
        prefs = AppPreferences.playback(context);
        player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                .setPreferredAudioLanguage(prefs.getString("audio_language", null))
                .setPreferredTextLanguage(prefs.getString("subtitle_language", null))
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, !prefs.getBoolean("subtitles_enabled", false))
                .build());
        applyStyle();
        if (subtitles != null) subtitles.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> applyPosition());
    }

    void close() {
        if (dialog != null) dialog.dismiss();
        dialog = null;
    }

    void showAudio() { showTracks(C.TRACK_TYPE_AUDIO); }

    void showSubtitles() {
        String[] labels = {
                context.getString(prefs.getBoolean("subtitles_enabled", false)
                        ? R.string.subtitles_turn_off : R.string.subtitles_turn_on),
                context.getString(R.string.subtitle_language),
                context.getString(R.string.subtitle_font),
                context.getString(R.string.subtitle_size),
                context.getString(R.string.subtitle_position)
        };
        close();
        dialog = new AlertDialog.Builder(context, android.R.style.Theme_Material_Dialog_Alert)
                .setTitle(R.string.subtitles)
                .setItems(labels, (d, item) -> {
                    if (item == 0) {
                        boolean enabled = !prefs.getBoolean("subtitles_enabled", false);
                        prefs.edit().putBoolean("subtitles_enabled", enabled).apply();
                        player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, !enabled).build());
                        Log.i("TorrServerTV", "Subtitles enabled=" + enabled);
                        if (enabled && prefs.getString("subtitle_language", null) == null) showTracks(C.TRACK_TYPE_TEXT);
                    } else if (item == 1) showTracks(C.TRACK_TYPE_TEXT);
                    else if (item == 2) chooseStyle("subtitle_font", R.string.subtitle_font,
                            context.getResources().getStringArray(R.array.subtitle_fonts), 0);
                    else if (item == 3) chooseStyle("subtitle_size", R.string.subtitle_size,
                            new String[]{"80%", "100%", "125%", "150%"}, 1);
                    else chooseStyle("subtitle_position", R.string.subtitle_position,
                            context.getResources().getStringArray(R.array.subtitle_positions), 0);
                })
                .setNegativeButton(R.string.close, null).create();
        PlayerFocus.show(dialog);
    }

    private void chooseStyle(String key, int title, String[] labels, int fallback) {
        close();
        dialog = new AlertDialog.Builder(context, android.R.style.Theme_Material_Dialog_Alert).setTitle(title)
                .setSingleChoiceItems(labels, boundedPreference(key, fallback, labels.length), (d, which) -> {
                    prefs.edit().putInt(key, which).apply();
                    applyStyle();
                    Log.i("TorrServerTV", key + "=" + which);
                    // Keep the video running and the choices open for immediate comparison.
                })
                .setNegativeButton(R.string.close, null).create();
        PlayerFocus.show(dialog);
    }

    private void showTracks(int type) {
        List<TrackSelectionOverride> choices = new ArrayList<>();
        List<String> labels = new ArrayList<>();
        List<Boolean> supported = new ArrayList<>();
        int selected = -1;
        for (Tracks.Group group : player.getCurrentTracks().getGroups()) {
            if (group.getType() != type) continue;
            for (int i = 0; i < group.length; i++) {
                if (type != C.TRACK_TYPE_AUDIO && !group.isTrackSupported(i)) continue;
                if (group.isTrackSelected(i)) selected = choices.size();
                choices.add(new TrackSelectionOverride(group.getMediaTrackGroup(), i));
                supported.add(group.isTrackSupported(i));
                String label = trackLabel(group.getTrackFormat(i), labels.size() + 1);
                if (!group.isTrackSupported(i)) label += " · " + context.getString(R.string.track_unsupported);
                labels.add(label);
            }
        }
        close();
        AlertDialog.Builder builder = new AlertDialog.Builder(context, android.R.style.Theme_Material_Dialog_Alert)
                .setTitle(type == C.TRACK_TYPE_AUDIO ? R.string.audio_language : R.string.subtitle_language)
                .setNegativeButton(R.string.close, null);
        if (choices.isEmpty()) builder.setMessage(R.string.no_tracks);
        else builder.setSingleChoiceItems(new ArrayAdapter<String>(builder.getContext(),
                android.R.layout.simple_list_item_single_choice, labels) {
            @Override public boolean areAllItemsEnabled() { return !supported.contains(false); }
            @Override public boolean isEnabled(int position) { return supported.get(position); }
            @Override public View getView(int position, View convertView, ViewGroup parent) {
                View view = super.getView(position, convertView, parent);
                view.setAlpha(isEnabled(position) ? 1f : 0.5f);
                return view;
            }
        }, selected, (d, which) -> {
            if (!supported.get(which)) return;
            TrackSelectionOverride override = choices.get(which);
            player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                    .setTrackTypeDisabled(type, false).setOverrideForType(override).build());
            Format format = override.mediaTrackGroup.getFormat(override.trackIndices.get(0));
            SharedPreferences.Editor editor = prefs.edit();
            String key = type == C.TRACK_TYPE_AUDIO ? "audio_language" : "subtitle_language";
            if (format.language == null || "und".equals(format.language)) editor.remove(key);
            else editor.putString(key, format.language);
            if (type == C.TRACK_TYPE_TEXT) editor.putBoolean("subtitles_enabled", true);
            editor.apply();
            Log.i("TorrServerTV", "Selected track type=" + type + " language=" + format.language);
            d.dismiss();
        });
        dialog = builder.create();
        PlayerFocus.show(dialog);
    }

    private String trackLabel(Format format, int ordinal) {
        String language = format.language;
        String label = language == null || "und".equals(language)
                ? context.getString(R.string.track_number, ordinal)
                : Locale.forLanguageTag(language).getDisplayLanguage(context.getResources().getConfiguration().locale);
        if (format.label != null && !format.label.isEmpty()) label += " · " + format.label;
        if (format.sampleMimeType != null && format.sampleMimeType.startsWith("audio/"))
            label += " · " + format.sampleMimeType.substring(6).replace("vnd.dts.hd", "DTS-HD")
                    .replace("vnd.dts", "DTS").toUpperCase(Locale.ROOT);
        if (format.channelCount > 0) label += " · " + format.channelCount + " ch";
        if (format.sampleMimeType != null && (format.sampleMimeType.contains("pgs") || format.sampleMimeType.contains("vobsub")))
            label += " · " + context.getString(R.string.graphic_subtitles);
        return label;
    }

    private int boundedPreference(String key, int fallback, int length) {
        return Math.max(0, Math.min(length - 1, prefs.getInt(key, fallback)));
    }

    private void applyStyle() {
        if (subtitles == null) return;
        Typeface[] fonts = {Typeface.SANS_SERIF, Typeface.SERIF, Typeface.MONOSPACE};
        float[] sizes = {0.0426f, 0.0533f, 0.0666f, 0.0800f};
        subtitles.setApplyEmbeddedStyles(false);
        subtitles.setApplyEmbeddedFontSizes(false);
        subtitles.setStyle(new CaptionStyleCompat(Color.WHITE, Color.TRANSPARENT, Color.TRANSPARENT,
                CaptionStyleCompat.EDGE_TYPE_OUTLINE, Color.BLACK,
                fonts[boundedPreference("subtitle_font", 0, fonts.length)]));
        subtitles.setFractionalTextSize(sizes[boundedPreference("subtitle_size", 1, sizes.length)]);
        applyPosition();
    }

    private void applyPosition() {
        if (subtitles == null) return;
        // Move the complete cue layout so positioned ASS/bitmap cues move too.
        subtitles.setTranslationY(-subtitles.getHeight() * 0.05f * boundedPreference("subtitle_position", 0, 5));
    }
}

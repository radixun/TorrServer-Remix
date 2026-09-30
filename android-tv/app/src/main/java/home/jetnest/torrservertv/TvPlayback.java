package home.jetnest.torrservertv;

import android.content.Context;
import android.util.Log;

import androidx.annotation.OptIn;
import androidx.media3.common.Format;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.util.ParsableByteArray;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.audio.AudioOffloadSupport;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.ForwardingAudioSink;
import androidx.media3.exoplayer.mediacodec.MediaCodecInfo;
import androidx.media3.exoplayer.mediacodec.MediaCodecUtil;
import androidx.media3.extractor.DefaultExtractorsFactory;
import androidx.media3.extractor.DolbyVisionConfig;
import androidx.media3.extractor.Extractor;
import androidx.media3.extractor.ExtractorInput;
import androidx.media3.extractor.ExtractorsFactory;
import androidx.media3.extractor.mkv.MatroskaExtractor;
import androidx.media3.extractor.text.DefaultSubtitleParserFactory;

import java.io.IOException;

/** Adapt container metadata and HDMI output to the decoders actually present on the TV box. */
@OptIn(markerClass = UnstableApi.class)
final class TvPlayback {
    private TvPlayback() {}

    static DefaultRenderersFactory renderers(Context context) {
        DefaultRenderersFactory factory = new DefaultRenderersFactory(context) {
            @Override protected AudioSink buildAudioSink(Context context, boolean floatOutput, boolean playbackParams) {
                // X98 reports DTS passthrough that this Samsung's HDMI EDID does not support.
                // Dolby Digital is supported by the sink; forcing the vendor AC3 decoder
                // instead produced silent PCM on this box.
                return new ForwardingAudioSink(super.buildAudioSink(context, floatOutput, playbackParams)) {
                    @Override public boolean supportsFormat(Format format) {
                        return getFormatSupport(format) != SINK_FORMAT_UNSUPPORTED;
                    }

                    @Override public int getFormatSupport(Format format) {
                        return (MimeTypes.AUDIO_RAW.equals(format.sampleMimeType)
                                || MimeTypes.AUDIO_AC3.equals(format.sampleMimeType)
                                || MimeTypes.AUDIO_E_AC3.equals(format.sampleMimeType)
                                || MimeTypes.AUDIO_E_AC3_JOC.equals(format.sampleMimeType))
                                ? super.getFormatSupport(format) : SINK_FORMAT_UNSUPPORTED;
                    }

                    @Override public void configure(Format format, int bufferSize, int[] channels)
                            throws AudioSink.ConfigurationException {
                        Log.i("TorrServerTV", "Audio output mime=" + format.sampleMimeType
                                + " channels=" + format.channelCount + " sampleRate=" + format.sampleRate);
                        super.configure(format, bufferSize, channels);
                    }

                    @Override public AudioOffloadSupport getFormatOffloadSupport(Format format) {
                        return AudioOffloadSupport.DEFAULT_UNSUPPORTED;
                    }
                };
            }
        };
        factory.setEnableDecoderFallback(true);
        // Decode formats such as DTS/TrueHD locally when the platform cannot play them.
        // Keep working Dolby Digital passthrough ahead of the software fallback.
        factory.setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON);
        return factory;
    }

    static ExtractorsFactory extractors() {
        DefaultExtractorsFactory defaults = new DefaultExtractorsFactory();
        return () -> {
            Extractor[] extractors = defaults.createExtractors();
            for (int i = 0; i < extractors.length; i++) {
                if (extractors[i] instanceof MatroskaExtractor) extractors[i] = new Hdr10MatroskaExtractor();
            }
            return extractors;
        };
    }

    static boolean hasHdr10BaseLayer(byte[] config) {
        // dvcC: profile, BL-present flag, BL compatibility ID. Never reinterpret profile 5 as HDR10.
        return config != null && config.length >= 5 && ((config[2] & 0xff) >> 1) == 7
                && (config[3] & 1) != 0 && ((config[4] & 0xff) >> 4) == 6;
    }

    private static final class Hdr10MatroskaExtractor extends MatroskaExtractor {
        Hdr10MatroskaExtractor() { super(new DefaultSubtitleParserFactory()); }

        @Override protected void handleBlockAddIDExtraData(Track track, ExtractorInput input, int size)
                throws IOException {
            super.handleBlockAddIDExtraData(track, input, size);
            if (!"V_MPEGH/ISO/HEVC".equals(track.codecId) || !hasHdr10BaseLayer(track.dolbyVisionConfigBytes)) return;
            DolbyVisionConfig config = DolbyVisionConfig.parse(new ParsableByteArray(track.dolbyVisionConfigBytes));
            if (config == null) return;
            Format dolby = new Format.Builder().setSampleMimeType(MimeTypes.VIDEO_DOLBY_VISION)
                    .setCodecs(config.codecs).setWidth(track.width).setHeight(track.height).build();
            try {
                for (MediaCodecInfo codec : MediaCodecUtil.getDecoderInfos(MimeTypes.VIDEO_DOLBY_VISION, false, false)) {
                    if (codec.isFormatSupported(dolby)) return;
                }
            } catch (MediaCodecUtil.DecoderQueryException error) {
                Log.w("TorrServerTV", "Cannot query Dolby Vision decoders", error);
                return;
            }
            // Keep the original HEVC configuration, HDR metadata and samples; no transcode or file rewrite.
            track.dolbyVisionConfigBytes = null;
            Log.i("TorrServerTV", "Using HDR10 base layer for unsupported Dolby Vision profile 7");
        }
    }
}

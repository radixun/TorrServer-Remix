package home.jetnest.torrservertv;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class StreamUrlsTest {
    private static final String SERVER = "http://192.0.2.10:8090";

    @Test public void acceptsAllOwnedPlaybackRoutes() {
        assertTrue(StreamUrls.isPlayable(SERVER + "/play/hash/1"));
        assertTrue(StreamUrls.isPlayable(SERVER + "/stream/movie.mkv?link=hash&index=1&play"));
        assertTrue(StreamUrls.isPlayable(SERVER + "/offline/stream/hash/1/movie.mkv"));
    }

    @Test public void rejectsNonPlaybackAndMalformedUrls() {
        assertFalse(StreamUrls.isPlayable(SERVER + "/stream/movie.mkv?link=hash&index=1"));
        assertFalse(StreamUrls.isPlayable("not a url"));
        assertFalse(StreamUrls.isPlayable(null));
    }

    @Test public void enforcesSchemeHostAndEffectivePort() {
        assertTrue(StreamUrls.belongsToServer(SERVER + "/play/hash/1", SERVER));
        assertTrue(StreamUrls.belongsToServer("HTTP://192.0.2.10:8090/play/hash/1", SERVER));
        assertFalse(StreamUrls.belongsToServer("http://192.0.2.11:8090/play/hash/1", SERVER));
        assertFalse(StreamUrls.belongsToServer("http://192.0.2.10:8080/play/hash/1", SERVER));
        assertFalse(StreamUrls.belongsToServer("https://192.0.2.10:8090/play/hash/1", SERVER));
    }

    @Test public void understandsDefaultHttpPorts() {
        assertTrue(StreamUrls.belongsToServer("http://example.test/play/hash/1", "http://example.test"));
        assertFalse(StreamUrls.belongsToServer("https://example.test/play/hash/1", "http://example.test"));
    }
}

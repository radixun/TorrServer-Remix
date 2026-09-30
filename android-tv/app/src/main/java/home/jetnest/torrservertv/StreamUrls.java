package home.jetnest.torrservertv;

import java.net.URI;

final class StreamUrls {
    private StreamUrls() {}

    static boolean isPlayable(String url) {
        if (url == null || url.isEmpty()) return false;
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException ignored) {
            return false;
        }
        String path = uri.getPath() == null ? "" : uri.getPath();
        if (path.startsWith("/offline/stream/") || path.startsWith("/play/")) return true;
        return path.startsWith("/stream")
                && (url.contains("?play") || url.contains("&play"));
    }

    static boolean belongsToServer(String candidate, String serverUrl) {
        try {
            URI link = URI.create(candidate);
            URI server = URI.create(serverUrl);
            return link.getHost() != null
                    && link.getHost().equalsIgnoreCase(server.getHost())
                    && effectivePort(link) == effectivePort(server)
                    && link.getScheme() != null
                    && link.getScheme().equalsIgnoreCase(server.getScheme());
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private static int effectivePort(URI uri) {
        if (uri.getPort() >= 0) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    static String mediaKey(String url) {
        try {
            URI uri = URI.create(url);
            String[] path = uri.getPath().split("/");
            if (path.length >= 5 && "offline".equals(path[1]) && "stream".equals(path[2]))
                return path[3].toLowerCase(java.util.Locale.ROOT) + ":" + path[4];
            String hash = null;
            String index = null;
            if (uri.getQuery() != null) for (String part : uri.getQuery().split("&")) {
                String[] value = part.split("=", 2);
                if (value.length != 2) continue;
                if ("link".equals(value[0])) hash = value[1];
                if ("index".equals(value[0])) index = value[1];
            }
            if (hash != null && hash.matches("(?i)[a-f0-9]{40}") && index != null && index.matches("[0-9]+"))
                return hash.toLowerCase(java.util.Locale.ROOT) + ":" + index;
        } catch (RuntimeException ignored) { }
        return Integer.toHexString(url.hashCode());
    }
}

package home.jetnest.torrservertv;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

final class AppPreferences {
    private static final String PREFS = "torrserver_tv";
    private static final String SERVER_URL = "server_url";
    private static final String DEFAULT_URL = "http://torrserver.example:8090";

    private AppPreferences() {}

    static String serverUrl(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(SERVER_URL, DEFAULT_URL);
    }

    static void setServerUrl(Context context, String value) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(SERVER_URL, normalize(value)).apply();
    }

    static boolean isValidServerUrl(String value) {
        try {
            Uri uri = Uri.parse(normalize(value));
            return ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))
                    && uri.getHost() != null && !uri.getHost().isEmpty();
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    static String normalize(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        return result;
    }

    static SharedPreferences playback(Context context) {
        return context.getSharedPreferences("torrserver_tv_playback", Context.MODE_PRIVATE);
    }
}

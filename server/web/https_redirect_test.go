package web

import (
	"net/http/httptest"
	"testing"

	"server/settings"
)

func TestHTTPSRedirectPreservesEscaping(t *testing.T) {
	old := settings.SslPort
	settings.SslPort = "8443"
	defer func() { settings.SslPort = old }()
	for _, path := range []string{"/search/Star%20Wars?q=a%2Bb", "/search/%D0%9C%D0%B8%D1%80", "/stream/a%2Fb.mkv?index=2"} {
		req := httptest.NewRequest("GET", "http://localhost:8090"+path, nil)
		if got, want := buildHTTPSRedirectTarget(req), "https://localhost:8443"+path; got != want {
			t.Errorf("redirect = %q, want %q", got, want)
		}
	}
}

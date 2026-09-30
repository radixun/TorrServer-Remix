package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	config "server/settings"
)

func TestBrowserMediaProxyPreservesRequestsAndStatus(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if r.URL.RequestURI() != "/browser-media/session?test=1" || string(body) != `{"source":"test"}` {
			t.Errorf("request changed: %s %s", r.URL, body)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"session"}`))
	}))
	defer upstream.Close()
	router := gin.New()
	router.POST("/browser-media/*path", browserMediaHandler(upstream.URL))
	server := httptest.NewServer(router)
	defer server.Close()
	req, _ := http.NewRequest(http.MethodPost, server.URL+"/browser-media/session?test=1", strings.NewReader(`{"source":"test"}`))
	req.Header.Set("Origin", server.URL)
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusCreated || string(body) != `{"id":"session"}` {
		t.Fatalf("proxy response: %d %s", response.StatusCode, body)
	}
}

func TestBrowserMediaRejectsForeignWritesAndMissingService(t *testing.T) {
	for _, origin := range []string{"http://other:8090", "https://server:8090", "null", "http://server:8090/path"} {
		router := gin.New()
		router.POST("/browser-media/*path", browserMediaHandler("http://127.0.0.1:1"))
		req := httptest.NewRequest(http.MethodPost, "http://server:8090/browser-media/session", strings.NewReader("{}"))
		req.Header.Set("Origin", origin)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		if response.Code != http.StatusForbidden {
			t.Fatalf("origin %q: %d", origin, response.Code)
		}
	}
	for _, address := range []string{"", "http://external:8098", "file:///tmp/media", "http://127.0.0.1:8098/settings"} {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		browserMediaHandler(address)(c)
		if c.Writer.Status() != http.StatusServiceUnavailable {
			t.Fatalf("invalid service address %q: %d", address, c.Writer.Status())
		}
	}
}

func TestBrowserMediaUsesExistingAuthentication(t *testing.T) {
	oldAuth := config.HttpAuth
	config.HttpAuth = true
	t.Cleanup(func() { config.HttpAuth = oldAuth })
	router := gin.New()
	SetupRoute(router)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/browser-media/session", strings.NewReader("{}")))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated media request: %d", response.Code)
	}
}

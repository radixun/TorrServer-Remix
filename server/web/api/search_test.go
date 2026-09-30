package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	sets "server/settings"
	"server/torznab"
)

func TestTorznabCanonicalRouteDoesNotRedirect(t *testing.T) {
	originalSettings := sets.BTsets
	originalSearchWA := sets.SearchWA
	originalHTTPAuth := sets.HttpAuth
	t.Cleanup(func() {
		sets.BTsets = originalSettings
		sets.SearchWA = originalSearchWA
		sets.HttpAuth = originalHTTPAuth
	})

	sets.BTsets = &sets.BTSets{}
	sets.SearchWA = true
	sets.HttpAuth = false
	gin.SetMode(gin.TestMode)
	router := gin.New()
	SetupRoute(router)

	for _, target := range []string{
		"/torznab/search?query=Matrix",
		"/torznab/search/Matrix",
	} {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, target, nil)
		router.ServeHTTP(recorder, request)

		if recorder.Code == http.StatusMovedPermanently || recorder.Code == http.StatusTemporaryRedirect || recorder.Code == http.StatusPermanentRedirect {
			t.Fatalf("route %q redirected with status %d to %q", target, recorder.Code, recorder.Header().Get("Location"))
		}
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("route %q returned %d, want handler status %d", target, recorder.Code, http.StatusBadRequest)
		}
	}
}

func TestTorznabSearchDecodesQueryOnce(t *testing.T) {
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodGet, "/torznab/search?query=C%2B%2B", nil)
	if got := torznabSearchQuery(context); got != "C++" {
		t.Fatalf("decoded query = %q, want C++", got)
	}

	context.Request = httptest.NewRequest(http.MethodGet, "/torznab/search/C++", nil)
	context.Params = gin.Params{{Key: "query", Value: "/C++"}}
	if got := torznabSearchQuery(context); got != "C++" {
		t.Fatalf("legacy path query = %q, want C++", got)
	}
}

func TestTorznabSearchReturnsBadGatewayForUpstreamFailure(t *testing.T) {
	originalSettings := sets.BTsets
	t.Cleanup(func() { sets.BTsets = originalSettings })

	sets.BTsets = &sets.BTSets{
		EnableTorznabSearch: true,
		TorznabUrls: []sets.TorznabConfig{
			{Host: "://invalid", Key: "do-not-expose"},
		},
	}
	router := gin.New()
	router.GET("/torznab/search", torznabSearch)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/torznab/search?query=Matrix&index=0", nil)
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502; body=%s", recorder.Code, recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "do-not-expose") || strings.Contains(recorder.Body.String(), "://invalid") {
		t.Fatalf("response exposed Torznab credentials: %s", recorder.Body.String())
	}
}

func TestTorznabSearchRejectsInvalidIndex(t *testing.T) {
	originalSettings := sets.BTsets
	t.Cleanup(func() { sets.BTsets = originalSettings })

	sets.BTsets = &sets.BTSets{
		EnableTorznabSearch: true,
		TorznabUrls: []sets.TorznabConfig{
			{Host: "http://127.0.0.1:1", Key: "secret"},
		},
	}
	router := gin.New()
	router.GET("/torznab/search", torznabSearch)

	for _, index := range []string{"bad", "-2", "1"} {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/torznab/search?query=Matrix&index="+index, nil)
		router.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("index %q returned %d, want 400", index, recorder.Code)
		}
	}
}

func TestTorznabErrorStatus(t *testing.T) {
	timeoutErr := &torznab.SearchError{Failures: []error{context.DeadlineExceeded}}
	if got := torznabErrorStatus(timeoutErr); got != http.StatusGatewayTimeout {
		t.Fatalf("timeout status = %d, want 504", got)
	}
	if got := torznabErrorStatus(errors.New("upstream failed")); got != http.StatusBadGateway {
		t.Fatalf("upstream status = %d, want 502", got)
	}
}

package api

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

// The optional media worker stays on loopback; all public requests use the
// existing authenticated TorrServer origin and retain their cancellation context.
func browserMediaHandler(address string) gin.HandlerFunc {
	target, err := url.Parse(address)
	if err != nil || target.Scheme != "http" || target.Hostname() != "127.0.0.1" || target.User != nil || target.Path != "" || target.RawQuery != "" {
		return func(c *gin.Context) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Browser playback service is unavailable"})
		}
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = 30 * time.Second
	proxy.Transport = transport
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":"Browser playback service is temporarily unavailable"}`))
	}
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodPost {
			if origin := c.GetHeader("Origin"); origin != "" {
				parsed, err := url.Parse(origin)
				scheme := "http"
				if c.Request.TLS != nil {
					scheme = "https"
				}
				if err != nil || parsed.Scheme != scheme || parsed.Host != c.Request.Host || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
					c.AbortWithStatus(http.StatusForbidden)
					return
				}
			}
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8192)
		}
		proxy.ServeHTTP(c.Writer, c.Request)
	}
}

func setupBrowserMedia(route gin.IRouter) {
	handler := browserMediaHandler(os.Getenv("TORRSERVER_BROWSER_MEDIA_URL"))
	route.GET("/browser-media/*path", handler)
	route.POST("/browser-media/*path", handler)
}

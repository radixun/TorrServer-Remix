package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"server/offline"

	"github.com/gin-gonic/gin"
)

func TestOfflineStreamSupportsRanges(t *testing.T) {
	const hash = "0123456789abcdef0123456789abcdef01234567"
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, offline.MarkerFile), []byte("test\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	jobRoot := filepath.Join(root, "library", hash)
	filesRoot := filepath.Join(jobRoot, "files")
	if err := os.MkdirAll(filesRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	content := []byte("0123456789")
	if err := os.WriteFile(filepath.Join(filesRoot, "Movie.mp4"), content, 0o644); err != nil {
		t.Fatal(err)
	}
	job := offline.Job{
		Hash:            hash,
		Title:           "Movie",
		State:           offline.StateCompleted,
		TotalBytes:      int64(len(content)),
		DownloadedBytes: int64(len(content)),
		Progress:        100,
		Files: []offline.FileStatus{{
			ID:              1,
			Path:            "Movie.mp4",
			RelativePath:    "Movie.mp4",
			Length:          int64(len(content)),
			DownloadedBytes: int64(len(content)),
			Completed:       true,
		}},
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}
	manifest, err := json.Marshal(job)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(jobRoot, "manifest.json"), manifest, 0o644); err != nil {
		t.Fatal(err)
	}

	manager := offline.NewManager(root, 0, nil)
	t.Cleanup(manager.Close)
	previous := offlineManager
	offlineManager = func() *offline.Manager { return manager }
	t.Cleanup(func() { offlineManager = previous })

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/offline/stream/:hash/:id/*fname", offlineStream)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/offline/stream/"+hash+"/1/Movie.mp4", nil)
	request.Header.Set("Range", "bytes=2-5")
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusPartialContent {
		t.Fatalf("expected 206, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Body.String(); got != "2345" {
		t.Fatalf("unexpected range body %q", got)
	}
	if got := recorder.Header().Get("Accept-Ranges"); got != "bytes" {
		t.Fatalf("expected Accept-Ranges bytes, got %q", got)
	}
}

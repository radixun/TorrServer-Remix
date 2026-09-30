package offline

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"
)

const testHash = "0123456789abcdef0123456789abcdef01234567"

type memoryReader struct {
	*bytes.Reader
}

func (memoryReader) Close() error { return nil }

type fakeProvider struct {
	source *archiveSource
	err    error
}

func (p fakeProvider) Open(string) (*archiveSource, error) {
	return p.source, p.err
}

func newTestManager(t *testing.T, files map[string][]byte) *Manager {
	t.Helper()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, MarkerFile), []byte("test\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	source := &archiveSource{Title: "Test torrent"}
	paths := make([]string, 0, len(files))
	for path := range files {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	index := 1
	for _, path := range paths {
		data := files[path]
		content := append([]byte(nil), data...)
		source.Files = append(source.Files, sourceFile{
			ID:     index,
			Path:   path,
			Length: int64(len(content)),
			Open: func() (archiveReader, error) {
				return memoryReader{bytes.NewReader(content)}, nil
			},
		})
		index++
	}
	manager := NewManager(root, 0, fakeProvider{source: source})
	t.Cleanup(manager.Close)
	return manager
}

func TestManagerDownloadsAndDeletesSingleFile(t *testing.T) {
	first := []byte("episode one")
	second := []byte("episode two")
	manager := newTestManager(t, map[string][]byte{
		"Season 1/Episode 01.mkv": first,
		"Season 1/Episode 02.mkv": second,
	})

	if _, err := manager.StartFile(testHash, "Series", 2); err != nil {
		t.Fatal(err)
	}
	status := waitForState(t, manager, testHash, StatePartial)
	if len(status.Files) != 2 {
		t.Fatalf("unexpected files: %#v", status.Files)
	}
	if status.Files[0].State != StateNotStored || status.Files[0].Completed {
		t.Fatalf("first episode should not be stored: %#v", status.Files[0])
	}
	if status.Files[1].State != StateCompleted || !status.Files[1].Completed {
		t.Fatalf("second episode should be stored: %#v", status.Files[1])
	}

	stored, _, err := manager.Open(testHash, 2)
	if err != nil {
		t.Fatal(err)
	}
	got, err := io.ReadAll(stored)
	stored.Close()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, second) {
		t.Fatalf("stored content mismatch: %q", got)
	}

	if _, err := manager.StartFile(testHash, "Series", 1); err != nil {
		t.Fatal(err)
	}
	status = waitForState(t, manager, testHash, StateCompleted)
	if !status.Files[0].Completed || !status.Files[1].Completed {
		t.Fatalf("both episodes should be stored: %#v", status.Files)
	}

	if _, err := manager.DeleteFile(testHash, 2); err != nil {
		t.Fatal(err)
	}
	status = manager.Status(testHash)
	if status.State != StatePartial || status.Files[1].State != StateNotStored {
		t.Fatalf("unexpected status after deleting one episode: %#v", status)
	}
	if _, _, err := manager.Open(testHash, 2); err == nil {
		t.Fatal("expected deleted episode to be unavailable")
	}
}

func waitForState(t *testing.T, manager *Manager, hash string, expected State) *Status {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		status := manager.Status(hash)
		if status.State == expected {
			return status
		}
		if status.State == StateFailed {
			t.Fatalf("job failed: %s", status.Error)
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s; current state: %s", expected, manager.Status(hash).State)
	return nil
}

func TestManagerDownloadsAndOpensStoredFile(t *testing.T) {
	content := []byte("offline movie data")
	manager := newTestManager(t, map[string][]byte{"Movie/Movie.mkv": content})

	if _, err := manager.Start(testHash, "Movie"); err != nil {
		t.Fatal(err)
	}
	status := waitForState(t, manager, testHash, StateCompleted)
	if status.Progress != 100 || status.DownloadedBytes != int64(len(content)) {
		t.Fatalf("unexpected progress: %#v", status)
	}
	if len(status.Files) != 1 || !status.Files[0].Completed {
		t.Fatalf("unexpected files: %#v", status.Files)
	}

	stored, _, err := manager.Open(testHash, status.Files[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	defer stored.Close()
	got, err := io.ReadAll(stored)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, content) {
		t.Fatalf("stored content mismatch: %q", got)
	}

	if _, err := manager.Delete(testHash); err != nil {
		t.Fatal(err)
	}
	if got := manager.Status(testHash).State; got != StateNotStored {
		t.Fatalf("expected deleted job, got %s", got)
	}
}

func TestManagerResumesPartFile(t *testing.T) {
	content := []byte("0123456789abcdefghijklmnopqrstuvwxyz")
	manager := newTestManager(t, map[string][]byte{"Movie.mkv": content})
	partPath, err := manager.filePath(testHash, "Movie.mkv")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(partPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(partPath+".part", content[:10], 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := manager.Start(testHash, "Movie"); err != nil {
		t.Fatal(err)
	}
	status := waitForState(t, manager, testHash, StateCompleted)
	stored, _, err := manager.Open(testHash, status.Files[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	defer stored.Close()
	got, err := io.ReadAll(stored)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, content) {
		t.Fatalf("resumed content mismatch: %q", got)
	}
}

func TestManagerRequiresStorageMarker(t *testing.T) {
	manager := NewManager(t.TempDir(), 0, fakeProvider{})
	t.Cleanup(manager.Close)
	if _, err := manager.Start(testHash, "Movie"); err == nil {
		t.Fatal("expected unavailable storage error")
	}
	if status := manager.Status(testHash); status.State != StateUnavailable || status.Available {
		t.Fatalf("unexpected unavailable status: %#v", status)
	}
}

func TestManagerRejectsUnknownFileID(t *testing.T) {
	manager := newTestManager(t, map[string][]byte{"Movie.mkv": []byte("movie")})
	if _, err := manager.StartFile(testHash, "Movie", 99); err != nil {
		t.Fatal(err)
	}
	status := waitForState(t, manager, testHash, StateFailed)
	if status.Error != "torrent file id 99 not found" {
		t.Fatalf("unexpected error: %q", status.Error)
	}
}

func TestSanitizeRelativePathRejectsTraversal(t *testing.T) {
	invalid := []string{"", ".", "..", "../movie.mkv", "/tmp/movie.mkv", "C:\\..\\movie.mkv"}
	for _, path := range invalid {
		if _, err := sanitizeRelativePath(path); err == nil {
			t.Errorf("expected path %q to be rejected", path)
		}
	}
	if got, err := sanitizeRelativePath("Movie/Season 1/Episode 1.mkv"); err != nil || got == "" {
		t.Fatalf("expected safe path, got %q, %v", got, err)
	}
}

package rutor

import (
	"bytes"
	"compress/flate"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"server/rutor/models"
)

func writeRutorFixture(t *testing.T) (string, []*models.TorrentDetails) {
	t.Helper()

	want := []*models.TorrentDetails{
		{
			Title:      "Test Film (2024) WEB-DL 1080p",
			Name:       "Test Film",
			Names:      []string{"Test Film", "Тестовый фильм"},
			Categories: "Movies",
			Size:       "1.4 GB",
			Year:       2024,
			Seed:       42,
			Hash:       "0123456789abcdef0123456789abcdef01234567",
		},
		{
			Title:      "Another Series S01 (2023) WEBRip",
			Name:       "Another Series",
			Categories: "TV",
			Year:       2023,
			Peer:       3,
			Seed:       7,
			Hash:       "89abcdef0123456789abcdef0123456789abcdef",
		},
	}

	data, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal fixture: %v", err)
	}

	var compressed bytes.Buffer
	w, err := flate.NewWriter(&compressed, flate.DefaultCompression)
	if err != nil {
		t.Fatalf("create fixture compressor: %v", err)
	}
	if _, err := w.Write(data); err != nil {
		t.Fatalf("compress fixture: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("close fixture compressor: %v", err)
	}

	path := filepath.Join(t.TempDir(), "rutor.ls")
	if err := os.WriteFile(path, compressed.Bytes(), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	return path, want
}

func forEachFixtureTorrent(t *testing.T, path string, consume func(*models.TorrentDetails)) {
	t.Helper()

	ff, err := os.Open(path)
	if err != nil {
		t.Fatalf("open fixture: %v", err)
	}
	defer ff.Close()

	r := flate.NewReader(ff)
	defer r.Close()
	dec := json.NewDecoder(r)

	opening, err := dec.Token()
	if err != nil {
		t.Fatalf("read fixture opening token: %v", err)
	}
	if opening != json.Delim('[') {
		t.Fatalf("unexpected fixture opening token: %v", opening)
	}

	for dec.More() {
		var torr models.TorrentDetails
		if err := dec.Decode(&torr); err != nil {
			t.Fatalf("decode fixture torrent: %v", err)
		}
		consume(&torr)
	}

	closing, err := dec.Token()
	if err != nil {
		t.Fatalf("read fixture closing token: %v", err)
	}
	if closing != json.Delim(']') {
		t.Fatalf("unexpected fixture closing token: %v", closing)
	}
}

func TestParseChannel(t *testing.T) {
	path, want := writeRutorFixture(t)
	channel := make(chan *models.TorrentDetails)
	done := make(chan []*models.TorrentDetails, 1)

	go func() {
		var got []*models.TorrentDetails
		for torr := range channel {
			got = append(got, torr)
		}
		done <- got
	}()

	forEachFixtureTorrent(t, path, func(torr *models.TorrentDetails) {
		channel <- torr
	})
	close(channel)

	if got := <-done; !reflect.DeepEqual(got, want) {
		t.Fatalf("decoded torrents differ:\n got: %#v\nwant: %#v", got, want)
	}
}

func TestParseArr(t *testing.T) {
	path, want := writeRutorFixture(t)
	var got []*models.TorrentDetails

	forEachFixtureTorrent(t, path, func(torr *models.TorrentDetails) {
		got = append(got, torr)
	})

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("decoded torrents differ:\n got: %#v\nwant: %#v", got, want)
	}
}

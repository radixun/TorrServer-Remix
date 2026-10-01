package api

import (
	"testing"

	torr "server/torr"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
)

func TestMergedPlaylistUsesPlaybackOrdering(t *testing.T) {
	info := metainfo.Info{Name: "Series", Files: []metainfo.FileInfo{{Path: []string{"Episode10.mkv"}, Length: 10}, {Path: []string{"Episode2.mkv"}, Length: 20}}}
	data, err := bencode.Marshal(info)
	if err != nil {
		t.Fatal(err)
	}
	tr := &torr.Torrent{TorrentSpec: &torrent.TorrentSpec{InfoBytes: data}}
	st := statusFromSpec(tr)
	for i, want := range []string{"Episode2.mkv", "Episode10.mkv"} {
		if st.FileStats[i].Path != want || st.FileStats[i].Id != i+1 {
			t.Errorf("file %d = %+v, want %s", i, st.FileStats[i], want)
		}
	}
}

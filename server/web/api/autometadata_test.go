package api

import (
	"encoding/json"
	"testing"

	"server/torr/state"
)

func TestBuildAutoMetadataSeries(t *testing.T) {
	files := []*state.TorrentFileStat{
		{Id: 1, Path: "Weak.Hero.Class.S01E01.1080p.WEB-DL.mkv", Length: 2_700_000_000},
		{Id: 2, Path: "Weak.Hero.Class.S01E02.1080p.WEB-DL.mkv", Length: 2_650_000_000},
	}

	metadata := buildAutoMetadata("Weak.Hero.Class.S01.1080p.WEB-DL", "", files)

	if metadata.Title != "Weak Hero Class" {
		t.Fatalf("unexpected title: %q", metadata.Title)
	}
	if metadata.Category != "tv" {
		t.Fatalf("unexpected category: %q", metadata.Category)
	}
	if metadata.Season != 1 {
		t.Fatalf("unexpected season: %d", metadata.Season)
	}
	if len(metadata.Episodes) != 2 || metadata.Episodes[0] != 1 || metadata.Episodes[1] != 2 {
		t.Fatalf("unexpected episodes: %#v", metadata.Episodes)
	}
	if metadata.Resolution != "1080p" {
		t.Fatalf("unexpected resolution: %q", metadata.Resolution)
	}
}

func TestBuildAutoMetadataMovieWithSample(t *testing.T) {
	files := []*state.TorrentFileStat{
		{Id: 1, Path: "Movie.Name.2024.2160p.REMUX.mkv", Length: 58_000_000_000},
		{Id: 2, Path: "Sample/sample.mkv", Length: 50_000_000},
	}

	metadata := buildAutoMetadata("Movie.Name.2024.2160p.REMUX", "", files)

	if metadata.Category != "movie" {
		t.Fatalf("sample video should not make this a tv torrent: %q", metadata.Category)
	}
	if metadata.Title != "Movie Name 2024" {
		t.Fatalf("unexpected title: %q", metadata.Title)
	}
}

func TestBuildAutoMetadataSeasonOnlyVideo(t *testing.T) {
	files := []*state.TorrentFileStat{
		{Id: 1, Path: "The.Terminal.List.S01.1080p.WEB-DL.mkv", Length: 9_000_000_000},
	}

	metadata := buildAutoMetadata("The.Terminal.List.S01.1080p.WEB-DL", "", files)

	if metadata.Category != "tv" {
		t.Fatalf("season-only video should be detected as tv: %q", metadata.Category)
	}
	if metadata.Season != 1 {
		t.Fatalf("unexpected season: %d", metadata.Season)
	}
}

func TestBuildAutoMetadataMixedCyrillicLatinSeasonWords(t *testing.T) {
	files := []*state.TorrentFileStat{
		{Id: 1, Path: "Show.Name.S01E01.mkv", Length: 1_000},
	}

	metadata := buildAutoMetadata("Show Name / Сeзон: 1 / Сeрии: 1-8 из 8 [WEB-DL 1080p]", "", files)

	if metadata.Title != "Show Name" {
		t.Fatalf("unexpected title: %q", metadata.Title)
	}
	if metadata.Season != 1 {
		t.Fatalf("unexpected season: %d", metadata.Season)
	}
}

func TestCleanMediaTitleRemovesReleaseParentheses(t *testing.T) {
	title := cleanMediaTitle("Spider-Man (Sam Raimi) [2002, WEB-DL 2160p]")

	if title != "Spider-Man" {
		t.Fatalf("unexpected title: %q", title)
	}
}

func TestCleanMediaTitleChoosesEnglishSlashSegment(t *testing.T) {
	title := cleanMediaTitle("Проект Конец света / Project Hail Mary (Phil Lord / Christopher Miller) [2026, WEB-DL 2160p]")

	if title != "Project Hail Mary" {
		t.Fatalf("unexpected title: %q", title)
	}
}

func TestCleanMediaTitleIgnoresAudioTrackSegment(t *testing.T) {
	title := cleanMediaTitle("Акира / Akira / 1x MVO + 4x AVO + 2x VO + Sub")

	if title != "Akira" {
		t.Fatalf("unexpected title: %q", title)
	}
}

func TestBuildAutoMetadataSkipsExistingAudioTrackTitle(t *testing.T) {
	files := []*state.TorrentFileStat{
		{Id: 1, Path: "Akira.1988.2160p.BDRIP.DATPHYR.mkv", Length: 36_651_451_374},
	}

	metadata := buildAutoMetadata("", "1x MVO + 4x AVO + 2x", files)

	if metadata.Title != "Akira 1988" {
		t.Fatalf("unexpected title: %q", metadata.Title)
	}
}

func TestCleanMediaTitleKeepsEnglishMovieBeforeDirectorSegment(t *testing.T) {
	title := cleanMediaTitle("Отель «Гранд Будапешт» / The Grand Budapest Hotel (Уэс Андерсон / Wes Anderson) [2014, США, Германия, UHD BDRemux 2160p]")

	if title != "The Grand Budapest Hotel" {
		t.Fatalf("unexpected title: %q", title)
	}
}

func TestBuildAutoMetadataCyrillicEpisodeSeries(t *testing.T) {
	files := []*state.TorrentFileStat{
		{Id: 1, Path: "Запредельные Истории. Правда или вымысел (2005) SATRip/01 серия.avi", Length: 375_092_002},
		{Id: 2, Path: "Запредельные Истории. Правда или вымысел (2005) SATRip/02 серия.avi", Length: 372_000_000},
		{Id: 3, Path: "Запредельные Истории. Правда или вымысел (2005) SATRip/03 серия.avi", Length: 371_000_000},
	}

	metadata := buildAutoMetadata("Beyond Belief: Fact or Fiction", "Beyond Belief: Fact or Fiction", files)
	if metadata.Category != "tv" {
		t.Fatalf("unexpected category: %q", metadata.Category)
	}
	if metadata.Season != 1 {
		t.Fatalf("unexpected season: %d", metadata.Season)
	}
	if got := buildTorrentDisplayTitle(metadata, &tmdbAutoMetadataResult{EnglishTitle: "Beyond Belief: Fact or Fiction", MediaType: "tv"}); got != "Beyond Belief: Fact or Fiction / S01" {
		t.Fatalf("unexpected display title: %q", got)
	}
}

func TestBuildAutoMetadataSeasonFilesStayTV(t *testing.T) {
	files := []*state.TorrentFileStat{
		{Id: 1, Path: "Happiness.S01.WEB-DL.1080p/Happiness.S01E01.WEB-DL.1080p.mp4", Length: 2_087_055_995},
		{Id: 2, Path: "Happiness.S01.WEB-DL.1080p/Happiness.S01E02.WEB-DL.1080p.mp4", Length: 2_379_631_002},
	}

	metadata := buildAutoMetadata("Happiness / S01", "Happiness / S01", files)
	if metadata.Category != "tv" {
		t.Fatalf("unexpected category: %q", metadata.Category)
	}
	if got := buildTorrentDisplayTitle(metadata, &tmdbAutoMetadataResult{Title: "Happiness", MediaType: "movie"}); got != "Happiness / S01" {
		t.Fatalf("movie TMDB title should not remove season suffix: %q", got)
	}
}

func TestTMDBTitleMatchesQueryRequiresRelevantResult(t *testing.T) {
	if !tmdbTitleMatchesQuery("Spider Man 2", "Spider-Man 2") {
		t.Fatal("expected normalized Spider-Man 2 match")
	}
	if tmdbTitleMatchesQuery("Spider Man 2", "Spider-Man: Far From Home") {
		t.Fatal("unexpected Spider-Man: Far From Home match for Spider-Man 2")
	}
	if tmdbTitleMatchesQuery("House", "House of the Dragon") {
		t.Fatal("unexpected House of the Dragon match for House")
	}
	if !tmdbTitleMatchesQuery("Beyond Belief: Fact or Fiction", "Вне веры: Правда или ложь", "Beyond Belief: Fact or Fiction") {
		t.Fatal("expected original English TV title match")
	}
}

func TestBuildTorrentDisplayTitleExamples(t *testing.T) {
	tests := []struct {
		name     string
		metadata *torrentAutoMetadata
		tmdb     *tmdbAutoMetadataResult
		want     string
	}{
		{
			name: "tv title uses english original and season suffix",
			metadata: &torrentAutoMetadata{
				Title:    "The Terminal List",
				Category: "tv",
				Season:   1,
			},
			tmdb: &tmdbAutoMetadataResult{
				Title:        "Список смертников",
				OriginalName: "The Terminal List",
				MediaType:    "tv",
			},
			want: "The Terminal List / S01",
		},
		{
			name: "english tmdb title wins over non-english original",
			metadata: &torrentAutoMetadata{
				Title:    "Squid Game",
				Category: "tv",
				Season:   2,
			},
			tmdb: &tmdbAutoMetadataResult{
				Title:        "Игра в кальмара",
				EnglishTitle: "Squid Game",
				OriginalName: "오징어 게임",
				MediaType:    "tv",
			},
			want: "Squid Game / S02",
		},
		{
			name: "movie does not add season placeholder",
			metadata: &torrentAutoMetadata{
				Title:    "Spider Man 2",
				Category: "movie",
			},
			tmdb: &tmdbAutoMetadataResult{
				Title:         "Spider-Man 2",
				OriginalTitle: "Spider-Man 2",
				MediaType:     "movie",
			},
			want: "Spider-Man 2",
		},
		{
			name: "roman numeral movie has no season",
			metadata: &torrentAutoMetadata{
				Title:    "Mortal Kombat II",
				Category: "movie",
			},
			tmdb: &tmdbAutoMetadataResult{
				Title:         "Mortal Kombat II",
				OriginalTitle: "Mortal Kombat II",
				MediaType:     "movie",
			},
			want: "Mortal Kombat II",
		},
		{
			name: "fallback series title strips release noise",
			metadata: &torrentAutoMetadata{
				Title:    "Succession S03 2021 1080p WEB-DL",
				Category: "tv",
				Season:   3,
			},
			want: "Succession / S03",
		},
		{
			name: "localized movie tmdb title does not replace cleaned english title",
			metadata: &torrentAutoMetadata{
				Title:    "The Sheep Detectives",
				Category: "movie",
			},
			tmdb: &tmdbAutoMetadataResult{
				Title:     "Следствие ведут овечки",
				MediaType: "movie",
			},
			want: "The Sheep Detectives",
		},
		{
			name: "localized tv tmdb title does not replace cleaned english season title",
			metadata: &torrentAutoMetadata{
				Title:    "Generation Kill / S01",
				Category: "tv",
				Season:   1,
			},
			tmdb: &tmdbAutoMetadataResult{
				Title:     "Поколение убийц",
				MediaType: "tv",
			},
			want: "Generation Kill / S01",
		},
		{
			name: "year and resolution tail stay removed for cleaned tv title",
			metadata: &torrentAutoMetadata{
				Title:    "I Will Find You / S01",
				Category: "tv",
				Season:   1,
			},
			tmdb: &tmdbAutoMetadataResult{
				Title:     "Я тебя отыщу",
				MediaType: "tv",
			},
			want: "I Will Find You / S01",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildTorrentDisplayTitle(tt.metadata, tt.tmdb); got != tt.want {
				t.Fatalf("unexpected display title: got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestBuildTorrentAutoDataKeepsFilesAndMetadata(t *testing.T) {
	files := []*state.TorrentFileStat{
		{Id: 7, Path: "Show.S01E07.mkv", Length: 1_000},
	}
	metadata := buildAutoMetadata("Show.S01", "", files)
	metadata.TMDB = &torrentTMDBAutoMeta{MediaType: "tv", GenreIDs: []int{18, 80}}
	data := buildTorrentAutoData(files, metadata)

	var parsed torrentAutoData
	if err := json.Unmarshal([]byte(data), &parsed); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if len(parsed.TorrServer.Files) != 1 || parsed.TorrServer.Files[0].Id != 7 {
		t.Fatalf("files were not preserved: %#v", parsed.TorrServer.Files)
	}
	if parsed.TorrServer.Metadata == nil || parsed.TorrServer.Metadata.Category != "tv" {
		t.Fatalf("metadata was not saved: %#v", parsed.TorrServer.Metadata)
	}
	if got := parsed.TorrServer.Metadata.TMDB.GenreIDs; len(got) != 2 || got[0] != 18 || got[1] != 80 {
		t.Fatalf("TMDB genre ids were not saved: %#v", parsed.TorrServer.Metadata.TMDB)
	}
}

func TestExtractTorrentAutoFilesFromData(t *testing.T) {
	files := []*state.TorrentFileStat{
		{Id: 3, Path: "Existing.Show.S02E03.mkv", Length: 2_000},
	}
	data := buildTorrentAutoData(files, &torrentAutoMetadata{Title: "Existing Show", Category: "tv"})

	extracted := extractTorrentAutoFiles(data)
	if len(extracted) != 1 || extracted[0].Id != 3 || extracted[0].Path != files[0].Path {
		t.Fatalf("unexpected extracted files: %#v", extracted)
	}
}

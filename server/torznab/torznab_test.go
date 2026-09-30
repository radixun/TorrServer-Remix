package torznab

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"server/rutor/models"
	"server/settings"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func useTorznabTestTransport(t *testing.T, transport roundTripFunc) {
	t.Helper()
	originalClient := torznabHTTPClient
	torznabHTTPClient = &http.Client{Transport: transport}
	t.Cleanup(func() { torznabHTTPClient = originalClient })
}

func xmlResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Status:     http.StatusText(status),
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func TestBuildTorznabAPIURL(t *testing.T) {
	tests := []struct {
		name       string
		host       string
		wantScheme string
		wantPath   string
		wantQuery  string
	}{
		{
			name:       "host without scheme",
			host:       "jackett.local:9117/api/v2.0/indexers/example/results/torznab/",
			wantScheme: "http",
			wantPath:   "/api/v2.0/indexers/example/results/torznab/api",
		},
		{
			name:       "existing api suffix and query",
			host:       "https://jackett.local/indexer/torznab/api/?profile=full",
			wantScheme: "https",
			wantPath:   "/indexer/torznab/api",
			wantQuery:  "full",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			u, err := buildTorznabAPIURL(tt.host)
			if err != nil {
				t.Fatalf("buildTorznabAPIURL returned error: %v", err)
			}
			if u.Scheme != tt.wantScheme {
				t.Fatalf("scheme = %q, want %q", u.Scheme, tt.wantScheme)
			}
			if u.Path != tt.wantPath {
				t.Fatalf("path = %q, want %q", u.Path, tt.wantPath)
			}
			if got := u.Query().Get("profile"); got != tt.wantQuery {
				t.Fatalf("profile = %q, want %q", got, tt.wantQuery)
			}
		})
	}
}

func TestSearchOneBuildsRequestWithoutDoubleAPI(t *testing.T) {
	useTorznabTestTransport(t, func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "jackett.test" {
			t.Errorf("host = %q, want jackett.test", r.URL.Host)
		}
		if r.URL.Path != "/torznab/api" {
			t.Errorf("path = %q, want /torznab/api", r.URL.Path)
		}
		if got := r.URL.Query().Get("q"); got != "C++" {
			t.Errorf("query = %q, want C++", got)
		}
		if got := r.URL.Query().Get("profile"); got != "full" {
			t.Errorf("profile = %q, want full", got)
		}
		return xmlResponse(http.StatusOK, `<rss><channel><item><title>C++ [2025, WEB-DL 1080p]</title><link>magnet:?xt=urn:btih:ABC</link></item></channel></rss>`), nil
	})

	results, err := searchOne(context.Background(), "https://jackett.test/torznab/api?profile=full", "secret", "C++")
	if err != nil {
		t.Fatalf("searchOne returned error: %v", err)
	}
	if len(results) != 1 || results[0].Title != "C++ [2025, WEB-DL 1080p]" {
		t.Fatalf("unexpected results: %#v", results)
	}
}

func TestSearchOneReportsHTTPAndXMLErrors(t *testing.T) {
	t.Run("http", func(t *testing.T) {
		useTorznabTestTransport(t, func(_ *http.Request) (*http.Response, error) {
			return xmlResponse(http.StatusBadRequest, "challenge"), nil
		})

		_, err := searchOne(context.Background(), "https://jackett.test", "secret", "Matrix")
		var requestErr *torznabRequestError
		if err == nil || !strings.Contains(err.Error(), "HTTP 400") {
			t.Fatalf("expected HTTP error, got %v", err)
		}
		if !errors.As(err, &requestErr) || requestErr.kind != "http" {
			t.Fatalf("expected typed HTTP error, got %#v", err)
		}
	})

	t.Run("xml", func(t *testing.T) {
		useTorznabTestTransport(t, func(_ *http.Request) (*http.Response, error) {
			return xmlResponse(http.StatusOK, `<rss><channel>`), nil
		})

		_, err := searchOne(context.Background(), "https://jackett.test", "secret", "Matrix")
		var requestErr *torznabRequestError
		if err == nil || !errors.As(err, &requestErr) || requestErr.kind != "xml" {
			t.Fatalf("expected typed XML error, got %#v", err)
		}
	})

	t.Run("torznab error document", func(t *testing.T) {
		useTorznabTestTransport(t, func(_ *http.Request) (*http.Response, error) {
			return xmlResponse(http.StatusOK, `<error code="100" description="challenge"/>`), nil
		})

		_, err := searchOne(context.Background(), "https://jackett.test", "secret", "Matrix")
		var requestErr *torznabRequestError
		if err == nil || !errors.As(err, &requestErr) || requestErr.kind != "xml" {
			t.Fatalf("expected typed Torznab XML error, got %#v", err)
		}
	})
}

func TestSearchContextReturnsErrorOnlyForCompleteFailure(t *testing.T) {
	originalSettings := settings.BTsets
	t.Cleanup(func() { settings.BTsets = originalSettings })

	useTorznabTestTransport(t, func(request *http.Request) (*http.Response, error) {
		if request.URL.Host == "failing.test" {
			return xmlResponse(http.StatusBadRequest, "challenge"), nil
		}
		return xmlResponse(http.StatusOK, `<rss><channel><item><title>Matrix [1999, WEB-DL 1080p]</title><link>magnet:?xt=urn:btih:ABC</link></item></channel></rss>`), nil
	})

	settings.BTsets = &settings.BTSets{
		EnableTorznabSearch: true,
		TorznabUrls: []settings.TorznabConfig{
			{Host: "https://failing.test", Key: "do-not-expose"},
		},
	}
	results, err := SearchContext(context.Background(), "Matrix", -1)
	if err == nil || results != nil {
		t.Fatalf("expected complete upstream failure, got results=%#v err=%v", results, err)
	}
	if strings.Contains(err.Error(), "do-not-expose") || strings.Contains(err.Error(), "failing.test") {
		t.Fatalf("error exposed endpoint credentials: %q", err)
	}

	settings.BTsets.TorznabUrls = append(settings.BTsets.TorznabUrls, settings.TorznabConfig{Host: "https://working.test", Key: "secret"})
	results, err = SearchContext(context.Background(), "Matrix", -1)
	if err != nil {
		t.Fatalf("partial success should not return an error: %v", err)
	}
	if len(results) != 1 || results[0].Title != "Matrix [1999, WEB-DL 1080p]" {
		t.Fatalf("unexpected partial results: %#v", results)
	}
}

func TestSearchConfigStopsAfterEnoughRankedResults(t *testing.T) {
	calls := 0
	var body strings.Builder
	body.WriteString(`<rss><channel>`)
	for i := 0; i < enoughRankedResults; i++ {
		body.WriteString(`<item><title>Matrix Release `)
		body.WriteString(strconv.Itoa(i))
		body.WriteString(` [1999, WEB-DL 1080p]</title><link>magnet:?xt=urn:btih:`)
		body.WriteString(strconv.Itoa(i))
		body.WriteString(`</link></item>`)
	}
	body.WriteString(`</channel></rss>`)

	useTorznabTestTransport(t, func(_ *http.Request) (*http.Response, error) {
		calls++
		return xmlResponse(http.StatusOK, body.String()), nil
	})
	plan := searchPlan{
		Candidates: []searchCandidate{{Query: "Matrix"}, {Query: "The Matrix"}},
		Aliases:    []string{"Matrix"},
		Strict:     true,
	}
	results, attempts, successes, failures := searchConfig(
		context.Background(),
		settings.TorznabConfig{Host: "https://working.test", Key: "secret"},
		plan,
	)

	if len(failures) != 0 || attempts != 1 || successes != 1 || calls != 1 {
		t.Fatalf("expected one successful attempt, attempts=%d successes=%d calls=%d failures=%#v", attempts, successes, calls, failures)
	}
	if len(results) != enoughRankedResults {
		t.Fatalf("results = %d, want %d", len(results), enoughRankedResults)
	}
}

func TestBuildQueryVariantsNormalizesPunctuation(t *testing.T) {
	variants := buildQueryVariants("K-Pop Demon Hunters")

	for _, want := range []string{"K-Pop Demon Hunters", "K Pop Demon Hunters", "KPop Demon Hunters"} {
		if !containsString(variants, want) {
			t.Fatalf("buildQueryVariants missing %q in %#v", want, variants)
		}
	}
}

func TestRankingPreservesCPlusPlusTitle(t *testing.T) {
	plan := searchPlan{Aliases: []string{"C++"}, Strict: true}
	results := rankAndDedupeResults([]*models.TorrentDetails{
		{Title: "C Programming Language [2025, WEB-DL 1080p]", Link: "c", Seed: 100},
		{Title: "C++ [2025, WEB-DL 1080p]", Link: "cplusplus", Seed: 1},
	}, plan)

	if len(results) != 1 || results[0].Link != "cplusplus" {
		t.Fatalf("expected only the C++ title, got %#v", results)
	}
}

func TestAudioMarkerInMatchedTitleIsNotPenalized(t *testing.T) {
	plan := searchPlan{
		Aliases:     []string{"The Score"},
		TargetYears: map[int]struct{}{2025: {}},
		Strict:      true,
	}
	results := rankAndDedupeResults([]*models.TorrentDetails{
		{Title: "The Score [2025, WEB-DL 1080p]", Link: "movie", Seed: 1},
	}, plan)

	if len(results) != 1 || results[0].Link != "movie" {
		t.Fatalf("matched movie title must not collide with the audio marker: %#v", results)
	}
}

func TestExplicitYearDoesNotReduceTitleCoverage(t *testing.T) {
	plan := searchPlan{
		Aliases:     []string{"The Score 2025"},
		TargetYears: map[int]struct{}{2025: {}},
		Strict:      true,
	}
	results := rankAndDedupeResults([]*models.TorrentDetails{
		{Title: "The Score / Счёт [2025, WEB-DL 1080p]", Link: "movie"},
	}, plan)

	if len(results) != 1 || results[0].Link != "movie" {
		t.Fatalf("explicit year should remain a year constraint, got %#v", results)
	}
}

func TestStrictRankingKeepsLocalizedAliasAndDropsPartialForeignMatch(t *testing.T) {
	plan := searchPlan{
		Aliases: []string{
			"KPop Demon Hunters",
			"Кейпоп-охотницы на демонов",
		},
		Strict: true,
	}
	results := rankAndDedupeResults([]*models.TorrentDetails{
		{Title: "Святая ночь. Охотники на демонов / Holy Night: Demon Hunters [2025]", Link: "bad", Seed: 1000},
		{Title: "Кейпоп-охотницы на демонов / KPop Demon Hunters [2025, WEB-DL 1080p]", Link: "good", Seed: 10},
	}, plan)

	if len(results) != 1 {
		t.Fatalf("expected only the localized exact match, got %d results: %#v", len(results), results)
	}
	if results[0].Link != "good" {
		t.Fatalf("expected good result to survive, got %q", results[0].Link)
	}
}

func TestRankingPrefersBetterTitleMatchBeforeSeeders(t *testing.T) {
	plan := searchPlan{
		Aliases: []string{"Mortal Kombat II", "Мортал Комбат 2"},
		Strict:  true,
	}
	results := rankAndDedupeResults([]*models.TorrentDetails{
		{Title: "PANINI - Mortal Kombat II: Sticker Album [1996, PDF]", Link: "book", Seed: 500},
		{Title: "Мортал Комбат 2 / Mortal Kombat II [2026, WEB-DL 2160p]", Link: "movie", Seed: 10},
	}, plan)

	if len(results) != 1 {
		t.Fatalf("expected only the movie match, got %d", len(results))
	}
	if results[0].Link != "movie" {
		t.Fatalf("expected movie to outrank book by localized alias, got %q", results[0].Link)
	}
}

func TestRankingPrefersVideoOverSoundtrack(t *testing.T) {
	plan := searchPlan{
		Aliases: []string{"KPop Demon Hunters", "Кейпоп-охотницы на демонов"},
		Strict:  true,
	}
	results := rankAndDedupeResults([]*models.TorrentDetails{
		{Title: "[TR24] KPop Demon Hunters Cast - Кейпоп-охотницы на демонов / KPop Demon Hunters (Soundtrack) [2025, MP3]", Link: "soundtrack", Seed: 500},
		{Title: "Кейпоп-охотницы на демонов / KPop Demon Hunters [2025, мультфильм, WEB-DL 1080p]", Link: "movie", Seed: 10},
	}, plan)

	if len(results) != 1 {
		t.Fatalf("expected only the video release, got %d", len(results))
	}
	if results[0].Link != "movie" {
		t.Fatalf("expected video release to outrank soundtrack, got %q", results[0].Link)
	}
}

func TestYearAwareRankingDropsOldSingleAliasMatch(t *testing.T) {
	plan := searchPlan{
		Aliases:     []string{"Witte Wieven", "Heresy"},
		TargetYears: map[int]struct{}{2024: {}},
		Strict:      true,
	}
	results := rankAndDedupeResults([]*models.TorrentDetails{
		{Title: "Бронированные Воины Вотомы: Сияющая Ересь / Armored Trooper Votoms: Shining Heresy [1994, DVDRip]", Link: "old", Seed: 100},
		{Title: "Witte Wieven / Heresy [2024, WEB-DL 1080p]", Link: "movie", Seed: 1},
	}, plan)

	if len(results) != 1 {
		t.Fatalf("expected only the matching release year, got %d results: %#v", len(results), results)
	}
	if results[0].Link != "movie" {
		t.Fatalf("expected 2024 movie result, got %q", results[0].Link)
	}
}

func TestYearAwareRankingDropsWrongYearWhenNoMatchingReleaseSurvives(t *testing.T) {
	plan := searchPlan{
		Aliases:     []string{"War of the Worlds"},
		TargetYears: map[int]struct{}{2025: {}},
		Strict:      true,
	}
	results := rankAndDedupeResults([]*models.TorrentDetails{
		{Title: "Война миров / War of the Worlds [2005, UHD BDRemux 2160p]", Link: "old", Seed: 100},
	}, plan)

	if len(results) != 0 {
		t.Fatalf("expected wrong-year result to be filtered, got %#v", results)
	}
}

func TestYearAwareRankingDropsMusicWithWrongYear(t *testing.T) {
	plan := searchPlan{
		Aliases:     []string{"Maharaja"},
		TargetYears: map[int]struct{}{2024: {}},
		Strict:      true,
	}
	results := rankAndDedupeResults([]*models.TorrentDetails{
		{Title: "(House) Club: Soho Rooms - Maharaja - Mixed by Dj List [2009, MP3]", Link: "music", Seed: 50},
	}, plan)

	if len(results) != 0 {
		t.Fatalf("expected wrong-year music result to be filtered, got %#v", results)
	}
}

func TestRankingDropsAudioReleaseWithMatchingYear(t *testing.T) {
	plan := searchPlan{
		Aliases:     []string{"Heresy"},
		TargetYears: map[int]struct{}{2024: {}},
		Strict:      true,
	}
	results := rankAndDedupeResults([]*models.TorrentDetails{
		{Title: "(Deathcore / Metalcore) A Knight Under Maria's Altar - Heresy Of Horror [2024, FLAC, lossless]", Link: "music", Seed: 50},
	}, plan)

	if len(results) != 0 {
		t.Fatalf("expected same-year audio release to be filtered, got %#v", results)
	}
}

func TestRankingDropsSoundtrackWithMatchingYear(t *testing.T) {
	plan := searchPlan{
		Aliases:     []string{"Avatar: Fire and Ash"},
		TargetYears: map[int]struct{}{2025: {}},
		Strict:      true,
	}
	results := rankAndDedupeResults([]*models.TorrentDetails{
		{Title: "[TR24][OF][LDR] Miley Cyrus - Dream As One (from Avatar: Fire and Ash) [2025, Soundtrack]", Link: "soundtrack", Seed: 50},
	}, plan)

	if len(results) != 0 {
		t.Fatalf("expected same-year soundtrack to be filtered, got %#v", results)
	}
}

func TestRankAndDedupeResultsUsesStableTorrentKey(t *testing.T) {
	plan := searchPlan{Aliases: []string{"Spider-Man"}, Strict: true}
	results := rankAndDedupeResults([]*models.TorrentDetails{
		{Title: "Человек-паук / Spider-Man [2002, 1080p]", Size: "10 GiB", Link: "first", Seed: 1},
		{Title: "Человек-паук / Spider-Man [2002, 1080p]", Size: "10 GiB", Link: "second", Seed: 50},
	}, plan)

	if len(results) != 1 {
		t.Fatalf("expected duplicate link to be collapsed, got %d", len(results))
	}
	if results[0].Seed != 50 {
		t.Fatalf("expected stronger duplicate to remain, got seed %d", results[0].Seed)
	}
}

func TestRankAndDedupeWinnerIsIndependentOfInputOrder(t *testing.T) {
	plan := searchPlan{Aliases: []string{"Spider-Man"}, Strict: true}
	weak := &models.TorrentDetails{Title: "Spider-Man [2002, 1080p]", Size: "10 GiB", Link: "weak", Seed: 1}
	strong := &models.TorrentDetails{Title: "Spider-Man [2002, 1080p]", Size: "10 GiB", Link: "strong", Seed: 50}

	forward := rankAndDedupeResults([]*models.TorrentDetails{weak, strong}, plan)
	reverse := rankAndDedupeResults([]*models.TorrentDetails{strong, weak}, plan)
	if len(forward) != 1 || len(reverse) != 1 {
		t.Fatalf("expected one duplicate in both orders: forward=%#v reverse=%#v", forward, reverse)
	}
	if forward[0].Link != "strong" || reverse[0].Link != "strong" {
		t.Fatalf("expected stronger duplicate in both orders: forward=%q reverse=%q", forward[0].Link, reverse[0].Link)
	}
}

func containsString(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

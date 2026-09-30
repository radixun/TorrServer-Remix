package settings

import (
	"strings"
	"testing"
)

func TestBTSetsStringRedactsSecrets(t *testing.T) {
	sets := &BTSets{
		TMDBSettings: TMDBConfig{
			APIKey: "tmdb-secret",
		},
		TorznabUrls: []TorznabConfig{
			{
				Host: "http://192.0.2.10:9117/api/v2.0/indexers/rutracker/results/torznab/",
				Key:  "torznab-secret",
				Name: "RuTracker",
			},
		},
	}

	got := sets.String()
	if strings.Contains(got, "tmdb-secret") {
		t.Fatalf("BTSets.String leaked TMDB API key: %s", got)
	}
	if strings.Contains(got, "torznab-secret") {
		t.Fatalf("BTSets.String leaked Torznab API key: %s", got)
	}
	if strings.Count(got, "redacted") != 2 {
		t.Fatalf("BTSets.String should redact two secrets, got: %s", got)
	}
	if sets.TMDBSettings.APIKey != "tmdb-secret" {
		t.Fatalf("BTSets.String mutated TMDB API key: %q", sets.TMDBSettings.APIKey)
	}
	if sets.TorznabUrls[0].Key != "torznab-secret" {
		t.Fatalf("BTSets.String mutated Torznab API key: %q", sets.TorznabUrls[0].Key)
	}
}

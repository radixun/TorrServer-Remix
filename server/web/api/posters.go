package api

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"

	sets "server/settings"
)

type postersReqJS struct {
	Title    string `json:"title,omitempty"`
	Language string `json:"language,omitempty"`
	Limit    int    `json:"limit,omitempty"`
}

type tmdbSearchResponse struct {
	Results []struct {
		ID            int     `json:"id"`
		MediaType     string  `json:"media_type"`
		Title         string  `json:"title"`
		Name          string  `json:"name"`
		OriginalTitle string  `json:"original_title"`
		OriginalName  string  `json:"original_name"`
		PosterPath    string  `json:"poster_path"`
		GenreIDs      []int   `json:"genre_ids"`
		VoteCount     int     `json:"vote_count"`
		Popularity    float64 `json:"popularity"`
	} `json:"results"`
}

type tmdbAutoMetadataResult struct {
	Title         string
	EnglishTitle  string
	OriginalTitle string
	OriginalName  string
	MediaType     string
	Poster        string
	GenreIDs      []int
}

var tmdbHTTPClient = &http.Client{
	Timeout: 10 * time.Second,
	Transport: &http.Transport{
		DialContext:     dialTMDBContext,
		TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12},
	},
}

var tmdbDialer = &net.Dialer{Timeout: 10 * time.Second}

var tmdbResolver = &net.Resolver{
	PreferGo: true,
	Dial: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, "udp", "1.1.1.1:53")
	},
}

func postersSearch(c *gin.Context) {
	var req postersReqJS
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithError(http.StatusBadRequest, err)
		return
	}

	posters, err := searchTMDBPosters(req.Title, req.Language, req.Limit)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"posters": []string{}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"posters": posters})
}

func searchTMDBPosters(title, language string, limit int) ([]string, error) {
	title = strings.TrimSpace(title)
	if title == "" || sets.BTsets == nil || sets.BTsets.TMDBSettings.APIKey == "" {
		return []string{}, nil
	}
	if language == "" {
		language = "en"
	}
	if limit <= 0 || limit > 20 {
		limit = 12
	}

	apiURL, err := buildTMDBSearchURL(sets.BTsets.TMDBSettings.APIURL, title, language)
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json")

	response, err := tmdbHTTPClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return []string{}, nil
	}

	var payload tmdbSearchResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}

	imageURL := normalizeTMDBHost(sets.BTsets.TMDBSettings.ImageURL, "https://image.tmdb.org")
	if language == "ru" && sets.BTsets.TMDBSettings.ImageURLRu != "" {
		imageURL = normalizeTMDBHost(sets.BTsets.TMDBSettings.ImageURLRu, "https://imagetmdb.com")
	}

	posters := make([]string, 0, limit)
	seen := make(map[string]struct{})
	for _, result := range payload.Results {
		if result.PosterPath == "" {
			continue
		}
		poster := imageURL + "/t/p/w300" + result.PosterPath
		if _, ok := seen[poster]; ok {
			continue
		}
		seen[poster] = struct{}{}
		posters = append(posters, poster)
		if len(posters) >= limit {
			break
		}
	}

	return posters, nil
}

func searchBestTMDBMetadata(titles []string, languages []string) (*tmdbAutoMetadataResult, error) {
	if len(languages) == 0 {
		languages = []string{"en"}
	}

	for _, title := range titles {
		for _, language := range languages {
			result, err := searchTMDBMetadata(title, language)
			if err != nil {
				return nil, err
			}
			if result != nil {
				if language != "en" && hasLanguage(languages, "en") {
					englishResult, err := searchTMDBMetadata(title, "en")
					if err != nil {
						return nil, err
					}
					if englishResult != nil && englishResult.Title != "" {
						result.EnglishTitle = englishResult.Title
					}
				}
				return result, nil
			}
		}
	}

	return nil, nil
}

func searchTMDBMetadata(title, language string) (*tmdbAutoMetadataResult, error) {
	title = strings.TrimSpace(title)
	if title == "" || sets.BTsets == nil || sets.BTsets.TMDBSettings.APIKey == "" {
		return nil, nil
	}
	if language == "" {
		language = "en"
	}

	apiURL, err := buildTMDBSearchURL(sets.BTsets.TMDBSettings.APIURL, title, language)
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json")

	response, err := tmdbHTTPClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, nil
	}

	var payload tmdbSearchResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}

	imageURL := normalizeTMDBHost(sets.BTsets.TMDBSettings.ImageURL, "https://image.tmdb.org")
	if language == "ru" && sets.BTsets.TMDBSettings.ImageURLRu != "" {
		imageURL = normalizeTMDBHost(sets.BTsets.TMDBSettings.ImageURLRu, "https://imagetmdb.com")
	}

	var best *tmdbAutoMetadataResult
	bestScore := -1.0
	for _, result := range payload.Results {
		if result.PosterPath == "" || (result.MediaType != "movie" && result.MediaType != "tv") {
			continue
		}
		if !tmdbTitleMatchesQuery(title, result.Title, result.Name, result.OriginalTitle, result.OriginalName) {
			continue
		}
		score := result.Popularity + float64(result.VoteCount)/100
		if best != nil && score <= bestScore {
			continue
		}

		bestScore = score
		bestTitle := result.Title
		if bestTitle == "" {
			bestTitle = result.Name
		}
		if bestTitle == "" {
			bestTitle = result.OriginalTitle
		}
		if bestTitle == "" {
			bestTitle = result.OriginalName
		}
		best = &tmdbAutoMetadataResult{
			Title:         bestTitle,
			EnglishTitle:  englishTMDBTitle(language, bestTitle),
			OriginalTitle: result.OriginalTitle,
			OriginalName:  result.OriginalName,
			MediaType:     result.MediaType,
			Poster:        imageURL + "/t/p/w300" + result.PosterPath,
			GenreIDs:      append([]int(nil), result.GenreIDs...),
		}
	}

	return best, nil
}

func tmdbTitleMatchesQuery(query string, candidates ...string) bool {
	query = normalizeTMDBMatchTitle(query)
	if query == "" {
		return false
	}
	for _, candidate := range candidates {
		if normalizeTMDBMatchTitle(candidate) == query {
			return true
		}
	}
	return false
}

func normalizeTMDBMatchTitle(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return ""
	}
	var builder strings.Builder
	lastWasSpace := true
	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			builder.WriteRune(r)
			lastWasSpace = false
			continue
		}
		if !lastWasSpace {
			builder.WriteByte(' ')
			lastWasSpace = true
		}
	}
	return strings.TrimSpace(builder.String())
}

func hasLanguage(languages []string, language string) bool {
	for _, item := range languages {
		if item == language {
			return true
		}
	}
	return false
}

func englishTMDBTitle(language, title string) string {
	if language == "en" {
		return title
	}
	return ""
}

func buildTMDBSearchURL(apiHost, title, language string) (string, error) {
	apiURL := normalizeTMDBHost(apiHost, "https://api.themoviedb.org")
	if !strings.Contains(apiURL, "/3/search/multi") {
		apiURL = strings.TrimSuffix(apiURL, "/")
		apiURL = strings.Split(apiURL, "/3")[0]
		apiURL += "/3/search/multi"
	}

	parsedURL, err := url.Parse(apiURL)
	if err != nil {
		return "", err
	}

	query := parsedURL.Query()
	query.Set("api_key", sets.BTsets.TMDBSettings.APIKey)
	query.Set("language", language)
	query.Set("include_image_language", language+",null,en")
	query.Set("query", title)
	parsedURL.RawQuery = query.Encode()

	return parsedURL.String(), nil
}

func normalizeTMDBHost(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		value = fallback
	}
	if !strings.HasPrefix(value, "http://") && !strings.HasPrefix(value, "https://") {
		value = "https://" + value
	}
	return strings.TrimSuffix(value, "/")
}

func dialTMDBContext(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil || !isTMDBHost(host) {
		return tmdbDialer.DialContext(ctx, network, address)
	}

	lookupHost := host
	if host == "api.themoviedb.org" || host == "api.tmdb.org" {
		lookupHost = "themoviedb.org"
	}

	addresses, err := tmdbResolver.LookupIPAddr(ctx, lookupHost)
	if err != nil {
		return tmdbDialer.DialContext(ctx, network, address)
	}

	var lastErr error
	for _, resolvedAddress := range addresses {
		if resolvedAddress.IP.To4() == nil {
			continue
		}
		conn, err := tmdbDialer.DialContext(ctx, network, net.JoinHostPort(resolvedAddress.IP.String(), port))
		if err == nil {
			return conn, nil
		}
		lastErr = err
	}

	if lastErr != nil {
		return nil, lastErr
	}
	return tmdbDialer.DialContext(ctx, network, address)
}

func isTMDBHost(host string) bool {
	return host == "api.themoviedb.org" || host == "api.tmdb.org" || host == "image.tmdb.org"
}

package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	sets "server/settings"
)

type discoverItem struct {
	ID           int              `json:"id"`
	MediaType    string           `json:"mediaType"`
	Title        string           `json:"title"`
	OriginalName string           `json:"originalName,omitempty"`
	Overview     string           `json:"overview"`
	Poster       string           `json:"poster,omitempty"`
	Backdrop     string           `json:"backdrop,omitempty"`
	ReleaseDate  string           `json:"releaseDate,omitempty"`
	VoteAverage  float64          `json:"voteAverage"`
	VoteCount    int              `json:"voteCount"`
	Popularity   float64          `json:"popularity"`
	Ratings      []discoverRating `json:"ratings,omitempty"`
}

type discoverRating struct {
	Source string `json:"source"`
	Value  string `json:"value"`
	URL    string `json:"url,omitempty"`
}

type discoverGenre struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type discoverVideo struct {
	Name string `json:"name"`
	Site string `json:"site"`
	Key  string `json:"key"`
	Type string `json:"type"`
	URL  string `json:"url,omitempty"`
}

type tmdbDiscoverResponse struct {
	Page         int `json:"page"`
	TotalPages   int `json:"total_pages"`
	TotalResults int `json:"total_results"`
	Results      []struct {
		ID               int     `json:"id"`
		Title            string  `json:"title"`
		Name             string  `json:"name"`
		OriginalTitle    string  `json:"original_title"`
		OriginalName     string  `json:"original_name"`
		Overview         string  `json:"overview"`
		PosterPath       string  `json:"poster_path"`
		BackdropPath     string  `json:"backdrop_path"`
		ReleaseDate      string  `json:"release_date"`
		FirstAirDate     string  `json:"first_air_date"`
		VoteAverage      float64 `json:"vote_average"`
		VoteCount        int     `json:"vote_count"`
		Popularity       float64 `json:"popularity"`
		MediaType        string  `json:"media_type"`
		OriginalLanguage string  `json:"original_language"`
	} `json:"results"`
}

type tmdbGenresResponse struct {
	Genres []discoverGenre `json:"genres"`
}

type tmdbDetailsResponse struct {
	ID             int             `json:"id"`
	Title          string          `json:"title"`
	Name           string          `json:"name"`
	OriginalName   string          `json:"original_name"`
	OriginalTitle  string          `json:"original_title"`
	Overview       string          `json:"overview"`
	PosterPath     string          `json:"poster_path"`
	BackdropPath   string          `json:"backdrop_path"`
	ReleaseDate    string          `json:"release_date"`
	FirstAirDate   string          `json:"first_air_date"`
	Runtime        int             `json:"runtime"`
	EpisodeRunTime []int           `json:"episode_run_time"`
	Status         string          `json:"status"`
	Homepage       string          `json:"homepage"`
	VoteAverage    float64         `json:"vote_average"`
	VoteCount      int             `json:"vote_count"`
	Genres         []discoverGenre `json:"genres"`
	Videos         struct {
		Results []struct {
			Name     string `json:"name"`
			Site     string `json:"site"`
			Key      string `json:"key"`
			Type     string `json:"type"`
			Official bool   `json:"official"`
		} `json:"results"`
	} `json:"videos"`
	ExternalIDs struct {
		IMDBID string `json:"imdb_id"`
	} `json:"external_ids"`
}

func discoverSearch(c *gin.Context) {
	apiURL, err := buildTMDBDiscoverURL(c)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"results": []discoverItem{}, "error": err.Error()})
		return
	}

	var payload tmdbDiscoverResponse
	if err := getTMDBJSON(apiURL, &payload); err != nil {
		c.JSON(http.StatusOK, gin.H{"results": []discoverItem{}, "error": err.Error()})
		return
	}

	mediaType := normalizeDiscoverMediaType(c.DefaultQuery("media_type", "movie"))
	items := make([]discoverItem, 0, len(payload.Results))
	for _, result := range payload.Results {
		itemMediaType := result.MediaType
		if itemMediaType == "" {
			itemMediaType = mediaType
		}
		title := result.Title
		if title == "" {
			title = result.Name
		}
		originalName := result.OriginalTitle
		if originalName == "" {
			originalName = result.OriginalName
		}
		releaseDate := result.ReleaseDate
		if releaseDate == "" {
			releaseDate = result.FirstAirDate
		}
		ratings := buildTMDBRatings(result.VoteAverage, result.VoteCount, itemMediaType, result.ID, "")

		items = append(items, discoverItem{
			ID:           result.ID,
			MediaType:    itemMediaType,
			Title:        title,
			OriginalName: originalName,
			Overview:     result.Overview,
			Poster:       buildTMDBImageURL(result.PosterPath, "w342", c.Query("language")),
			Backdrop:     buildTMDBImageURL(result.BackdropPath, "w780", c.Query("language")),
			ReleaseDate:  releaseDate,
			VoteAverage:  result.VoteAverage,
			VoteCount:    result.VoteCount,
			Popularity:   result.Popularity,
			Ratings:      ratings,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"page":         payload.Page,
		"totalPages":   payload.TotalPages,
		"totalResults": payload.TotalResults,
		"results":      items,
	})
}

func discoverGenres(c *gin.Context) {
	mediaType := normalizeDiscoverMediaType(c.DefaultQuery("media_type", "movie"))
	apiURL, err := buildTMDBURL("/3/genre/"+mediaType+"/list", url.Values{
		"language": []string{normalizeTMDBLanguage(c.Query("language"))},
	})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"genres": []discoverGenre{}, "error": err.Error()})
		return
	}

	var payload tmdbGenresResponse
	if err := getTMDBJSON(apiURL, &payload); err != nil {
		c.JSON(http.StatusOK, gin.H{"genres": []discoverGenre{}, "error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, payload)
}

func discoverDetails(c *gin.Context) {
	mediaType := normalizeDiscoverMediaType(c.DefaultQuery("media_type", "movie"))
	id, err := strconv.Atoi(c.Query("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	apiURL, err := buildTMDBURL(fmt.Sprintf("/3/%s/%d", mediaType, id), url.Values{
		"language":           []string{normalizeTMDBLanguage(c.Query("language"))},
		"append_to_response": []string{"videos,external_ids"},
	})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"error": err.Error()})
		return
	}

	var payload tmdbDetailsResponse
	if err := getTMDBJSON(apiURL, &payload); err != nil {
		c.JSON(http.StatusOK, gin.H{"error": err.Error()})
		return
	}

	title := payload.Title
	if title == "" {
		title = payload.Name
	}
	originalName := payload.OriginalTitle
	if originalName == "" {
		originalName = payload.OriginalName
	}
	releaseDate := payload.ReleaseDate
	if releaseDate == "" {
		releaseDate = payload.FirstAirDate
	}
	runtime := payload.Runtime
	if runtime == 0 && len(payload.EpisodeRunTime) > 0 {
		runtime = payload.EpisodeRunTime[0]
	}

	videos := make([]discoverVideo, 0, len(payload.Videos.Results))
	for _, video := range payload.Videos.Results {
		if !strings.EqualFold(video.Site, "YouTube") || video.Key == "" {
			continue
		}
		videos = append(videos, discoverVideo{
			Name: video.Name,
			Site: video.Site,
			Key:  video.Key,
			Type: video.Type,
			URL:  "https://www.youtube.com/watch?v=" + video.Key,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"id":           payload.ID,
		"mediaType":    mediaType,
		"title":        title,
		"originalName": originalName,
		"overview":     payload.Overview,
		"poster":       buildTMDBImageURL(payload.PosterPath, "w342", c.Query("language")),
		"backdrop":     buildTMDBImageURL(payload.BackdropPath, "w780", c.Query("language")),
		"releaseDate":  releaseDate,
		"runtime":      runtime,
		"status":       payload.Status,
		"homepage":     payload.Homepage,
		"genres":       payload.Genres,
		"videos":       videos,
		"ratings":      buildTMDBRatings(payload.VoteAverage, payload.VoteCount, mediaType, payload.ID, payload.ExternalIDs.IMDBID),
		"imdbId":       payload.ExternalIDs.IMDBID,
	})
}

func buildTMDBDiscoverURL(c *gin.Context) (string, error) {
	mediaType := normalizeDiscoverMediaType(c.DefaultQuery("media_type", "movie"))
	queryText := strings.TrimSpace(c.Query("query"))
	language := normalizeTMDBLanguage(c.Query("language"))
	page := clampTMDBPage(c.Query("page"))

	values := url.Values{
		"language":      []string{language},
		"page":          []string{strconv.Itoa(page)},
		"include_adult": []string{"false"},
	}

	if queryText != "" {
		values.Set("query", queryText)
		return buildTMDBURL("/3/search/"+mediaType, values)
	}

	sortBy := normalizeDiscoverSort(c.Query("sort_by"), mediaType)
	values.Set("sort_by", sortBy)
	if genre := strings.TrimSpace(c.Query("genre")); genre != "" {
		values.Set("with_genres", genre)
	}
	if yearFrom := validYear(c.Query("year_from")); yearFrom != "" {
		if mediaType == "movie" {
			values.Set("primary_release_date.gte", yearFrom+"-01-01")
		} else {
			values.Set("first_air_date.gte", yearFrom+"-01-01")
		}
	}
	if yearTo := validYear(c.Query("year_to")); yearTo != "" {
		if mediaType == "movie" {
			values.Set("primary_release_date.lte", yearTo+"-12-31")
		} else {
			values.Set("first_air_date.lte", yearTo+"-12-31")
		}
	}
	values.Set("vote_count.gte", "25")

	return buildTMDBURL("/3/discover/"+mediaType, values)
}

func buildTMDBURL(path string, values url.Values) (string, error) {
	if sets.BTsets == nil || sets.BTsets.TMDBSettings.APIKey == "" {
		return "", fmt.Errorf("tmdb api key is not configured")
	}

	apiURL := normalizeTMDBHost(sets.BTsets.TMDBSettings.APIURL, "https://api.themoviedb.org")
	apiURL = strings.Split(apiURL, "/3")[0]
	parsedURL, err := url.Parse(strings.TrimSuffix(apiURL, "/") + path)
	if err != nil {
		return "", err
	}
	query := parsedURL.Query()
	for key, value := range values {
		for _, item := range value {
			query.Add(key, item)
		}
	}
	query.Set("api_key", sets.BTsets.TMDBSettings.APIKey)
	parsedURL.RawQuery = query.Encode()
	return parsedURL.String(), nil
}

func getTMDBJSON(apiURL string, target interface{}) error {
	request, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Accept", "application/json")

	response, err := tmdbHTTPClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("tmdb returned status %s", response.Status)
	}

	return json.NewDecoder(response.Body).Decode(target)
}

func buildTMDBImageURL(path, size, language string) string {
	if path == "" {
		return ""
	}
	imageURL := normalizeTMDBHost(sets.BTsets.TMDBSettings.ImageURL, "https://image.tmdb.org")
	if strings.HasPrefix(strings.ToLower(language), "ru") && sets.BTsets.TMDBSettings.ImageURLRu != "" {
		imageURL = normalizeTMDBHost(sets.BTsets.TMDBSettings.ImageURLRu, "https://imagetmdb.com")
	}
	if size == "" {
		size = "w342"
	}
	return imageURL + "/t/p/" + size + path
}

func buildTMDBRatings(voteAverage float64, voteCount int, mediaType string, id int, imdbID string) []discoverRating {
	ratings := []discoverRating{}
	if voteCount > 0 {
		ratings = append(ratings, discoverRating{
			Source: "TMDB",
			Value:  fmt.Sprintf("%.1f (%d)", voteAverage, voteCount),
			URL:    fmt.Sprintf("https://www.themoviedb.org/%s/%d", mediaType, id),
		})
	}
	if imdbID != "" {
		ratings = append(ratings, discoverRating{
			Source: "IMDb",
			Value:  imdbID,
			URL:    "https://www.imdb.com/title/" + imdbID + "/",
		})
	}
	return ratings
}

func normalizeDiscoverMediaType(value string) string {
	if value == "tv" {
		return "tv"
	}
	return "movie"
}

func normalizeDiscoverSort(value, mediaType string) string {
	switch value {
	case "vote_average.desc", "primary_release_date.desc", "first_air_date.desc", "popularity.desc":
		if mediaType == "tv" && value == "primary_release_date.desc" {
			return "first_air_date.desc"
		}
		if mediaType == "movie" && value == "first_air_date.desc" {
			return "primary_release_date.desc"
		}
		return value
	default:
		return "popularity.desc"
	}
}

func normalizeTMDBLanguage(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "ru", "ru-ru":
		return "ru-RU"
	case "ua", "uk", "uk-ua":
		return "uk-UA"
	case "zh", "zh-cn":
		return "zh-CN"
	case "bg", "bg-bg":
		return "bg-BG"
	case "fr", "fr-fr":
		return "fr-FR"
	case "ro", "ro-ro":
		return "ro-RO"
	default:
		return "en-US"
	}
}

func clampTMDBPage(value string) int {
	page, err := strconv.Atoi(value)
	if err != nil || page < 1 {
		return 1
	}
	if page > 500 {
		return 500
	}
	return page
}

func validYear(value string) string {
	year, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || year < 1900 || year > 2100 {
		return ""
	}
	return strconv.Itoa(year)
}

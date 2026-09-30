package torznab

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"server/log"
	"server/rutor/models"
	"server/settings"
)

type TorznabAttribute struct {
	Name  string `xml:"name,attr"`
	Value string `xml:"value,attr"`
}

type TorznabEnclosure struct {
	URL    string `xml:"url,attr"`
	Length int64  `xml:"length,attr"`
	Type   string `xml:"type,attr"`
}

type TorznabItem struct {
	Title       string             `xml:"title"`
	Link        string             `xml:"link"`
	Description string             `xml:"description"`
	PubDate     string             `xml:"pubDate"`
	Size        int64              `xml:"size"`
	Enclosure   []TorznabEnclosure `xml:"enclosure"`
	Attributes  []TorznabAttribute `xml:"attr"`
}

type TorznabChannel struct {
	Items []TorznabItem `xml:"item"`
}

type TorznabResponse struct {
	XMLName xml.Name       `xml:"rss"`
	Channel TorznabChannel `xml:"channel"`
}

type searchCandidate struct {
	Query string
	Rank  int
}

type scoredTorrent struct {
	Detail *models.TorrentDetails
	Score  float64
}

type tmdbSearchResponse struct {
	Results []struct {
		Title         string  `json:"title"`
		Name          string  `json:"name"`
		OriginalTitle string  `json:"original_title"`
		OriginalName  string  `json:"original_name"`
		MediaType     string  `json:"media_type"`
		ID            int     `json:"id"`
		ReleaseDate   string  `json:"release_date"`
		FirstAirDate  string  `json:"first_air_date"`
		VoteCount     int     `json:"vote_count"`
		Popularity    float64 `json:"popularity"`
	} `json:"results"`
}

var torznabHTTPClient = &http.Client{Timeout: 20 * time.Second}
var tmdbAliasHTTPClient = &http.Client{Timeout: 8 * time.Second}
var releaseYearPattern = regexp.MustCompile(`\b(19\d{2}|20\d{2})\b`)
var cPlusPlusPattern = regexp.MustCompile(`(?i)([\p{L}\p{N}])\+\+`)

const (
	torznabSearchTimeout   = 18 * time.Second
	tmdbAliasTimeout       = 4 * time.Second
	maxSearchCandidates    = 6
	enoughRankedResults    = 40
	maxTorznabResponseSize = 16 << 20
)

type torznabRequestError struct {
	kind       string
	statusCode int
	cause      error
}

func (e *torznabRequestError) Error() string {
	switch e.kind {
	case "timeout":
		return "Torznab request timed out"
	case "http":
		return fmt.Sprintf("Torznab returned HTTP %d", e.statusCode)
	case "xml":
		return "Torznab returned an invalid XML response"
	case "endpoint":
		return "Torznab endpoint is invalid"
	default:
		return "Torznab request failed"
	}
}

func (e *torznabRequestError) Unwrap() error {
	return e.cause
}

// SearchError reports a complete upstream failure. Individual request errors
// are kept for errors.Is/errors.As, while Error intentionally avoids endpoint
// URLs because Torznab API keys are commonly passed in their query strings.
type SearchError struct {
	Attempts int
	Failures []error
}

func (e *SearchError) Error() string {
	if e == nil {
		return ""
	}
	if e.Timeout() {
		return "Torznab search timed out"
	}
	if len(e.Failures) > 0 {
		return fmt.Sprintf("Torznab search failed: %s", e.Failures[len(e.Failures)-1])
	}
	return "Torznab search failed"
}

func (e *SearchError) Unwrap() []error {
	if e == nil {
		return nil
	}
	return e.Failures
}

func (e *SearchError) Timeout() bool {
	if e == nil {
		return false
	}
	for _, failure := range e.Failures {
		if errors.Is(failure, context.DeadlineExceeded) {
			return true
		}
	}
	return false
}

func Search(query string, index int) []*models.TorrentDetails {
	results, _ := SearchContext(context.Background(), query, index)
	return results
}

type searchPlan struct {
	Candidates  []searchCandidate
	Aliases     []string
	TargetYears map[int]struct{}
	Strict      bool
}

// SearchContext searches configured Torznab indexers within one overall
// deadline. Results from successful requests are returned even if another
// candidate or indexer fails; an error is returned only when every attempted
// upstream request failed.
func SearchContext(parent context.Context, query string, index int) ([]*models.TorrentDetails, error) {
	if parent == nil {
		parent = context.Background()
	}
	if settings.BTsets == nil || !settings.BTsets.EnableTorznabSearch || len(settings.BTsets.TorznabUrls) == 0 {
		return nil, nil
	}

	ctx, cancel := context.WithTimeout(parent, torznabSearchTimeout)
	defer cancel()

	plan := buildSearchPlanContext(ctx, query)
	if len(plan.Candidates) == 0 {
		return nil, nil
	}
	if ctx.Err() != nil {
		return nil, &SearchError{Failures: []error{&torznabRequestError{kind: "timeout", cause: ctx.Err()}}}
	}

	configs := settings.BTsets.TorznabUrls
	if index < -1 {
		return nil, &SearchError{Failures: []error{&torznabRequestError{kind: "endpoint"}}}
	}
	if index >= 0 {
		if index >= len(configs) {
			return nil, &SearchError{Failures: []error{&torznabRequestError{kind: "endpoint"}}}
		}
		configs = configs[index : index+1]
	}

	var allResults []*models.TorrentDetails
	var failures []error
	attempts := 0
	successes := 0
	for _, config := range configs {
		if strings.TrimSpace(config.Host) == "" || strings.TrimSpace(config.Key) == "" {
			continue
		}
		results, configAttempts, configSuccesses, configFailures := searchConfig(ctx, config, plan)
		attempts += configAttempts
		successes += configSuccesses
		failures = append(failures, configFailures...)
		allResults = append(allResults, results...)
		if ctx.Err() != nil {
			break
		}
	}

	if attempts == 0 {
		if len(failures) > 0 {
			return nil, &SearchError{Failures: failures}
		}
		return nil, &SearchError{Failures: []error{&torznabRequestError{kind: "endpoint"}}}
	}
	if successes == 0 {
		return nil, &SearchError{Attempts: attempts, Failures: failures}
	}
	return rankAndDedupeResults(allResults, plan), nil
}

func searchConfig(ctx context.Context, config settings.TorznabConfig, plan searchPlan) ([]*models.TorrentDetails, int, int, []error) {
	var results []*models.TorrentDetails
	var failures []error
	attempts := 0
	successes := 0
	for _, candidate := range plan.Candidates {
		if ctx.Err() != nil {
			failures = append(failures, &torznabRequestError{kind: "timeout", cause: ctx.Err()})
			break
		}
		attempts++
		searchResults, err := searchOne(ctx, config.Host, config.Key, candidate.Query)
		if err != nil {
			failures = append(failures, err)
			continue
		}
		successes++
		results = append(results, searchResults...)
		if len(rankAndDedupeResults(results, plan)) >= enoughRankedResults {
			break
		}
	}
	return rankAndDedupeResults(results, plan), attempts, successes, failures
}

func searchOne(ctx context.Context, host, key, query string) ([]*models.TorrentDetails, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	u, err := buildTorznabAPIURL(host)
	if err != nil {
		return nil, &torznabRequestError{kind: "endpoint", cause: err}
	}

	q := u.Query()
	q.Set("apikey", key)
	q.Set("t", "search")
	q.Set("q", query)
	u.RawQuery = q.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, &torznabRequestError{kind: "endpoint", cause: err}
	}
	request.Header.Set("Accept", "application/rss+xml, application/xml;q=0.9")

	resp, err := torznabHTTPClient.Do(request)
	if err != nil {
		kind := "transport"
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			kind = "timeout"
		}
		return nil, &torznabRequestError{kind: kind, cause: err}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, &torznabRequestError{kind: "http", statusCode: resp.StatusCode}
	}

	var torznabResp TorznabResponse
	if err := xml.NewDecoder(io.LimitReader(resp.Body, maxTorznabResponseSize)).Decode(&torznabResp); err != nil {
		return nil, &torznabRequestError{kind: "xml", cause: err}
	}

	var results []*models.TorrentDetails
	for _, item := range torznabResp.Channel.Items {
		detail := &models.TorrentDetails{
			Title:      item.Title,
			Name:       item.Title, // Use Title as Name for now
			Link:       item.Link,
			CreateDate: parseDate(item.PubDate),
		}

		if len(item.Enclosure) > 0 {
			detail.Link = item.Enclosure[0].URL
			detail.Size = formatSize(item.Enclosure[0].Length)
		} else {
			detail.Size = formatSize(item.Size)
		}

		for _, attr := range item.Attributes {
			if attr.Name == "magneturl" {
				detail.Magnet = attr.Value
				detail.Hash = extractHash(detail.Magnet)
			}
			if attr.Name == "seeders" {
				detail.Seed, _ = strconv.Atoi(attr.Value)
			}
			if attr.Name == "peers" {
				detail.Peer, _ = strconv.Atoi(attr.Value)
			}
		}

		// Fallback if magnet not in attributes but link is a magnet
		if detail.Magnet == "" && strings.HasPrefix(detail.Link, "magnet:") {
			detail.Magnet = detail.Link
			detail.Hash = extractHash(detail.Magnet)
		}

		results = append(results, detail)
	}

	return results, nil
}

func buildTorznabAPIURL(host string) (*url.URL, error) {
	host = strings.TrimSpace(host)
	if host == "" {
		return nil, errors.New("empty endpoint")
	}
	if !strings.Contains(host, "://") {
		host = "http://" + host
	}

	u, err := url.Parse(host)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, errors.New("invalid endpoint")
	}
	u.Fragment = ""
	u.Path = strings.TrimRight(u.Path, "/")
	u.RawPath = ""
	if !strings.EqualFold(path.Base(u.Path), "api") {
		u.Path += "/api"
	}
	if u.Path == "" {
		u.Path = "/api"
	}
	return u, nil
}

func buildSearchPlan(query string) searchPlan {
	return buildSearchPlanContext(context.Background(), query)
}

func buildSearchPlanContext(ctx context.Context, query string) searchPlan {
	query = strings.TrimSpace(query)
	if query == "" {
		return searchPlan{}
	}

	explicitYears := extractYears(query)
	aliases := []string{query}
	targetYears := yearsToSet(explicitYears)
	aliasCtx, cancel := context.WithTimeout(ctx, tmdbAliasTimeout)
	aliasInfo := fetchTMDBAliasInfo(aliasCtx, query)
	cancel()
	if len(explicitYears) == 0 {
		for _, year := range aliasInfo.Years {
			targetYears[year] = struct{}{}
		}
	}
	for _, alias := range aliasInfo.Aliases {
		aliases = appendUniqueString(aliases, alias)
	}

	candidates := make([]searchCandidate, 0, maxSearchCandidates)
	for i, alias := range aliases {
		rank := i + 1
		for _, variant := range buildQueryVariants(alias) {
			candidates = appendUniqueCandidate(candidates, searchCandidate{Query: variant, Rank: rank})
			if len(candidates) >= maxSearchCandidates {
				break
			}
		}
		if len(candidates) >= maxSearchCandidates {
			break
		}
	}

	return searchPlan{
		Candidates:  candidates,
		Aliases:     aliases,
		TargetYears: targetYears,
		Strict:      true,
	}
}

func buildQueryVariants(value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}

	variants := []string{value}
	normalized := normalizeSeparators(value)
	variants = appendUniqueString(variants, normalized)

	noApostrophe := strings.NewReplacer("'", "", "’", "", "`", "").Replace(value)
	variants = appendUniqueString(variants, strings.TrimSpace(noApostrophe))
	variants = appendUniqueString(variants, normalizeSeparators(noApostrophe))

	if compact := compactLetterDigitRuns(normalized); compact != normalized {
		variants = appendUniqueString(variants, compact)
	}

	return variants
}

func normalizeSeparators(value string) string {
	var b strings.Builder
	lastSpace := true
	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			lastSpace = false
			continue
		}
		if !lastSpace {
			b.WriteByte(' ')
			lastSpace = true
		}
	}
	return strings.TrimSpace(b.String())
}

func compactLetterDigitRuns(value string) string {
	parts := strings.Fields(value)
	if len(parts) < 2 {
		return value
	}

	var out []string
	for i := 0; i < len(parts); i++ {
		current := parts[i]
		if len([]rune(current)) == 1 && i+1 < len(parts) && len([]rune(parts[i+1])) > 1 {
			out = append(out, current+parts[i+1])
			i++
			continue
		}
		out = append(out, current)
	}
	return strings.Join(out, " ")
}

func rankAndDedupeResults(results []*models.TorrentDetails, plan searchPlan) []*models.TorrentDetails {
	if len(results) == 0 {
		return results
	}

	seen := make(map[string]scoredTorrent, len(results))
	for _, detail := range results {
		if detail == nil {
			continue
		}
		score := scoreTorrent(detail, plan)
		if plan.Strict && score < 0.75 {
			continue
		}
		key := torrentDedupeKey(detail)
		if key == "" {
			key = strings.ToLower(strings.TrimSpace(detail.Title))
		}
		candidate := scoredTorrent{Detail: detail, Score: score}
		if existing, ok := seen[key]; ok {
			if !betterScoredTorrent(candidate, existing) {
				continue
			}
		}
		seen[key] = candidate
	}

	scored := make([]scoredTorrent, 0, len(seen))
	for _, item := range seen {
		scored = append(scored, item)
	}
	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].Score != scored[j].Score {
			return scored[i].Score > scored[j].Score
		}
		if scored[i].Detail.Seed != scored[j].Detail.Seed {
			return scored[i].Detail.Seed > scored[j].Detail.Seed
		}
		if scored[i].Detail.Peer != scored[j].Detail.Peer {
			return scored[i].Detail.Peer > scored[j].Detail.Peer
		}
		return torrentStableIdentity(scored[i].Detail) < torrentStableIdentity(scored[j].Detail)
	})

	out := make([]*models.TorrentDetails, 0, len(scored))
	for _, item := range scored {
		out = append(out, item.Detail)
	}
	return out
}

func betterScoredTorrent(candidate, existing scoredTorrent) bool {
	if candidate.Score != existing.Score {
		return candidate.Score > existing.Score
	}
	if candidate.Detail.Seed != existing.Detail.Seed {
		return candidate.Detail.Seed > existing.Detail.Seed
	}
	if candidate.Detail.Peer != existing.Detail.Peer {
		return candidate.Detail.Peer > existing.Detail.Peer
	}
	candidateHasPayload := strings.TrimSpace(candidate.Detail.Magnet) != "" || strings.TrimSpace(candidate.Detail.Link) != ""
	existingHasPayload := strings.TrimSpace(existing.Detail.Magnet) != "" || strings.TrimSpace(existing.Detail.Link) != ""
	if candidateHasPayload != existingHasPayload {
		return candidateHasPayload
	}
	return torrentStableIdentity(candidate.Detail) < torrentStableIdentity(existing.Detail)
}

func torrentStableIdentity(detail *models.TorrentDetails) string {
	return strings.Join([]string{
		normalizeForMatch(detail.Title),
		strings.TrimSpace(detail.Size),
		strings.ToLower(strings.TrimSpace(detail.Hash)),
		strings.TrimSpace(detail.Magnet),
		strings.TrimSpace(detail.Link),
	}, "|")
}

func scoreTorrent(detail *models.TorrentDetails, plan searchPlan) float64 {
	title := detail.Title
	if title == "" {
		title = detail.Name
	}
	titleTokens := tokenizeForMatch(title)
	if len(titleTokens) == 0 {
		return 0
	}

	best := 0.0
	bestAliasNormalized := ""
	titleNormalized := normalizeForMatch(title)
	for _, alias := range plan.Aliases {
		// A user-supplied year is a separate constraint, not part of title
		// coverage. Otherwise "Title 2025" can score unrelated 2025 releases.
		aliasTitle := stripYears(alias)
		aliasTokens := tokenizeForMatch(aliasTitle)
		if len(aliasTokens) == 0 {
			continue
		}
		matched := 0
		for token := range aliasTokens {
			if _, ok := titleTokens[token]; ok {
				matched++
			}
		}
		score := float64(matched) / float64(len(aliasTokens))
		aliasNormalized := normalizeForMatch(aliasTitle)
		if aliasNormalized != "" && strings.Contains(titleNormalized, aliasNormalized) {
			score += 0.55
		}
		if score > best {
			best = score
			bestAliasNormalized = aliasNormalized
		}
	}

	return best + contentTypeAdjustment(titleNormalized, bestAliasNormalized) + yearAdjustment(title, plan.TargetYears)
}

func contentTypeAdjustment(title, matchedTitle string) float64 {
	score := 0.0
	for _, marker := range []string{
		" web dl ", " webdl ", " bdrip ", " bdremux ", " hdrip ", " dvdrip ",
		" uhd ", " 2160p ", " 1080p ", " 720p ", " hevc ", " hdr10 ", " dolby vision ",
	} {
		if strings.Contains(" "+title+" ", marker) {
			score += 0.12
			break
		}
	}
	for _, marker := range []string{
		" pdf ", " epub ", " flac ", " mp3 ", " audiobook ", " sticker ", " album ",
		" soundtrack ", " score ", " synthpop ", " city pop ", " hi res ", " tr24 ", " tr32 ",
		" lossless ", " tracks ", " metalcore ", " deathcore ", " ost ", " single ",
		" книга ", " книги ", " альбом ", " наклеек ", " саундтрек ", " саундтреки ", " поп музыка ",
	} {
		if strings.Contains(" "+title+" ", marker) && !strings.Contains(" "+matchedTitle+" ", marker) {
			score -= 1.45
			break
		}
	}
	return score
}

func tokenizeForMatch(value string) map[string]struct{} {
	tokens := strings.Fields(normalizeForMatch(value))
	out := make(map[string]struct{}, len(tokens))
	for _, token := range tokens {
		token = strings.TrimSpace(token)
		if token == "" || isSearchStopWord(token) {
			continue
		}
		runes := []rune(token)
		if len(runes) == 1 && !unicode.IsDigit(runes[0]) {
			continue
		}
		out[token] = struct{}{}
	}
	return out
}

func normalizeForMatch(value string) string {
	value = cPlusPlusPattern.ReplaceAllString(value, "${1}plusplus")
	return strings.ToLower(normalizeSeparators(value))
}

func isSearchStopWord(token string) bool {
	switch token {
	case "the", "a", "an", "of", "and", "or", "in", "on", "to", "for", "with",
		"и", "в", "во", "на", "с", "со", "из", "за", "по", "к", "ко", "о", "об", "от":
		return true
	default:
		return false
	}
}

func torrentDedupeKey(detail *models.TorrentDetails) string {
	title := detail.Title
	if title == "" {
		title = detail.Name
	}
	titleKey := normalizeForMatch(title)
	if titleKey != "" {
		return titleKey + "|" + strings.TrimSpace(detail.Size)
	}
	for _, value := range []string{detail.Hash, detail.Magnet, detail.Link} {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}

func yearAdjustment(title string, targetYears map[int]struct{}) float64 {
	if len(targetYears) == 0 {
		return 0
	}
	years := extractYears(title)
	if len(years) == 0 {
		return 0
	}
	for _, year := range years {
		if _, ok := targetYears[year]; ok {
			return 0.45
		}
	}
	return -1.1
}

func extractYears(value string) []int {
	matches := releaseYearPattern.FindAllString(value, -1)
	if len(matches) == 0 {
		return nil
	}
	years := make([]int, 0, len(matches))
	seen := make(map[int]struct{}, len(matches))
	for _, match := range matches {
		year, err := strconv.Atoi(match)
		if err != nil {
			continue
		}
		if _, ok := seen[year]; ok {
			continue
		}
		seen[year] = struct{}{}
		years = append(years, year)
	}
	return years
}

func yearsToSet(years []int) map[int]struct{} {
	out := make(map[int]struct{}, len(years))
	for _, year := range years {
		out[year] = struct{}{}
	}
	return out
}

func appendUniqueCandidate(items []searchCandidate, item searchCandidate) []searchCandidate {
	value := strings.ToLower(strings.TrimSpace(item.Query))
	if value == "" {
		return items
	}
	for _, existing := range items {
		if strings.EqualFold(existing.Query, item.Query) {
			return items
		}
	}
	return append(items, item)
}

func appendUniqueString(items []string, value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return items
	}
	for _, existing := range items {
		if strings.EqualFold(existing, value) {
			return items
		}
	}
	return append(items, value)
}

func appendUniqueInt(items []int, value int) []int {
	if value == 0 {
		return items
	}
	for _, existing := range items {
		if existing == value {
			return items
		}
	}
	return append(items, value)
}

func releaseYearFromDate(value string) int {
	if len(value) < 4 {
		return 0
	}
	year, err := strconv.Atoi(value[:4])
	if err != nil || year < 1900 || year > 2100 {
		return 0
	}
	return year
}

type tmdbAliasInfo struct {
	Aliases []string
	Years   []int
}

func fetchTMDBAliasInfo(ctx context.Context, query string) tmdbAliasInfo {
	if settings.BTsets == nil || settings.BTsets.TMDBSettings.APIKey == "" {
		return tmdbAliasInfo{}
	}

	query = strings.TrimSpace(query)
	type tmdbAliasResult struct {
		ID            int
		Title         string
		Name          string
		OriginalTitle string
		OriginalName  string
		MediaType     string
		ReleaseDate   string
		FirstAirDate  string
		Popularity    float64
		Score         float64
	}
	var collected []tmdbAliasResult
	for _, language := range []string{"ru-RU", "en-US"} {
		if ctx.Err() != nil {
			break
		}
		payload, err := searchTMDBAliases(ctx, query, language)
		if err != nil {
			if !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
				log.TLogln("Error searching TMDB aliases")
			}
			continue
		}
		for _, result := range payload.Results {
			if result.MediaType != "" && result.MediaType != "movie" && result.MediaType != "tv" {
				continue
			}
			collected = append(collected, tmdbAliasResult{
				ID:            result.ID,
				Title:         result.Title,
				Name:          result.Name,
				OriginalTitle: result.OriginalTitle,
				OriginalName:  result.OriginalName,
				MediaType:     result.MediaType,
				ReleaseDate:   result.ReleaseDate,
				FirstAirDate:  result.FirstAirDate,
				Popularity:    result.Popularity,
				Score:         scoreTMDBAliasCandidate(query, result.Title, result.Name, result.OriginalTitle, result.OriginalName, result.Popularity),
			})
		}
	}
	if len(collected) == 0 {
		return tmdbAliasInfo{}
	}

	sort.SliceStable(collected, func(i, j int) bool {
		if collected[i].Score != collected[j].Score {
			return collected[i].Score > collected[j].Score
		}
		return collected[i].Popularity > collected[j].Popularity
	})

	best := collected[0]
	var info tmdbAliasInfo
	seenKeys := make(map[string]struct{})
	for _, result := range collected {
		sameCanonical := result.ID != 0 && best.ID != 0 && result.ID == best.ID && result.MediaType == best.MediaType
		sameTitle := result.ID == 0 && result.Score == best.Score
		if !sameCanonical && !sameTitle {
			continue
		}
		key := fmt.Sprintf("%s:%d:%s:%s:%s:%s", result.MediaType, result.ID, result.Title, result.Name, result.OriginalTitle, result.OriginalName)
		if _, ok := seenKeys[key]; ok {
			continue
		}
		seenKeys[key] = struct{}{}
		info.Years = appendUniqueInt(info.Years, releaseYearFromDate(result.ReleaseDate))
		info.Years = appendUniqueInt(info.Years, releaseYearFromDate(result.FirstAirDate))
		for _, title := range []string{result.Title, result.Name, result.OriginalTitle, result.OriginalName} {
			info.Aliases = appendUniqueString(info.Aliases, title)
		}
		if len(info.Aliases) >= 8 {
			break
		}
	}
	return info
}

func scoreTMDBAliasCandidate(query string, titles ...interface{}) float64 {
	queryNormalized := normalizeForMatch(stripYears(query))
	queryTokens := tokenizeForMatch(queryNormalized)
	score := 0.0
	var popularity float64
	if len(titles) > 0 {
		if value, ok := titles[len(titles)-1].(float64); ok {
			popularity = value
			titles = titles[:len(titles)-1]
		}
	}
	for _, raw := range titles {
		title, ok := raw.(string)
		if !ok {
			continue
		}
		titleNormalized := normalizeForMatch(stripYears(title))
		if titleNormalized == "" {
			continue
		}
		current := 0.0
		switch {
		case titleNormalized == queryNormalized:
			current = 100
		case strings.Contains(titleNormalized, queryNormalized) || strings.Contains(queryNormalized, titleNormalized):
			current = 50
		default:
			titleTokens := tokenizeForMatch(titleNormalized)
			if len(queryTokens) > 0 && len(titleTokens) > 0 {
				matched := 0
				for token := range queryTokens {
					if _, ok := titleTokens[token]; ok {
						matched++
					}
				}
				current = float64(matched) / float64(len(queryTokens)) * 10
			}
		}
		if current > score {
			score = current
		}
	}
	return score + popularity/1000
}

func stripYears(value string) string {
	return strings.TrimSpace(releaseYearPattern.ReplaceAllString(value, " "))
}

func searchTMDBAliases(ctx context.Context, query, language string) (*tmdbSearchResponse, error) {
	apiURL := normalizeTMDBHost(settings.BTsets.TMDBSettings.APIURL, "https://api.themoviedb.org")
	apiURL = strings.TrimSuffix(strings.Split(apiURL, "/3")[0], "/") + "/3/search/multi"
	parsedURL, err := url.Parse(apiURL)
	if err != nil {
		return nil, err
	}
	q := parsedURL.Query()
	q.Set("api_key", settings.BTsets.TMDBSettings.APIKey)
	q.Set("language", language)
	q.Set("include_adult", "false")
	q.Set("query", query)
	parsedURL.RawQuery = q.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json")

	response, err := tmdbAliasHTTPClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("tmdb returned status %s", response.Status)
	}

	var payload tmdbSearchResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}
	return &payload, nil
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

func Test(host, key string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return TestContext(ctx, host, key)
}

func TestContext(ctx context.Context, host, key string) error {
	u, err := buildTorznabAPIURL(host)
	if err != nil {
		return &torznabRequestError{kind: "endpoint", cause: err}
	}

	q := u.Query()
	q.Set("apikey", key)
	q.Set("t", "caps")
	u.RawQuery = q.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return &torznabRequestError{kind: "endpoint", cause: err}
	}
	request.Header.Set("Accept", "application/xml")
	resp, err := torznabHTTPClient.Do(request)
	if err != nil {
		kind := "transport"
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			kind = "timeout"
		}
		return &torznabRequestError{kind: kind, cause: err}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return &torznabRequestError{kind: "http", statusCode: resp.StatusCode}
	}

	var probe struct {
		XMLName     xml.Name
		Code        string `xml:"code,attr"`
		Description string `xml:"description,attr"`
	}

	if err := xml.NewDecoder(io.LimitReader(resp.Body, maxTorznabResponseSize)).Decode(&probe); err != nil {
		return fmt.Errorf("invalid xml response: %v", err)
	}

	if probe.XMLName.Local == "error" {
		msg := probe.Description
		if msg == "" {
			msg = probe.Code
		}
		return fmt.Errorf("api error: %s", msg)
	}

	if probe.XMLName.Local != "caps" {
		return fmt.Errorf("unexpected xml root: %s", probe.XMLName.Local)
	}

	return nil
}

func parseDate(dateStr string) time.Time {
	// RFC1123 is common in RSS
	t, err := time.Parse(time.RFC1123, dateStr)
	if err != nil {
		// Try RFC1123Z
		t, err = time.Parse(time.RFC1123Z, dateStr)
		if err != nil {
			return time.Now()
		}
	}
	return t
}

func formatSize(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cCiB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

func extractHash(magnet string) string {
	if strings.HasPrefix(magnet, "magnet:?") {
		u, err := url.Parse(magnet)
		if err == nil {
			xt := u.Query().Get("xt")
			if strings.HasPrefix(xt, "urn:btih:") {
				return strings.TrimPrefix(xt, "urn:btih:")
			}
		}
	}
	return ""
}

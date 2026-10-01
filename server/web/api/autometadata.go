package api

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"server/log"
	"server/torr"
	"server/torr/state"
	"server/torr/utils"
)

type torrentAutoMetadata struct {
	Title      string                `json:"title,omitempty"`
	Category   string                `json:"category,omitempty"`
	Season     int                   `json:"season,omitempty"`
	Episodes   []int                 `json:"episodes,omitempty"`
	Resolution string                `json:"resolution,omitempty"`
	Files      []torrentFileAutoMeta `json:"files,omitempty"`
	TMDB       *torrentTMDBAutoMeta  `json:"tmdb,omitempty"`
}

type torrentFileAutoMeta struct {
	ID         int    `json:"id,omitempty"`
	Season     int    `json:"season,omitempty"`
	Episode    int    `json:"episode,omitempty"`
	Resolution string `json:"resolution,omitempty"`
}

type torrentTMDBAutoMeta struct {
	Title     string `json:"title,omitempty"`
	MediaType string `json:"media_type,omitempty"`
	Poster    string `json:"poster,omitempty"`
	GenreIDs  []int  `json:"genre_ids,omitempty"`
}

type torrentAutoData struct {
	TorrServer struct {
		Files    []*state.TorrentFileStat `json:"Files"`
		Metadata *torrentAutoMetadata     `json:"Metadata,omitempty"`
	} `json:"TorrServer"`
}

var (
	videoExts = map[string]struct{}{
		"3g2": {}, "3gp": {}, "asf": {}, "avi": {}, "flv": {}, "iso": {}, "m2ts": {}, "m4v": {},
		"mkv": {}, "mov": {}, "mp4": {}, "mpeg": {}, "mpg": {}, "mts": {}, "rmvb": {}, "ts": {},
		"vob": {}, "webm": {}, "wmv": {},
	}
	audioExts = map[string]struct{}{
		"aac": {}, "aiff": {}, "ape": {}, "flac": {}, "m4a": {}, "mp3": {}, "ogg": {}, "opus": {},
		"wav": {}, "wma": {},
	}

	seasonEpisodePatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\bs(?P<season>\d{1,2})\s*e(?P<episode>\d{1,3})\b`),
		regexp.MustCompile(`(?i)\b(?P<season>\d{1,2})x(?P<episode>\d{1,3})\b`),
		regexp.MustCompile(`(?i)\bseason[\s._-]*(?P<season>\d{1,2}).*?\bepisode[\s._-]*(?P<episode>\d{1,3})\b`),
		regexp.MustCompile(`(?i)с[еe]зон[\s._:-]*(?P<season>\d{1,2}).*?с[еe]р(?:ия|ии)?[\s._:-]*(?P<episode>\d{1,3})`),
		regexp.MustCompile(`(?i)\b(?P<episode>\d{1,3})[\s._:-]*с[еe]р(?:ия|ии)?`),
	}
	seasonOnlyPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\bs(?P<season>\d{1,2})\b`),
		regexp.MustCompile(`(?i)\bseason[\s._-]*(?P<season>\d{1,2})\b`),
		regexp.MustCompile(`(?i)с[еe]зон[\s._:-]*(?P<season>\d{1,2})`),
	}
	episodeRangePattern       = regexp.MustCompile(`(?i)[\[\(]?\s*\d{1,3}\s+(?:из|of)\s+\d{1,3}`)
	resolutionPattern         = regexp.MustCompile(`(?i)\b(2160p|1080p|720p|480p|4k)\b`)
	noisePattern              = regexp.MustCompile(`(?i)\b(2160p|1080p|720p|480p|4k|uhd|hdr|dv|dolby[.\s-]*vision|web[.\s-]*dl|webrip|bdrip|bluray|remux|hdtv|x264|x265|h\.?264|h\.?265|hevc|avc|aac|ac3|eac3|ddp\d?\.?\d?|dts|truehd|atmos|proper|repack|lostfilm|newstudio|kubik|jaskier|alexfilm|coldfilm|nf|amzn|apple|atvp|hmax|noobdl)\b`)
	bracketPattern            = regexp.MustCompile(`[\[\{].*?[\]\}]`)
	parenPattern              = regexp.MustCompile(`\([^)]*\)`)
	openParenTailPattern      = regexp.MustCompile(`\([^)]*$`)
	closeParenHeadPattern     = regexp.MustCompile(`^[^(]*\)`)
	yearPattern               = regexp.MustCompile(`\b(19|20)\d{2}\b`)
	displayYearPattern        = regexp.MustCompile(`\b(19|20)\d{2}\b`)
	displayYearFollower       = regexp.MustCompile(`(?i)^(2160p|1080p|720p|480p|4k|uhd|hdr|web|webrip|bdrip|bluray|remux|hdtv|x264|x265|h\.?264|h\.?265|hevc|avc)\b`)
	releaseTailPattern        = regexp.MustCompile(`(?i)(\b(S\d{1,2}(E\d{1,3})?|season\s*\d{1,2}|complete|sub|dub|rus|eng)\b|с[еe]зон\s*:?\s*\d{1,2}|с[еe]р(?:ия|ии)?).*$`)
	displayReleaseTailPattern = regexp.MustCompile(`(?i)(\b(S\d{1,2}(E\d{1,3})?|season\s*\d{1,2}|complete|sub|dub|rus|eng)\b|с[еe]зон\s*:?\s*\d{1,2}|с[еe]р(?:ия|ии)?).*$`)
	releaseGroupTailPattern   = regexp.MustCompile(`\s+[A-Z0-9]{3,}$`)
	displaySeparatorPattern   = regexp.MustCompile(`\s+[-–—]+\s+`)
	titleSegmentPattern       = regexp.MustCompile(`\s+[/|]\s+`)
	audioTrackSegmentPattern  = regexp.MustCompile(`(?i)\b(\d+x|mvo|avo|vo|dub|sub|rus|ukr|eng|original|лицензия|профессиональный|многоголосый|одноголосый)\b`)
	spacingPattern            = regexp.MustCompile(`\s+`)
)

func autoProcessTorrentMetadata(tor *torr.Torrent, explicitTitle, explicitPoster, explicitCategory string) {
	if tor == nil {
		return
	}

	status := tor.Status()
	fileStats := status.FileStats
	if len(fileStats) == 0 {
		fileStats = extractTorrentAutoFiles(tor.Data)
	}
	torrentName := status.Name
	if torrentName == "" && tor.TorrentSpec != nil {
		torrentName = tor.TorrentSpec.DisplayName
	}
	metadata := buildAutoMetadata(torrentName, tor.Title, fileStats)

	if strings.TrimSpace(tor.Category) == "" && explicitCategory == "" && metadata.Category != "" {
		tor.Category = metadata.Category
	}

	searchTitles := buildTMDBTitleVariants(tor.Title, explicitTitle, torrentName, metadata.Title, fileStats)
	var tmdbMeta *tmdbAutoMetadataResult
	shouldSearchTMDB := metadata.Category == "movie" || metadata.Category == "tv" || strings.TrimSpace(tor.Poster) == ""
	if shouldSearchTMDB {
		if foundTMDBMeta, err := searchBestTMDBMetadata(searchTitles, []string{"ru", "en"}); err == nil && foundTMDBMeta != nil {
			foundCategory := tmdbMediaTypeToCategory(foundTMDBMeta.MediaType)
			if !(metadata.Category == "tv" && metadata.Season > 0 && foundCategory == "movie") {
				tmdbMeta = foundTMDBMeta
				if strings.TrimSpace(tor.Poster) == "" && explicitPoster == "" && tmdbMeta.Poster != "" {
					tor.Poster = tmdbMeta.Poster
				}
				if explicitCategory == "" {
					if category := tmdbMediaTypeToCategory(tmdbMeta.MediaType); category != "" {
						tor.Category = category
						metadata.Category = category
					}
				}
				metadata.TMDB = &torrentTMDBAutoMeta{
					Title:     tmdbMeta.Title,
					MediaType: tmdbMeta.MediaType,
					Poster:    tmdbMeta.Poster,
					GenreIDs:  append([]int(nil), tmdbMeta.GenreIDs...),
				}
			}
		}
	}

	if explicitCategory == "" && metadata.Category == "tv" && metadata.Season > 0 && tor.Category != "tv" {
		tor.Category = "tv"
	}
	if tor.Category != "" {
		metadata.Category = tor.Category
	}
	if title := buildTorrentDisplayTitle(metadata, tmdbMeta, tor.Title, explicitTitle, torrentName); title != "" {
		tor.Title = title
	}
	if tor.Title != "" {
		metadata.Title = tor.Title
	}
	if len(fileStats) > 0 {
		tor.Data = buildTorrentAutoData(fileStats, metadata)
	}

	log.TLogln("auto metadata:", tor.Hash(), "title:", tor.Title, "category:", tor.Category, "poster:", tor.Poster != "")
}

func buildAutoMetadata(torrentName, currentTitle string, files []*state.TorrentFileStat) *torrentAutoMetadata {
	playable := getPlayableFiles(files)
	titleSource := chooseAutoMetadataTitleSource(currentTitle, torrentName, playable)

	metadata := &torrentAutoMetadata{
		Title:    cleanMediaTitle(titleSource),
		Category: detectCategory(playable),
	}

	episodeSet := make(map[int]struct{})
	seasonSet := make(map[int]int)
	resolutionSet := make(map[string]int)
	for _, file := range playable {
		fileMeta := parseFileAutoMeta(file)
		metadata.Files = append(metadata.Files, fileMeta)
		if fileMeta.Season > 0 {
			seasonSet[fileMeta.Season]++
		}
		if fileMeta.Episode > 0 {
			episodeSet[fileMeta.Episode] = struct{}{}
		}
		if fileMeta.Resolution != "" {
			resolutionSet[fileMeta.Resolution]++
		}
	}

	metadata.Season = mostCommonInt(seasonSet)
	if metadata.Season == 0 {
		metadata.Season = parseSeasonOnly(titleSource)
	}
	if metadata.Category == "movie" && metadata.Season > 0 {
		metadata.Category = "tv"
	}
	metadata.Resolution = mostCommonString(resolutionSet)
	metadata.Episodes = sortedIntKeys(episodeSet)

	if metadata.Category == "tv" {
		if title := cleanSeriesTitle(titleSource); title != "" {
			metadata.Title = title
		}
	} else if metadata.Title == "" && len(playable) > 0 {
		metadata.Title = cleanMediaTitle(playable[0].Path)
	}

	return metadata
}

func chooseAutoMetadataTitleSource(currentTitle, torrentName string, playable []*state.TorrentFileStat) string {
	candidates := []string{currentTitle, torrentName}
	if len(playable) > 0 {
		candidates = append(candidates, playable[0].Path)
	}
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" || looksLikeReleaseInfoSegment(candidate) {
			continue
		}
		return candidate
	}
	if len(playable) > 0 {
		return playable[0].Path
	}
	return strings.TrimSpace(currentTitle)
}

func parseFileAutoMeta(file *state.TorrentFileStat) torrentFileAutoMeta {
	meta := torrentFileAutoMeta{ID: file.Id}
	path := file.Path
	for _, pattern := range seasonEpisodePatterns {
		matches := pattern.FindStringSubmatch(path)
		if len(matches) == 0 {
			continue
		}
		for i, name := range pattern.SubexpNames() {
			if i == 0 || name == "" || matches[i] == "" {
				continue
			}
			value, _ := strconv.Atoi(matches[i])
			switch name {
			case "season":
				meta.Season = value
			case "episode":
				meta.Episode = value
			}
		}
		if meta.Season == 0 && meta.Episode > 0 {
			meta.Season = 1
		}
		break
	}
	if meta.Season == 0 {
		meta.Season = parseSeasonOnly(path)
	}
	if match := resolutionPattern.FindString(path); match != "" {
		meta.Resolution = strings.ToLower(match)
	}
	return meta
}

func detectCategory(playable []*state.TorrentFileStat) string {
	if len(playable) == 0 {
		return "other"
	}
	videoCount := 0
	significantVideoCount := 0
	audioCount := 0
	episodeSignals := 0
	var maxVideoLength int64
	for _, file := range playable {
		if getMediaKind(file.Path) == "video" && file.Length > maxVideoLength {
			maxVideoLength = file.Length
		}
	}
	for _, file := range playable {
		switch getMediaKind(file.Path) {
		case "video":
			videoCount++
			if maxVideoLength == 0 || file.Length >= maxVideoLength/3 || file.Length >= 200*1024*1024 {
				significantVideoCount++
			}
			meta := parseFileAutoMeta(file)
			if meta.Episode > 0 || meta.Season > 0 {
				episodeSignals++
			}
		case "audio":
			audioCount++
		}
	}
	if videoCount > 0 {
		if significantVideoCount > 1 || episodeSignals > 0 {
			return "tv"
		}
		return "movie"
	}
	if audioCount > 0 {
		return "music"
	}
	return "other"
}

func getPlayableFiles(files []*state.TorrentFileStat) []*state.TorrentFileStat {
	var playable []*state.TorrentFileStat
	for _, file := range files {
		if getMediaKind(file.Path) != "" {
			playable = append(playable, file)
		}
	}
	sort.Slice(playable, func(i, j int) bool {
		return playable[i].Length > playable[j].Length
	})
	return playable
}

func getMediaKind(path string) string {
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(path)), ".")
	if _, ok := videoExts[ext]; ok {
		return "video"
	}
	if _, ok := audioExts[ext]; ok {
		return "audio"
	}
	return ""
}

func cleanSeriesTitle(value string) string {
	value = releaseTailPattern.ReplaceAllString(value, " ")
	return cleanMediaTitle(value)
}

func cleanMediaTitle(value string) string {
	value = chooseMediaTitleSegment(value)
	value = filepath.Base(strings.ReplaceAll(value, "\\", "/"))
	if dot := strings.LastIndex(value, "."); dot > 0 {
		ext := strings.ToLower(value[dot+1:])
		if _, ok := videoExts[ext]; ok {
			value = value[:dot]
		} else if _, ok := audioExts[ext]; ok {
			value = value[:dot]
		}
	}
	value = bracketPattern.ReplaceAllString(value, " ")
	value = parenPattern.ReplaceAllString(value, " ")
	value = openParenTailPattern.ReplaceAllString(value, " ")
	value = closeParenHeadPattern.ReplaceAllString(value, " ")
	value = strings.ReplaceAll(value, "_", " ")
	value = strings.ReplaceAll(value, ".", " ")
	value = displaySeparatorPattern.ReplaceAllString(value, " ")
	value = noisePattern.ReplaceAllString(value, " ")
	value = releaseGroupTailPattern.ReplaceAllString(value, " ")
	value = releaseTailPattern.ReplaceAllString(value, " ")
	value = spacingPattern.ReplaceAllString(value, " ")
	return strings.Trim(value, " .-_")
}

func extractTorrentAutoFiles(data string) []*state.TorrentFileStat {
	data = strings.TrimSpace(data)
	if data == "" {
		return nil
	}

	var parsed torrentAutoData
	if err := json.Unmarshal([]byte(data), &parsed); err != nil {
		return nil
	}
	return parsed.TorrServer.Files
}

func buildTorrentDisplayTitle(metadata *torrentAutoMetadata, tmdbMeta *tmdbAutoMetadataResult, fallbackTitles ...string) string {
	metadataTitle := ""
	if metadata != nil {
		metadataTitle = metadata.Title
	}

	title := preferredTMDBTitle(tmdbMeta, metadataTitle)
	if title == "" && metadata != nil {
		title = metadata.Title
	}
	if title == "" {
		title = fallbackTMDBTitle(tmdbMeta)
	}
	if title == "" {
		for _, fallback := range fallbackTitles {
			if title = cleanDisplayTitle(fallback); title != "" {
				break
			}
		}
	} else {
		title = cleanDisplayTitle(title)
	}
	if title == "" {
		return ""
	}

	if metadata == nil || metadata.Category != "tv" || metadata.Season <= 0 {
		return title
	}

	title = cleanSeriesDisplayTitle(title)
	if title == "" {
		return ""
	}
	return fmt.Sprintf("%s / S%02d", title, metadata.Season)
}

func preferredTMDBTitle(tmdbMeta *tmdbAutoMetadataResult, metadataTitle string) string {
	if tmdbMeta == nil {
		return ""
	}
	if tmdbMeta.EnglishTitle != "" {
		return tmdbMeta.EnglishTitle
	}
	originalTitle := preferredTMDBOriginalTitle(tmdbMeta)
	if originalTitle != "" && metadataTitle != "" && tmdbTitleMatchesQuery(cleanDisplayTitle(metadataTitle), originalTitle) {
		return originalTitle
	}
	return ""
}

func fallbackTMDBTitle(tmdbMeta *tmdbAutoMetadataResult) string {
	if tmdbMeta == nil {
		return ""
	}
	if originalTitle := preferredTMDBOriginalTitle(tmdbMeta); originalTitle != "" {
		return originalTitle
	}
	return tmdbMeta.Title
}

func preferredTMDBOriginalTitle(tmdbMeta *tmdbAutoMetadataResult) string {
	if tmdbMeta == nil {
		return ""
	}
	switch tmdbMeta.MediaType {
	case "movie":
		if tmdbMeta.OriginalTitle != "" {
			return tmdbMeta.OriginalTitle
		}
	case "tv":
		if tmdbMeta.OriginalName != "" {
			return tmdbMeta.OriginalName
		}
	}
	if tmdbMeta.OriginalTitle != "" {
		return tmdbMeta.OriginalTitle
	}
	if tmdbMeta.OriginalName != "" {
		return tmdbMeta.OriginalName
	}
	return ""
}

func cleanSeriesDisplayTitle(value string) string {
	value = displayReleaseTailPattern.ReplaceAllString(value, " ")
	return cleanDisplayTitle(value)
}

func cleanDisplayTitle(value string) string {
	value = chooseMediaTitleSegment(value)
	value = filepath.Base(strings.ReplaceAll(value, "\\", "/"))
	if dot := strings.LastIndex(value, "."); dot > 0 {
		ext := strings.ToLower(value[dot+1:])
		if _, ok := videoExts[ext]; ok {
			value = value[:dot]
		} else if _, ok := audioExts[ext]; ok {
			value = value[:dot]
		}
	}
	value = bracketPattern.ReplaceAllString(value, " ")
	value = openParenTailPattern.ReplaceAllString(value, " ")
	value = closeParenHeadPattern.ReplaceAllString(value, " ")
	value = strings.ReplaceAll(value, "_", " ")
	value = strings.ReplaceAll(value, ".", " ")
	value = displaySeparatorPattern.ReplaceAllString(value, " ")
	value = removeDisplayReleaseYears(value)
	value = noisePattern.ReplaceAllString(value, " ")
	value = releaseGroupTailPattern.ReplaceAllString(value, " ")
	value = displayReleaseTailPattern.ReplaceAllString(value, " ")
	value = spacingPattern.ReplaceAllString(value, " ")
	return strings.Trim(value, " .-_")
}

func chooseMediaTitleSegment(value string) string {
	segments := titleSegmentPattern.Split(value, -1)
	if len(segments) <= 1 {
		return value
	}

	bestSegment := strings.TrimSpace(segments[0])
	bestScore := mediaTitleSegmentScore(bestSegment)
	for _, segment := range segments[1:] {
		segment = strings.TrimSpace(segment)
		score := mediaTitleSegmentScore(segment)
		if score > bestScore {
			bestScore = score
			bestSegment = segment
		}
	}
	return bestSegment
}

func mediaTitleSegmentScore(value string) int {
	value = strings.TrimSpace(value)
	if value == "" {
		return -100
	}
	if looksLikeReleaseInfoSegment(value) {
		return -90
	}
	value = bracketPattern.ReplaceAllString(value, " ")
	value = parenPattern.ReplaceAllString(value, " ")
	value = openParenTailPattern.ReplaceAllString(value, " ")
	value = closeParenHeadPattern.ReplaceAllString(value, " ")
	value = noisePattern.ReplaceAllString(value, " ")
	value = spacingPattern.ReplaceAllString(value, " ")
	value = strings.TrimSpace(value)
	if value == "" {
		return -100
	}

	score := 0
	for _, r := range value {
		switch {
		case r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z':
			score += 3
		case r >= 'А' && r <= 'я' || r == 'Ё' || r == 'ё':
			score--
		case r >= '0' && r <= '9':
			score++
		}
	}
	if releaseTailPattern.MatchString(value) || strings.Contains(strings.ToLower(value), "серии") {
		score -= 50
	}
	if audioTrackSegmentPattern.MatchString(value) {
		score -= 35
	}
	if parenPattern.MatchString(value) {
		score--
	}
	return score
}

func looksLikeReleaseInfoSegment(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	cleaned := audioTrackSegmentPattern.ReplaceAllString(value, " ")
	cleaned = strings.NewReplacer(
		"+", " ",
		",", " ",
		".", " ",
		":", " ",
		";", " ",
		"(", " ",
		")", " ",
		"[", " ",
		"]", " ",
		"-", " ",
	).Replace(cleaned)
	cleaned = spacingPattern.ReplaceAllString(cleaned, " ")
	cleaned = strings.TrimSpace(cleaned)
	if cleaned == "" {
		return true
	}

	hasLetter := false
	for _, r := range cleaned {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= 'А' && r <= 'я') || r == 'Ё' || r == 'ё' {
			hasLetter = true
			break
		}
	}
	return !hasLetter && audioTrackSegmentPattern.MatchString(value)
}

func removeDisplayReleaseYears(value string) string {
	matches := displayYearPattern.FindAllStringIndex(value, -1)
	if len(matches) == 0 {
		return value
	}

	var builder strings.Builder
	last := 0
	for _, match := range matches {
		tail := strings.TrimSpace(value[match[1]:])
		if tail != "" && !displayYearFollower.MatchString(tail) {
			continue
		}
		builder.WriteString(value[last:match[0]])
		builder.WriteByte(' ')
		last = match[1]
	}
	if last == 0 {
		return value
	}
	builder.WriteString(value[last:])
	return builder.String()
}

func parseSeasonOnly(value string) int {
	for _, pattern := range seasonOnlyPatterns {
		matches := pattern.FindStringSubmatch(value)
		if len(matches) == 0 {
			continue
		}
		for i, name := range pattern.SubexpNames() {
			if i == 0 || name != "season" || matches[i] == "" {
				continue
			}
			season, _ := strconv.Atoi(matches[i])
			return season
		}
	}
	if episodeRangePattern.MatchString(value) {
		return 1
	}
	return 0
}

func buildTMDBTitleVariants(values ...interface{}) []string {
	seen := make(map[string]struct{})
	var variants []string
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		for _, candidate := range []string{
			value,
			cleanSeriesTitle(value),
			cleanMediaTitle(value),
			strings.TrimSpace(yearPattern.ReplaceAllString(cleanMediaTitle(value), " ")),
		} {
			candidate = spacingPattern.ReplaceAllString(candidate, " ")
			candidate = strings.Trim(candidate, " .-_")
			if candidate == "" {
				continue
			}
			key := strings.ToLower(candidate)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			variants = append(variants, candidate)
		}
	}
	for _, value := range values {
		switch typed := value.(type) {
		case string:
			add(typed)
		case []*state.TorrentFileStat:
			for _, file := range getPlayableFiles(typed) {
				add(file.Path)
			}
		}
	}
	if len(variants) > 8 {
		return variants[:8]
	}
	return variants
}

func buildTorrentAutoData(files []*state.TorrentFileStat, metadata *torrentAutoMetadata) string {
	data := new(torrentAutoData)
	data.TorrServer.Files = files
	if metadata != nil {
		data.TorrServer.Metadata = metadata
	}
	buf, err := json.Marshal(data)
	if err != nil {
		return ""
	}
	return string(buf)
}

func tmdbMediaTypeToCategory(mediaType string) string {
	switch mediaType {
	case "movie":
		return "movie"
	case "tv":
		return "tv"
	default:
		return ""
	}
}

func mostCommonInt(values map[int]int) int {
	bestValue := 0
	bestCount := 0
	for value, count := range values {
		if count > bestCount || (count == bestCount && value < bestValue) {
			bestValue = value
			bestCount = count
		}
	}
	return bestValue
}

func mostCommonString(values map[string]int) string {
	bestValue := ""
	bestCount := 0
	for value, count := range values {
		if count > bestCount {
			bestValue = value
			bestCount = count
		}
	}
	return bestValue
}

func sortedIntKeys(values map[int]struct{}) []int {
	keys := make([]int, 0, len(values))
	for value := range values {
		keys = append(keys, value)
	}
	sort.Ints(keys)
	return keys
}

func validPosterURL(value string) bool {
	if utils.LooksLikeImgUrl(value) {
		return true
	}
	ok, _ := utils.CheckImgUrl(value)
	return ok
}

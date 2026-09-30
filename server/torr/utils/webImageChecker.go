package utils

import (
	"context"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/image/webp"

	"server/log"
)

func LooksLikeImgUrl(link string) bool {
	parsedURL, err := url.Parse(link)
	if err != nil {
		return false
	}

	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return false
	}

	path := strings.ToLower(parsedURL.Path)
	for _, extension := range []string{".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"} {
		if strings.HasSuffix(path, extension) {
			return true
		}
	}

	return false
}

func CheckImgUrl(link string) bool {
	if link == "" {
		return false
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", link, nil)
	if err != nil {
		log.TLogln("Error create request for image:", err)
		return false
	}

	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		log.TLogln("Error check image:", err)
		return false
	}
	defer resp.Body.Close()

	limitedReader := io.LimitReader(resp.Body, 2*1024*1024)

	if strings.HasSuffix(link, ".webp") {
		_, err = webp.Decode(limitedReader)
	} else {
		_, _, err = image.Decode(limitedReader)
	}
	if err != nil {
		log.TLogln("Error decode image:", err)
		return false
	}
	return true
}

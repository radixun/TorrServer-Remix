package api

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"server/rutor/models"
	sets "server/settings"
	"server/torznab"
)

// torznabSearch godoc
//
//	@Summary		Makes a torznab search
//	@Description	Makes a torznab search.
//
//	@Tags			API
//
//	@Param			query	query	string	true	"Torznab query"
//
//	@Produce		json
//	@Success		200	{array}	models.TorrentDetails	"Torznab torrent search result(s)"
//	@Router			/torznab/search [get]
func torznabSearch(c *gin.Context) {
	if sets.BTsets == nil || !sets.BTsets.EnableTorznabSearch {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Torznab search is disabled"})
		return
	}
	query := torznabSearchQuery(c)
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "search query is required"})
		return
	}

	indexStr := c.DefaultQuery("index", "-1")
	index, err := strconv.Atoi(indexStr)
	if err != nil || index < -1 || index >= len(sets.BTsets.TorznabUrls) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid Torznab index"})
		return
	}

	list, err := torznab.SearchContext(c.Request.Context(), query, index)
	if err != nil {
		if errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
			return
		}
		c.JSON(torznabErrorStatus(err), gin.H{"error": err.Error()})
		return
	}
	if list == nil {
		list = []*models.TorrentDetails{}
	}
	c.JSON(http.StatusOK, list)
}

func torznabSearchQuery(c *gin.Context) string {
	query := strings.TrimSpace(c.Query("query"))
	if query == "" {
		query = strings.TrimSpace(strings.TrimPrefix(c.Param("query"), "/"))
	}
	return query
}

func torznabErrorStatus(err error) int {
	var searchErr *torznab.SearchError
	if errors.As(err, &searchErr) && searchErr.Timeout() {
		return http.StatusGatewayTimeout
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return http.StatusGatewayTimeout
	}
	return http.StatusBadGateway
}

type torznabTestReq struct {
	Host string `json:"host"`
	Key  string `json:"key"`
}

func torznabTest(c *gin.Context) {
	var req torznabTestReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithError(http.StatusBadRequest, err)
		return
	}

	if err := torznab.TestContext(c.Request.Context(), req.Host, req.Key); err != nil {
		c.JSON(200, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

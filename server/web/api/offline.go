package api

import (
	"errors"
	"mime"
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"server/mimetype"
	"server/offline"

	"github.com/gin-gonic/gin"
)

type offlineRequest struct {
	requestI
	Hash   string `json:"hash"`
	Title  string `json:"title,omitempty"`
	FileID int    `json:"file_id,omitempty"`
}

var offlineManager = offline.Default

func offlineStatus(c *gin.Context) {
	c.JSON(http.StatusOK, offlineManager().Status(c.Param("hash")))
}

func offlineAction(c *gin.Context) {
	var req offlineRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithError(http.StatusBadRequest, err)
		return
	}

	var (
		status *offline.Status
		err    error
	)
	switch req.Action {
	case "start":
		status, err = offlineManager().Start(req.Hash, req.Title)
	case "start_file":
		status, err = offlineManager().StartFile(req.Hash, req.Title, req.FileID)
	case "cancel":
		status, err = offlineManager().Cancel(req.Hash)
	case "cancel_file":
		status, err = offlineManager().CancelFile(req.Hash, req.FileID)
	case "delete":
		status, err = offlineManager().Delete(req.Hash)
	case "delete_file":
		status, err = offlineManager().DeleteFile(req.Hash, req.FileID)
	default:
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "unknown offline action"})
		return
	}
	if err != nil {
		code := http.StatusBadRequest
		if errors.Is(err, offline.ErrStorageUnavailable) {
			code = http.StatusServiceUnavailable
		} else if errors.Is(err, offline.ErrJobActive) {
			code = http.StatusConflict
		}
		c.AbortWithStatusJSON(code, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, status)
}

func offlineStream(c *gin.Context) {
	fileID, err := strconv.Atoi(c.Param("id"))
	if err != nil || fileID <= 0 {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid file id"})
		return
	}
	file, status, err := offlineManager().Open(c.Param("hash"), fileID)
	if err != nil {
		code := http.StatusNotFound
		if errors.Is(err, offline.ErrStorageUnavailable) {
			code = http.StatusServiceUnavailable
		}
		c.AbortWithStatusJSON(code, gin.H{"error": err.Error()})
		return
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		c.AbortWithError(http.StatusInternalServerError, err)
		return
	}
	contentType, _ := mimetype.MimeTypeByPath(file.Name())
	if contentType.String() != "" {
		c.Header("Content-Type", contentType.String())
	}
	c.Header("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": filepath.Base(status.Path)}))
	c.Header("X-Content-Type-Options", "nosniff")
	http.ServeContent(c.Writer, c.Request, filepath.Base(status.Path), info.ModTime().Truncate(time.Second), file)
}

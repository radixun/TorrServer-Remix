package offline

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	StoragePathEnv  = "TORRSERVER_OFFLINE_STORAGE_PATH"
	MinFreeBytesEnv = "TORRSERVER_OFFLINE_MIN_FREE_BYTES"
	MarkerFile      = ".torrserver-storage"
	defaultMinFree  = int64(5 << 30)
)

type State string

const (
	StateUnavailable State = "unavailable"
	StateNotStored   State = "not_downloaded"
	StateQueued      State = "queued"
	StateDownloading State = "downloading"
	StatePartial     State = "partial"
	StateCompleted   State = "completed"
	StateCancelled   State = "cancelled"
	StateFailed      State = "failed"
	StateMissing     State = "missing"
)

var (
	ErrStorageUnavailable = errors.New("offline storage unavailable")
	ErrJobActive          = errors.New("offline download is active")
)

type FileStatus struct {
	ID              int    `json:"id"`
	Path            string `json:"path"`
	RelativePath    string `json:"relative_path"`
	Length          int64  `json:"length"`
	DownloadedBytes int64  `json:"downloaded_bytes"`
	Completed       bool   `json:"completed"`
	State           State  `json:"state"`
	Error           string `json:"error,omitempty"`
}

type Job struct {
	Hash            string       `json:"hash"`
	Title           string       `json:"title,omitempty"`
	State           State        `json:"state"`
	TotalBytes      int64        `json:"total_bytes"`
	DownloadedBytes int64        `json:"downloaded_bytes"`
	DownloadSpeed   float64      `json:"download_speed"`
	Progress        float64      `json:"progress"`
	CurrentFile     string       `json:"current_file,omitempty"`
	CurrentFileID   int          `json:"current_file_id,omitempty"`
	Error           string       `json:"error,omitempty"`
	Files           []FileStatus `json:"files,omitempty"`
	PendingFileIDs  []int        `json:"pending_file_ids,omitempty"`
	PendingAll      bool         `json:"pending_all,omitempty"`
	CreatedAt       time.Time    `json:"created_at,omitempty"`
	UpdatedAt       time.Time    `json:"updated_at,omitempty"`
}

type Status struct {
	Job
	Enabled      bool   `json:"enabled"`
	Available    bool   `json:"available"`
	StoragePath  string `json:"storage_path,omitempty"`
	FreeBytes    int64  `json:"free_bytes,omitempty"`
	MinFreeBytes int64  `json:"min_free_bytes,omitempty"`
}

type Manager struct {
	root       string
	minFree    int64
	provider   sourceProvider
	queue      chan string
	stop       chan struct{}
	mu         sync.RWMutex
	jobs       map[string]*Job
	cancels    map[string]context.CancelFunc
	workerOnce sync.Once
}

var (
	defaultManager *Manager
	defaultOnce    sync.Once
)

func Default() *Manager {
	defaultOnce.Do(func() {
		defaultManager = NewManager(os.Getenv(StoragePathEnv), minFreeFromEnv(), torrentProvider{})
	})
	return defaultManager
}

func NewManager(root string, minFree int64, provider sourceProvider) *Manager {
	m := &Manager{
		root:     filepath.Clean(strings.TrimSpace(root)),
		minFree:  minFree,
		provider: provider,
		queue:    make(chan string, 256),
		stop:     make(chan struct{}),
		jobs:     make(map[string]*Job),
		cancels:  make(map[string]context.CancelFunc),
	}
	if strings.TrimSpace(root) == "" || root == "." {
		m.root = ""
	}
	m.loadJobs()
	m.startWorker()
	return m
}

func (m *Manager) Close() {
	m.mu.Lock()
	for _, cancel := range m.cancels {
		cancel()
	}
	m.cancels = make(map[string]context.CancelFunc)
	m.mu.Unlock()
	select {
	case <-m.stop:
	default:
		close(m.stop)
	}
}

func (m *Manager) Start(hash, title string) (*Status, error) {
	return m.startSelection(hash, title, 0, true)
}

func (m *Manager) StartFile(hash, title string, fileID int) (*Status, error) {
	if fileID <= 0 {
		return nil, errors.New("invalid file id")
	}
	return m.startSelection(hash, title, fileID, false)
}

func (m *Manager) startSelection(hash, title string, fileID int, all bool) (*Status, error) {
	hash, err := normalizeHash(hash)
	if err != nil {
		return nil, err
	}
	if _, err := m.storageInfo(); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	m.mu.Lock()
	job := m.jobs[hash]
	if job == nil {
		job = &Job{Hash: hash, Title: title, State: StateNotStored, CreatedAt: now}
		m.jobs[hash] = job
	}
	if title != "" {
		job.Title = title
	}
	job.Error = ""
	if all {
		job.PendingAll = true
		for index := range job.Files {
			if !job.Files[index].Completed && job.Files[index].State != StateDownloading {
				job.Files[index].State = StateQueued
				job.Files[index].Error = ""
			}
		}
	} else if !queueKnownFile(job, fileID) {
		job.PendingFileIDs = appendUniqueID(job.PendingFileIDs, fileID)
	}
	recomputeJob(job)
	if len(job.Files) == 0 && (job.PendingAll || len(job.PendingFileIDs) > 0) {
		job.State = StateQueued
	}
	queued := hasQueuedWork(job)
	job.UpdatedAt = now
	m.mu.Unlock()
	if err := m.persist(hash); err != nil {
		m.setFailed(hash, err)
		return nil, err
	}
	if queued {
		m.enqueue(hash)
	}
	return m.Status(hash), nil
}

func (m *Manager) Cancel(hash string) (*Status, error) {
	hash, err := normalizeHash(hash)
	if err != nil {
		return nil, err
	}
	m.mu.Lock()
	job := m.jobs[hash]
	if job == nil {
		m.mu.Unlock()
		return m.Status(hash), nil
	}
	for index := range job.Files {
		if job.Files[index].State == StateQueued || job.Files[index].State == StateDownloading {
			job.Files[index].State = StateCancelled
			job.Files[index].Error = ""
		}
	}
	job.PendingAll = false
	job.PendingFileIDs = nil
	if cancel := m.cancels[hash]; cancel != nil {
		cancel()
	}
	recomputeJob(job)
	job.UpdatedAt = time.Now().UTC()
	m.mu.Unlock()
	_ = m.persist(hash)
	return m.Status(hash), nil
}

func (m *Manager) CancelFile(hash string, fileID int) (*Status, error) {
	hash, err := normalizeHash(hash)
	if err != nil {
		return nil, err
	}
	if fileID <= 0 {
		return nil, errors.New("invalid file id")
	}
	m.mu.Lock()
	job := m.jobs[hash]
	if job == nil {
		m.mu.Unlock()
		return m.Status(hash), nil
	}
	job.PendingFileIDs = removeID(job.PendingFileIDs, fileID)
	for index := range job.Files {
		if job.Files[index].ID == fileID &&
			(job.Files[index].State == StateQueued || job.Files[index].State == StateDownloading) {
			job.Files[index].State = StateCancelled
			job.Files[index].Error = ""
		}
	}
	if job.CurrentFileID == fileID {
		if cancel := m.cancels[hash]; cancel != nil {
			cancel()
		}
	}
	recomputeJob(job)
	job.UpdatedAt = time.Now().UTC()
	m.mu.Unlock()
	_ = m.persist(hash)
	return m.Status(hash), nil
}

func (m *Manager) Delete(hash string) (*Status, error) {
	hash, err := normalizeHash(hash)
	if err != nil {
		return nil, err
	}
	if _, err := m.storageInfo(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	if job := m.jobs[hash]; job != nil && (job.State == StateQueued || job.State == StateDownloading) {
		m.mu.Unlock()
		return nil, ErrJobActive
	}
	delete(m.jobs, hash)
	m.mu.Unlock()
	if err := os.RemoveAll(m.jobRoot(hash)); err != nil {
		return nil, err
	}
	return m.Status(hash), nil
}

func (m *Manager) DeleteFile(hash string, fileID int) (*Status, error) {
	hash, err := normalizeHash(hash)
	if err != nil {
		return nil, err
	}
	if fileID <= 0 {
		return nil, errors.New("invalid file id")
	}
	if _, err := m.storageInfo(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	job := m.jobs[hash]
	if job == nil {
		m.mu.Unlock()
		return m.Status(hash), nil
	}
	var relativePath string
	for index := range job.Files {
		if job.Files[index].ID != fileID {
			continue
		}
		if job.Files[index].State == StateQueued || job.Files[index].State == StateDownloading {
			m.mu.Unlock()
			return nil, ErrJobActive
		}
		relativePath = job.Files[index].RelativePath
		job.Files[index].State = StateNotStored
		job.Files[index].Completed = false
		job.Files[index].DownloadedBytes = 0
		job.Files[index].Error = ""
		break
	}
	job.PendingFileIDs = removeID(job.PendingFileIDs, fileID)
	recomputeJob(job)
	job.UpdatedAt = time.Now().UTC()
	m.mu.Unlock()
	if relativePath != "" {
		path, pathErr := m.filePath(hash, relativePath)
		if pathErr != nil {
			return nil, pathErr
		}
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
		if err := os.Remove(path + ".part"); err != nil && !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
	}
	_ = m.persist(hash)
	return m.Status(hash), nil
}

func (m *Manager) Status(hash string) *Status {
	hash, err := normalizeHash(hash)
	if err != nil {
		return &Status{Job: Job{Hash: hash, State: StateNotStored, Error: err.Error()}}
	}
	free, storageErr := m.storageInfo()
	status := &Status{
		Job:          Job{Hash: hash, State: StateNotStored},
		Enabled:      m.root != "",
		Available:    storageErr == nil,
		StoragePath:  m.root,
		FreeBytes:    free,
		MinFreeBytes: m.minFree,
	}
	if storageErr != nil {
		status.State = StateUnavailable
		status.Error = storageErr.Error()
		return status
	}

	m.ensureJobLoaded(hash)
	m.mu.RLock()
	job := cloneJob(m.jobs[hash])
	m.mu.RUnlock()
	if job == nil {
		return status
	}
	status.Job = *job
	status.Enabled = true
	status.Available = true
	status.StoragePath = m.root
	status.FreeBytes = free
	status.MinFreeBytes = m.minFree

	for index := range status.Files {
		file := &status.Files[index]
		if file.State == StateCompleted || file.Completed {
			path, pathErr := m.filePath(hash, file.RelativePath)
			if pathErr != nil {
				file.State = StateMissing
				file.Completed = false
				file.Error = pathErr.Error()
				continue
			}
			info, statErr := os.Stat(path)
			if statErr != nil || info.Size() != file.Length {
				file.State = StateMissing
				file.Completed = false
				file.Error = "stored file is missing"
			}
		}
	}
	recomputeJob(&status.Job)
	return status
}

func (m *Manager) Open(hash string, fileID int) (*os.File, *FileStatus, error) {
	status := m.Status(hash)
	if !status.Available {
		return nil, nil, ErrStorageUnavailable
	}
	for _, fileStatus := range status.Files {
		if fileStatus.ID != fileID || !fileStatus.Completed || fileStatus.State != StateCompleted {
			continue
		}
		path, err := m.filePath(status.Hash, fileStatus.RelativePath)
		if err != nil {
			return nil, nil, err
		}
		file, err := os.Open(path)
		if err != nil {
			return nil, nil, err
		}
		copyStatus := fileStatus
		return file, &copyStatus, nil
	}
	return nil, nil, os.ErrNotExist
}

func (m *Manager) startWorker() {
	m.workerOnce.Do(func() { go m.worker() })
}

func (m *Manager) worker() {
	for {
		select {
		case hash := <-m.queue:
			m.run(hash)
		case <-m.stop:
			return
		}
	}
}

func (m *Manager) run(hash string) {
	m.mu.Lock()
	job := m.jobs[hash]
	if job == nil || !hasQueuedWork(job) {
		m.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.cancels[hash] = cancel
	job.Error = ""
	job.UpdatedAt = time.Now().UTC()
	m.mu.Unlock()
	defer func() {
		cancel()
		m.mu.Lock()
		delete(m.cancels, hash)
		job := m.jobs[hash]
		queued := hasQueuedWork(job)
		m.mu.Unlock()
		if queued {
			m.enqueue(hash)
		}
	}()

	source, err := m.provider.Open(hash)
	if err != nil {
		m.setFailed(hash, err)
		return
	}
	if len(source.Files) == 0 {
		m.setFailed(hash, errors.New("torrent has no files"))
		return
	}
	if err := m.prepareJob(hash, source); err != nil {
		m.setFailed(hash, err)
		return
	}

	sourceFile, ok := m.nextQueuedFile(hash, source)
	if !ok {
		return
	}
	if err := m.checkFileCapacity(hash, sourceFile.ID); err != nil {
		m.setFileFailed(hash, sourceFile.ID, err)
		return
	}
	if err := m.downloadFile(ctx, hash, sourceFile); err != nil {
		if errors.Is(err, context.Canceled) {
			m.setFileCancelled(hash, sourceFile.ID)
		} else {
			m.setFileFailed(hash, sourceFile.ID, err)
		}
		return
	}
}

func (m *Manager) prepareJob(hash string, source *archiveSource) error {
	m.mu.RLock()
	existingJob := cloneJob(m.jobs[hash])
	m.mu.RUnlock()
	if existingJob == nil {
		return errors.New("offline job disappeared")
	}
	existingByID := make(map[int]FileStatus, len(existingJob.Files))
	for _, file := range existingJob.Files {
		existingByID[file.ID] = file
	}
	pending := make(map[int]bool, len(existingJob.PendingFileIDs))
	for _, id := range existingJob.PendingFileIDs {
		pending[id] = true
	}
	foundPending := make(map[int]bool, len(pending))

	files := make([]FileStatus, 0, len(source.Files))
	for _, sourceFile := range source.Files {
		relativePath, err := sanitizeRelativePath(sourceFile.Path)
		if err != nil {
			return fmt.Errorf("unsafe torrent path %q: %w", sourceFile.Path, err)
		}
		status := existingByID[sourceFile.ID]
		status.ID = sourceFile.ID
		status.Path = sourceFile.Path
		status.RelativePath = relativePath
		status.Length = sourceFile.Length
		if status.State == "" {
			status.State = StateNotStored
		}
		target, err := m.filePath(hash, relativePath)
		if err != nil {
			return err
		}
		if info, statErr := os.Stat(target); statErr == nil && info.Size() == sourceFile.Length {
			status.Completed = true
			status.DownloadedBytes = sourceFile.Length
			status.State = StateCompleted
			status.Error = ""
		} else if info, statErr := os.Stat(target + ".part"); statErr == nil && info.Size() <= sourceFile.Length {
			status.Completed = false
			status.DownloadedBytes = info.Size()
		} else {
			status.Completed = false
			status.DownloadedBytes = 0
		}
		if !status.Completed && (existingJob.PendingAll || pending[sourceFile.ID]) {
			status.State = StateQueued
			status.Error = ""
		}
		if pending[sourceFile.ID] {
			foundPending[sourceFile.ID] = true
		}
		files = append(files, status)
	}
	for id := range pending {
		if !foundPending[id] {
			return fmt.Errorf("torrent file id %d not found", id)
		}
	}

	m.mu.Lock()
	job := m.jobs[hash]
	if job == nil {
		m.mu.Unlock()
		return errors.New("offline job disappeared")
	}
	if source.Title != "" {
		job.Title = source.Title
	}
	job.Files = files
	job.PendingAll = false
	job.PendingFileIDs = nil
	recomputeJob(job)
	job.UpdatedAt = time.Now().UTC()
	m.mu.Unlock()
	return m.persist(hash)
}

func (m *Manager) nextQueuedFile(hash string, source *archiveSource) (sourceFile, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	job := m.jobs[hash]
	if job == nil {
		return sourceFile{}, false
	}
	for _, candidate := range source.Files {
		for index := range job.Files {
			if job.Files[index].ID != candidate.ID || job.Files[index].State != StateQueued {
				continue
			}
			job.Files[index].State = StateDownloading
			job.Files[index].Error = ""
			job.CurrentFile = candidate.Path
			job.CurrentFileID = candidate.ID
			recomputeJob(job)
			job.UpdatedAt = time.Now().UTC()
			return candidate, true
		}
	}
	recomputeJob(job)
	return sourceFile{}, false
}

func (m *Manager) downloadFile(ctx context.Context, hash string, sourceFile sourceFile) error {
	fileStatus := m.fileStatus(hash, sourceFile.ID)
	if fileStatus == nil {
		return errors.New("offline file state missing")
	}
	if fileStatus.Completed {
		return nil
	}
	target, err := m.filePath(hash, fileStatus.RelativePath)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	part := target + ".part"
	out, err := os.OpenFile(part, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return err
	}
	defer out.Close()
	partInfo, err := out.Stat()
	if err != nil {
		return err
	}
	offset := partInfo.Size()
	if offset < 0 || offset > sourceFile.Length {
		if err := out.Truncate(0); err != nil {
			return err
		}
		offset = 0
	}
	if _, err := out.Seek(offset, io.SeekStart); err != nil {
		return err
	}

	reader, err := sourceFile.Open()
	if err != nil {
		return err
	}
	defer reader.Close()
	if _, err := reader.Seek(offset, io.SeekStart); err != nil {
		return err
	}

	buffer := make([]byte, 1<<20)
	lastPersist := time.Now()
	lastBytes := offset
	for offset < sourceFile.Length {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		limit := int64(len(buffer))
		if remaining := sourceFile.Length - offset; remaining < limit {
			limit = remaining
		}
		n, readErr := reader.Read(buffer[:limit])
		if n > 0 {
			written, writeErr := out.Write(buffer[:n])
			if writeErr != nil {
				return writeErr
			}
			if written != n {
				return io.ErrShortWrite
			}
			offset += int64(written)
			m.updateProgress(hash, sourceFile.ID, offset, int64(written))
		}
		if time.Since(lastPersist) >= time.Second {
			elapsed := time.Since(lastPersist).Seconds()
			m.setSpeed(hash, float64(offset-lastBytes)/elapsed)
			_ = m.persist(hash)
			lastPersist = time.Now()
			lastBytes = offset
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) && offset == sourceFile.Length {
				break
			}
			return readErr
		}
		if n == 0 {
			return io.ErrNoProgress
		}
	}
	if err := out.Sync(); err != nil {
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	if err := os.Rename(part, target); err != nil {
		return err
	}

	m.mu.Lock()
	if job := m.jobs[hash]; job != nil {
		for index := range job.Files {
			if job.Files[index].ID == sourceFile.ID {
				job.Files[index].Completed = true
				job.Files[index].DownloadedBytes = job.Files[index].Length
				job.Files[index].State = StateCompleted
				job.Files[index].Error = ""
				break
			}
		}
		recomputeJob(job)
		job.UpdatedAt = time.Now().UTC()
	}
	m.mu.Unlock()
	return m.persist(hash)
}

func (m *Manager) updateProgress(hash string, fileID int, fileBytes, delta int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	job := m.jobs[hash]
	if job == nil {
		return
	}
	for index := range job.Files {
		if job.Files[index].ID == fileID {
			job.Files[index].DownloadedBytes = fileBytes
			break
		}
	}
	recomputeJob(job)
	job.UpdatedAt = time.Now().UTC()
}

func (m *Manager) setSpeed(hash string, speed float64) {
	m.mu.Lock()
	if job := m.jobs[hash]; job != nil {
		job.DownloadSpeed = speed
		job.UpdatedAt = time.Now().UTC()
	}
	m.mu.Unlock()
}

func (m *Manager) setFailed(hash string, err error) {
	m.mu.Lock()
	if job := m.jobs[hash]; job != nil && job.State != StateCancelled {
		for index := range job.Files {
			if job.Files[index].State == StateDownloading || job.Files[index].State == StateQueued {
				job.Files[index].State = StateFailed
				job.Files[index].Error = err.Error()
				break
			}
		}
		job.PendingAll = false
		job.PendingFileIDs = nil
		job.Error = err.Error()
		recomputeJob(job)
		if job.State == StateNotStored {
			job.State = StateFailed
		}
		job.UpdatedAt = time.Now().UTC()
	}
	m.mu.Unlock()
	_ = m.persist(hash)
}

func (m *Manager) setFileFailed(hash string, fileID int, err error) {
	m.mu.Lock()
	if job := m.jobs[hash]; job != nil {
		for index := range job.Files {
			if job.Files[index].ID == fileID {
				job.Files[index].State = StateFailed
				job.Files[index].Error = err.Error()
				job.Files[index].Completed = false
				break
			}
		}
		job.Error = err.Error()
		recomputeJob(job)
		job.UpdatedAt = time.Now().UTC()
	}
	m.mu.Unlock()
	_ = m.persist(hash)
}

func (m *Manager) setFileCancelled(hash string, fileID int) {
	m.mu.Lock()
	if job := m.jobs[hash]; job != nil {
		for index := range job.Files {
			if job.Files[index].ID == fileID && job.Files[index].State == StateDownloading {
				job.Files[index].State = StateCancelled
				job.Files[index].Error = ""
				break
			}
		}
		recomputeJob(job)
		job.UpdatedAt = time.Now().UTC()
	}
	m.mu.Unlock()
	_ = m.persist(hash)
}

func (m *Manager) checkFileCapacity(hash string, fileID int) error {
	free, err := m.storageInfo()
	if err != nil {
		return err
	}
	m.mu.RLock()
	job := m.jobs[hash]
	var remaining int64
	if job != nil {
		for _, file := range job.Files {
			if file.ID == fileID {
				remaining = file.Length - file.DownloadedBytes
				break
			}
		}
	}
	m.mu.RUnlock()
	if remaining < 0 {
		remaining = 0
	}
	if free-m.minFree < remaining {
		return fmt.Errorf("not enough storage space: need %d bytes plus %d bytes reserve", remaining, m.minFree)
	}
	return nil
}

func queueKnownFile(job *Job, fileID int) bool {
	for index := range job.Files {
		if job.Files[index].ID != fileID {
			continue
		}
		if !job.Files[index].Completed {
			job.Files[index].State = StateQueued
			job.Files[index].Error = ""
		}
		return true
	}
	return false
}

func appendUniqueID(ids []int, id int) []int {
	for _, current := range ids {
		if current == id {
			return ids
		}
	}
	return append(ids, id)
}

func removeID(ids []int, id int) []int {
	result := ids[:0]
	for _, current := range ids {
		if current != id {
			result = append(result, current)
		}
	}
	return result
}

func hasQueuedWork(job *Job) bool {
	if job == nil {
		return false
	}
	if job.PendingAll || len(job.PendingFileIDs) > 0 {
		return true
	}
	for _, file := range job.Files {
		if file.State == StateQueued {
			return true
		}
	}
	return false
}

func recomputeJob(job *Job) {
	if job == nil {
		return
	}
	var total, downloaded int64
	var completed, queued, downloading, failed, cancelled, missing, known int
	firstError := job.Error
	for index := range job.Files {
		file := &job.Files[index]
		if file.State == "" {
			if file.Completed {
				file.State = StateCompleted
			} else {
				file.State = StateNotStored
			}
		}
		known++
		if file.State != StateNotStored {
			total += file.Length
			downloaded += file.DownloadedBytes
		}
		switch file.State {
		case StateCompleted:
			completed++
		case StateQueued:
			queued++
		case StateDownloading:
			downloading++
		case StateFailed:
			failed++
		case StateCancelled:
			cancelled++
		case StateMissing:
			missing++
		}
		if firstError == "" && file.Error != "" {
			firstError = file.Error
		}
	}
	job.TotalBytes = total
	job.DownloadedBytes = downloaded
	job.Progress = percentage(downloaded, total)
	job.Error = firstError
	if downloading == 0 {
		job.DownloadSpeed = 0
	}
	job.CurrentFile = ""
	job.CurrentFileID = 0
	for _, file := range job.Files {
		if file.State == StateDownloading {
			job.CurrentFile = file.Path
			job.CurrentFileID = file.ID
			break
		}
	}
	switch {
	case downloading > 0:
		job.State = StateDownloading
	case queued > 0 || job.PendingAll || len(job.PendingFileIDs) > 0:
		job.State = StateQueued
	case missing > 0:
		job.State = StateMissing
	case failed > 0:
		job.State = StateFailed
	case known > 0 && completed == known:
		job.State = StateCompleted
	case completed > 0:
		job.State = StatePartial
	case cancelled > 0:
		job.State = StateCancelled
	case firstError != "":
		job.State = StateFailed
	default:
		job.State = StateNotStored
	}
}

func (m *Manager) storageInfo() (int64, error) {
	if m.root == "" {
		return 0, errors.New("offline storage is not configured")
	}
	marker := filepath.Join(m.root, MarkerFile)
	info, err := os.Stat(marker)
	if err != nil || info.IsDir() {
		return 0, ErrStorageUnavailable
	}
	free, err := diskFreeBytes(m.root)
	if err != nil {
		return 0, ErrStorageUnavailable
	}
	return free, nil
}

func (m *Manager) loadJobs() {
	if _, err := m.storageInfo(); err != nil {
		return
	}
	entries, err := os.ReadDir(filepath.Join(m.root, "library"))
	if err != nil {
		return
	}
	var resume []string
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		hash, err := normalizeHash(entry.Name())
		if err != nil {
			continue
		}
		job, err := m.readManifest(hash)
		if err != nil {
			continue
		}
		legacyState := job.State
		for index := range job.Files {
			if job.Files[index].State == "" {
				if job.Files[index].Completed {
					job.Files[index].State = StateCompleted
				} else if legacyState == StateDownloading || legacyState == StateQueued {
					job.Files[index].State = StateQueued
				} else {
					job.Files[index].State = legacyState
				}
			}
			if job.Files[index].State == StateDownloading {
				job.Files[index].State = StateQueued
			}
		}
		recomputeJob(job)
		if hasQueuedWork(job) {
			resume = append(resume, hash)
		}
		m.jobs[hash] = job
	}
	for _, hash := range resume {
		m.enqueue(hash)
	}
}

func (m *Manager) ensureJobLoaded(hash string) {
	m.mu.RLock()
	job := m.jobs[hash]
	m.mu.RUnlock()
	if job != nil {
		return
	}
	loaded, err := m.readManifest(hash)
	if err != nil {
		return
	}
	m.mu.Lock()
	if m.jobs[hash] == nil {
		m.jobs[hash] = loaded
	}
	m.mu.Unlock()
}

func (m *Manager) enqueue(hash string) {
	select {
	case m.queue <- hash:
	default:
		m.setFailed(hash, errors.New("offline download queue is full"))
	}
}

func (m *Manager) persist(hash string) error {
	m.mu.RLock()
	job := cloneJob(m.jobs[hash])
	m.mu.RUnlock()
	if job == nil {
		return os.ErrNotExist
	}
	if _, err := m.storageInfo(); err != nil {
		return err
	}
	dir := m.jobRoot(hash)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(job, "", "  ")
	if err != nil {
		return err
	}
	temp := filepath.Join(dir, "manifest.json.tmp")
	if err := os.WriteFile(temp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(temp, filepath.Join(dir, "manifest.json"))
}

func (m *Manager) readManifest(hash string) (*Job, error) {
	data, err := os.ReadFile(filepath.Join(m.jobRoot(hash), "manifest.json"))
	if err != nil {
		return nil, err
	}
	var job Job
	if err := json.Unmarshal(data, &job); err != nil {
		return nil, err
	}
	if job.Hash != hash {
		return nil, errors.New("offline manifest hash mismatch")
	}
	return &job, nil
}

func (m *Manager) jobRoot(hash string) string {
	return filepath.Join(m.root, "library", hash)
}

func (m *Manager) filePath(hash, relativePath string) (string, error) {
	clean, err := sanitizeRelativePath(relativePath)
	if err != nil {
		return "", err
	}
	root := filepath.Join(m.jobRoot(hash), "files")
	target := filepath.Join(root, clean)
	rel, err := filepath.Rel(root, target)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", errors.New("offline file escapes storage root")
	}
	return target, nil
}

func (m *Manager) fileStatus(hash string, fileID int) *FileStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()
	job := m.jobs[hash]
	if job == nil {
		return nil
	}
	for _, file := range job.Files {
		if file.ID == fileID {
			copyStatus := file
			return &copyStatus
		}
	}
	return nil
}

func normalizeHash(hash string) (string, error) {
	hash = strings.ToLower(strings.TrimSpace(hash))
	if len(hash) != 40 {
		return "", errors.New("invalid torrent hash")
	}
	if _, err := hex.DecodeString(hash); err != nil {
		return "", errors.New("invalid torrent hash")
	}
	return hash, nil
}

func sanitizeRelativePath(path string) (string, error) {
	path = strings.ReplaceAll(strings.TrimSpace(path), "\\", "/")
	if strings.ContainsRune(path, '\x00') {
		return "", errors.New("invalid relative path")
	}
	for _, component := range strings.Split(path, "/") {
		if component == ".." {
			return "", errors.New("invalid relative path")
		}
	}
	clean := filepath.Clean(filepath.FromSlash(path))
	if clean == "." || clean == "" || filepath.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, ".."+string(os.PathSeparator)) {
		return "", errors.New("invalid relative path")
	}
	return clean, nil
}

func cloneJob(job *Job) *Job {
	if job == nil {
		return nil
	}
	copyJob := *job
	copyJob.Files = append([]FileStatus(nil), job.Files...)
	return &copyJob
}

func percentage(done, total int64) float64 {
	if total <= 0 {
		return 0
	}
	value := float64(done) * 100 / float64(total)
	if value > 100 {
		return 100
	}
	return value
}

func minFreeFromEnv() int64 {
	value := strings.TrimSpace(os.Getenv(MinFreeBytesEnv))
	if value == "" {
		return defaultMinFree
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed < 0 {
		return defaultMinFree
	}
	return parsed
}

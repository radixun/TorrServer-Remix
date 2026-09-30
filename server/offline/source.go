package offline

import (
	"errors"
	"io"
	"sort"

	"server/torr"
	serverutils "server/utils"

	gotorrent "github.com/anacrolix/torrent"
)

type archiveReader interface {
	io.ReadSeeker
	io.Closer
}

type sourceFile struct {
	ID     int
	Path   string
	Length int64
	Open   func() (archiveReader, error)
}

type archiveSource struct {
	Title string
	Files []sourceFile
}

type sourceProvider interface {
	Open(hash string) (*archiveSource, error)
}

type torrentProvider struct{}

func (torrentProvider) Open(hash string) (*archiveSource, error) {
	tor, err := torr.EnsureTorrent(hash)
	if err != nil {
		return nil, err
	}

	files := append([]*gotorrent.File(nil), tor.Files()...)
	sort.Slice(files, func(i, j int) bool {
		return serverutils.CompareStrings(files[i].Path(), files[j].Path())
	})

	source := &archiveSource{Title: tor.Title}
	for index, torrentFile := range files {
		file := torrentFile
		source.Files = append(source.Files, sourceFile{
			ID:     index + 1,
			Path:   file.Path(),
			Length: file.Length(),
			Open: func() (archiveReader, error) {
				reader := tor.NewReader(file)
				if reader == nil {
					return nil, errors.New("torrent reader unavailable")
				}
				return &torrentArchiveReader{reader: reader, close: func() { tor.CloseReader(reader) }}, nil
			},
		})
	}
	return source, nil
}

type torrentArchiveReader struct {
	reader io.ReadSeeker
	close  func()
	closed bool
}

func (r *torrentArchiveReader) Read(p []byte) (int, error) {
	return r.reader.Read(p)
}

func (r *torrentArchiveReader) Seek(offset int64, whence int) (int64, error) {
	return r.reader.Seek(offset, whence)
}

func (r *torrentArchiveReader) Close() error {
	if !r.closed {
		r.closed = true
		r.close()
	}
	return nil
}

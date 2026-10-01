//go:build !linux && !darwin && !freebsd && !openbsd && !dragonfly && !windows

package offline

import "errors"

func diskFreeBytes(string) (int64, error) {
	return 0, errors.New("offline free-space checks are unsupported on this platform")
}

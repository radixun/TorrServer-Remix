package settings

import "testing"

// A pre-145 watched mark is an empty object, whereas newer records store
// playback seconds. Both must remain visible to the cinema interface.
func TestViewedLegacyMarksSurviveTimecodeMigration(t *testing.T) {
	oldPath, oldDB, oldSets, oldJSON := Path, tdb, BTsets, globalJsonDB
	Path = t.TempDir()
	globalJsonDB = nil
	tdb = NewJsonDB()
	BTsets = &BTSets{TrackTimecode: true}
	t.Cleanup(func() {
		tdb.CloseDB()
		Path, tdb, BTsets, globalJsonDB = oldPath, oldDB, oldSets, oldJSON
	})
	tdb.Set("Viewed", "legacy", []byte(`{"1":{},"3":{}}`))
	if got := ListViewed("legacy"); len(got) != 2 {
		t.Fatalf("legacy marks = %v, want two", got)
	}
	SetViewed(&Viewed{Hash: "legacy", FileIndex: 2, TimeCode: 42.5})
	got := ListViewed("legacy")
	marks := map[int]float64{}
	for _, mark := range got {
		marks[mark.FileIndex] = mark.TimeCode
	}
	if len(marks) != 3 || marks[2] != 42.5 {
		t.Fatalf("marks after setting timecode = %v", marks)
	}
	RemViewed(&Viewed{Hash: "legacy", FileIndex: 2})
	if got := ListViewed("legacy"); len(got) != 2 {
		t.Fatalf("removing one mark lost legacy marks: %v", got)
	}
	BTsets.TrackTimecode = false
	SetViewed(&Viewed{Hash: "legacy", FileIndex: 4, TimeCode: 99})
	for _, mark := range ListViewed("legacy") {
		if mark.TimeCode != 0 {
			t.Fatalf("disabled timecode tracking stored %v", mark)
		}
	}
}

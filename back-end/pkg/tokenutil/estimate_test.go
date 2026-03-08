package tokenutil

import "testing"

func TestEstimateText(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  int
	}{
		{"empty", "", 0},
		{"pure ascii", "hello world", 2},           // 11 ascii bytes -> 11/4 = 2
		{"pure chinese", "你好世界", 6},                  // 4 non-ascii runes -> 4*3/2 = 6
		{"mixed", "hello你好", 4},                      // 5/4 + 2*3/2 = 1+3 = 4
		{"code snippet", "func main() {}", 3},       // 15/4 = 3
		{"single ascii", "a", 0},                    // 1/4 = 0
		{"four ascii", "abcd", 1},                   // 4/4 = 1
		{"single non-ascii", "中", 1},                 // 1*3/2 = 1
		{"two non-ascii", "中文", 3},                   // 2*3/2 = 3
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := EstimateText(tt.input)
			if got != tt.want {
				t.Errorf("EstimateText(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}

func TestEstimateImages(t *testing.T) {
	if got := EstimateImages(0); got != 0 {
		t.Errorf("EstimateImages(0) = %d, want 0", got)
	}
	if got := EstimateImages(3); got != 4800 {
		t.Errorf("EstimateImages(3) = %d, want 4800", got)
	}
}

func TestEstimate(t *testing.T) {
	// "hello" = 5 ascii -> 5/4 = 1, plus 2 images = 3200
	got := Estimate("hello", 2)
	want := 1 + 3200
	if got != want {
		t.Errorf("Estimate(\"hello\", 2) = %d, want %d", got, want)
	}
}

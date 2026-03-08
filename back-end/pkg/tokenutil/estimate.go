package tokenutil

// EstimateText returns an approximate token count for a text string.
// ASCII bytes (r < 128) are counted as asciiBytes/4;
// non-ASCII runes (r >= 128) are counted as nonASCIIRunes * 1.5.
func EstimateText(s string) int {
	var asciiBytes, nonASCIIRunes int
	for _, r := range s {
		if r < 128 {
			asciiBytes++
		} else {
			nonASCIIRunes++
		}
	}
	return asciiBytes/4 + nonASCIIRunes*3/2
}

const tokensPerImage = 1600

// EstimateImages returns the estimated token count for n images.
func EstimateImages(n int) int {
	return n * tokensPerImage
}

// Estimate returns the total estimated token count for text content plus images.
func Estimate(text string, imageCount int) int {
	return EstimateText(text) + EstimateImages(imageCount)
}

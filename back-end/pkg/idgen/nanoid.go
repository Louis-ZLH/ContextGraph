package idgen

import (
	"crypto/rand"
	"math/big"
)

const (
	nanoIDAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-"
	nanoIDLength   = 21
)

// GenNanoID generates a 21-character nanoid-compatible string ID.
func GenNanoID() string {
	alphabetLen := big.NewInt(int64(len(nanoIDAlphabet)))
	result := make([]byte, nanoIDLength)
	for i := range result {
		n, _ := rand.Int(rand.Reader, alphabetLen)
		result[i] = nanoIDAlphabet[n.Int64()]
	}
	return string(result)
}

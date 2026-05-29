import { decodeBase64, encodeBase64 } from '@std/encoding/base64'
import { assert } from '@std/assert/assert'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const te = new TextEncoder()
const td = new TextDecoder()

function rotByAlphabet(alphabet: string) {
	const n = alphabet.length / 2
	assert(Number.isInteger(n), 'Alphabet length must be even')

	return (input: string) =>
		[...input].map((c) => {
			const i = alphabet.indexOf(c)
			if (i === -1) return c
			return alphabet[(i + n) % alphabet.length]
		}).join('')
}

const rot32 = rotByAlphabet(alphabet)

export function encode(input: string): string {
	return rot32(encodeBase64(te.encode(input))).replace(/=+$/, '')
}
export function decode(input: string): string {
	return td.decode(decodeBase64(rot32(input)))
}

export class Rotator {
	n = 13
	alphabet = 'abcdefghijklmnopqrstuvwxyz'

	rotate(str: string): string {
		const re = new RegExp(`[${RegExp.escape(this.alphabet)}]`, 'giu')

		return str.replaceAll(re, (ch) => {
			const isUpper = ch.toUpperCase() === ch
			const idx = this.alphabet.indexOf(ch.toLowerCase())
			const out = this.alphabet[(idx + this.n) % this.alphabet.length]!
			return isUpper ? out.toUpperCase() : out
		})
	}
}

const rotator = new Rotator()

export function getRot13edWords(str: string): string[] {
	return str.split('\n')
		.map((x) => {
			const trimmed = x.trim()
			if (!trimmed || trimmed.startsWith('#') || '') return null
			return rotator.rotate(trimmed)
		}).filter((x) => x != null)
}

// const words = getRot13edWords(await Deno.readTextFile('./data/copilot_slurs_rot13.txt'))
// await Deno.writeTextFile('./_.txt', words.join('\n') + '\n')

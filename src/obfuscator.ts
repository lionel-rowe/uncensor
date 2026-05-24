import { sample } from '@std/random'
import { assert } from '@std/assert/assert'
import { EnglishStemmer } from '../snowball/js_out/english-stemmer.js'
import { StatelessRegExp } from './utils.ts'

type Stemmer = {
	/** Stems a single word and returns the stemmed form. */
	stemWord(word: string): string
}

const RIGHT_TO_LEFT_OVERRIDE = '\u202E'
const POP_DIRECTIONAL_FORMATTING = '\u202C'

const directionalOverrides = [
	RIGHT_TO_LEFT_OVERRIDE,
	POP_DIRECTIONAL_FORMATTING,
] as const

const MONGOLIAN_VOWEL_SEPARATOR = '\u180e'
// // causes rendering issues in some fonts
// const ZERO_WIDTH_NON_JOINER = '\u200c'
const ZERO_WIDTH_JOINER = '\u200d'
const WORD_JOINER = '\u2060'

const invisibles = [
	MONGOLIAN_VOWEL_SEPARATOR,
	// ZERO_WIDTH_NON_JOINER,
	ZERO_WIDTH_JOINER,
	WORD_JOINER,
] as const

export const allInvisibles = [...directionalOverrides, ...invisibles]

export const allInvisiblesRe = new StatelessRegExp(String.raw`[${RegExp.escape(allInvisibles.join(''))}]`, 'u')
const directionalOverriddenPartRe = new StatelessRegExp(
	String.raw`${RIGHT_TO_LEFT_OVERRIDE}[\s\S]*?${POP_DIRECTIONAL_FORMATTING}`,
	'u',
)

/**
 * Modified from [StevenACoffman/Homoglyphs.md](https://gist.github.com/StevenACoffman/a5f6f682d94e38ed804182dc2693ed4b?permalink_comment_id=5406875#gistcomment-5406875)
 * and [Wiktionary apendices](https://en.wiktionary.org/wiki/Appendix:Variations_of_%22a%22), and
 * supplemented with chars from "sans-serif" Unicode variants when others unavailable
 * (these are less ideal as they normalize to the regular ASCII equivalents with NFK[CD] forms,
 * so we only use them as a backup).
 * ```
 * 𝖠𝖡𝖢𝖣𝖤𝖥𝖦𝖧𝖨𝖩𝖪𝖫𝖬𝖭𝖮𝖯𝖰𝖱𝖲𝖳𝖴𝖵𝖶𝖷𝖸𝖹
 * 𝖺𝖻𝖼𝖽𝖾𝖿𝗀𝗁𝗂𝗃𝗄𝗅𝗆𝗇𝗈𝗉𝗊𝗋𝗌𝗍𝗎𝗏𝗐𝗑𝗒𝗓
 * ```
 */
const homoglyphs = [
	'aа',
	'AΑА',
	// Sadly "ߕ" is unusable as it doesn't play well with directionality chars
	// due to being N'ko script (an RTL script)
	'b𝖻',
	'BВΒ',
	'cсϲ',
	'CС',
	'dԁ',
	'DᎠꓓ',
	'eе',
	'EᎬꓰ',
	'f𝖿',
	'Fᖴꓝ𝈓',
	'g𝗀',
	'GꓖᏀ',
	'h𝗁',
	'HНΗ',
	'iі',
	'IІ',
	'j𝗃',
	'J𝖩',
	'k𝗄',
	'KΚ',
	'l𝗅',
	'LԼ',
	'm𝗆',
	'MМΜ',
	'n𝗇',
	'NΝ',
	'oоο',
	'OОΟ',
	'pрⲣ',
	'PРΡⲢ',
	'qԛ',
	'QԚ',
	'r𝗋',
	'Rꓣ𖼵',
	'sѕ',
	'SЅ',
	't𝗍',
	'TТΤ',
	'uս',
	'U∪Ս',
	'vν∨',
	'V⋁',
	'wԝ',
	'WԜ',
	'xх',
	'XХΧ',
	'yу',
	'YΥ',
	'zⲍ',
	'ZⲌΖ',
]

type ObfuscatorOptions = {
	prng: () => number
	locale: string | Intl.Locale
	stemmer: Stemmer
}

const defaultOptions: ObfuscatorOptions = {
	prng: Math.random,
	locale: 'en-US',
	stemmer: new EnglishStemmer(),
}

function createScriptRe(locale: string | Intl.Locale): StatelessRegExp {
	locale = new Intl.Locale(locale).maximize()
	const script = locale.script
	try {
		assert(script != null)
		if (/^Han[st]$/.test(script)) new StatelessRegExp(/\p{sc=Han}/u)
		return new StatelessRegExp(String.raw`\p{scx=${script}}`, 'u')
	} catch {
		return new StatelessRegExp(/\p{scx=Latn}/u)
	}
}

class CharConverter {
	#regex: StatelessRegExp
	#mapping: Map<string, string[]>
	#prng: () => number

	constructor(homoglyphs: string[], testChar: (char: string) => boolean, prng: () => number) {
		this.#mapping = new Map()
		this.#prng = prng
		const sourceChars = new Set<string>()
		for (const group of homoglyphs) {
			const chars = [...group]

			const { matched = [], unmatched = [] } = Object.groupBy(chars, (c) => testChar(c) ? 'matched' : 'unmatched')

			for (const sourceChar of matched) {
				sourceChars.add(sourceChar)
				this.#mapping.set(sourceChar, unmatched)
			}
		}

		this.#regex = new StatelessRegExp(`[${RegExp.escape([...sourceChars].join(''))}]`, 'u')
	}

	convert(str: string): string {
		return str.replaceAll(this.#regex.asStateful('g'), (char) => {
			const glyphs = this.#mapping.get(char)!
			return sample(glyphs, { prng: this.#prng }) ?? char
		})
	}
}

type Part = {
	kind: 'plain' | 'obfuscated'
	start: number
	end: number
	content: string
}

export class Obfuscator {
	#segmenter: Intl.Segmenter
	#prng: () => number
	#stemmer: Stemmer
	#locale: Intl.Locale

	#targetWordRe: StatelessRegExp
	#converter: CharConverter
	#reverter: CharConverter

	constructor(words: string[], options?: Partial<ObfuscatorOptions>) {
		const opts = { ...defaultOptions, ...options }
		this.#locale = new Intl.Locale(opts.locale)
		this.#segmenter = new Intl.Segmenter(this.#locale, { granularity: 'word' })
		this.#prng = opts.prng
		this.#stemmer = opts.stemmer

		const wordStemRegexParts = words.map((w) => RegExp.escape(this.#normalize(w)))

		this.#targetWordRe = new StatelessRegExp(
			String.raw`^(?:${wordStemRegexParts.sort((a, b) => b.length - a.length).join('|')})$`,
			'u',
		)

		const scriptRe = createScriptRe(this.#locale)
		this.#converter = new CharConverter(homoglyphs, (c) => scriptRe.test(c), opts.prng)
		this.#reverter = new CharConverter(homoglyphs, (c) => !scriptRe.test(c), opts.prng)
	}

	#normalize(word: string): string {
		return this.#stemmer.stemWord(word).normalize('NFD').toLocaleLowerCase(this.#locale)
	}

	obfuscateToParts(text: string): Part[] {
		const parts: Part[] = []
		for (const s of this.#segmenter.segment(text)) {
			const stem = this.#normalize(s.segment)
			const part = { start: s.index, end: s.index + s.segment.length, content: s.segment }

			if (s.isWordLike && this.#targetWordRe.test(stem)) {
				parts.push({ kind: 'obfuscated', ...part, content: this.obfuscateWord(s.segment) })
			} else {
				parts.push({ kind: 'plain', ...part })
			}
		}

		return parts
	}

	obfuscate(text: string): string {
		return this.obfuscateToParts(text).map((p) => p.content).join('')
	}

	protected obfuscateWord(word: string): string {
		const chars = [...this.#converter.convert(word.normalize('NFD'))]

		if (chars.length > 3) {
			chars.reverse()
			;[chars[0], chars[chars.length - 1]] = [chars[chars.length - 1], chars[0]]

			return chars
				.flatMap((char, i) => {
					switch (i) {
						case 0:
							return [char]
						case 1:
							return [RIGHT_TO_LEFT_OVERRIDE, char]
						case chars.length - 1:
							return [POP_DIRECTIONAL_FORMATTING, char]
						default:
							return [sample(invisibles, { prng: this.#prng })!, char]
					}
				}).join('')
		}

		return chars.flatMap((char, i) => i === 0 ? [char] : [sample(invisibles, { prng: this.#prng })!, char]).join('')
	}

	deobfuscate(text: string): string {
		return this.#reverter.convert(text)
			.replaceAll(directionalOverriddenPartRe.asStateful('g'), (m) => {
				return [...m.slice(1, -1)].reverse().join('')
			})
			.replaceAll(allInvisiblesRe.asStateful('g'), '')
			.normalize('NFC')
	}
}

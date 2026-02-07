import { sample } from '@std/random'
import { assert } from '@std/assert/assert'
import { EnglishStemmer } from '../snowball/js_out/english-stemmer.js'
import type { EnglishStemmer as Stemmer } from '../snowball/js_out/english-stemmer.js'
import { StatelessRegExp } from './utils.ts'

const RIGHT_TO_LEFT_OVERRIDE = '\u202E'
const POP_DIRECTIONAL_FORMATTING = '\u202C'

const directionalOverrides = [
	RIGHT_TO_LEFT_OVERRIDE,
	POP_DIRECTIONAL_FORMATTING,
] as const

const MONGOLIAN_VOWEL_SEPARATOR = '\u180e'
const ZERO_WIDTH_NON_JOINER = '\u200c'
const ZERO_WIDTH_JOINER = '\u200d'
const WORD_JOINER = '\u2060'

const invisibles = [
	MONGOLIAN_VOWEL_SEPARATOR,
	ZERO_WIDTH_NON_JOINER,
	ZERO_WIDTH_JOINER,
	WORD_JOINER,
] as const

export const allInvisibles = [...directionalOverrides, ...invisibles]

export const allInvisiblesRe = new StatelessRegExp(String.raw`[${RegExp.escape(allInvisibles.join(''))}]`, 'u')
const directionalOverriddenPartRe = new StatelessRegExp(
	String.raw`${RIGHT_TO_LEFT_OVERRIDE}[\s\S]*?${POP_DIRECTIONAL_FORMATTING}`,
	'u',
)

// TODO?
// 𝖠𝖡𝖢𝖣𝖤𝖥𝖦𝖧𝖨𝖩𝖪𝖫𝖬𝖭𝖮𝖯𝖰𝖱𝖲𝖳𝖴𝖵𝖶𝖷𝖸𝖹
// 𝖺𝖻𝖼𝖽𝖾𝖿𝗀𝗁𝗂𝗃𝗄𝗅𝗆𝗇𝗈𝗉𝗊𝗋𝗌𝗍𝗎𝗏𝗐𝗑𝗒𝗓

// modified from https://gist.github.com/StevenACoffman/a5f6f682d94e38ed804182dc2693ed4b?permalink_comment_id=5406875#gistcomment-5406875
// and https://en.wiktionary.org/wiki/Appendix:Variations_of_%22a%22 etc.
const homoglyphs = [
	'aа',
	'AΑА',
	'b',
	'BВΒ',
	'cсϲ',
	'CС',
	'dԁ',
	'DᎠꓓ',
	'e',
	'EᎬꓰ',
	'f',
	'Fᖴꓝ𝈓',
	'g',
	'GꓖᏀ',
	'h',
	'H',
	'iі',
	'IІ',
	'j',
	'J',
	'k',
	'KΚ',
	'l',
	'LԼ',
	'm',
	'M',
	'n',
	'NΝ',
	'oоο',
	'OОΟ',
	'pрⲣ',
	'PРΡⲢ',
	'qԛ',
	'QԚ',
	'r',
	'Rꓣ𖼵',
	'sѕ',
	'SЅ',
	't',
	'TТΤ',
	'u',
	'U',
	'v',
	'V',
	'wԝ',
	'WԜ',
	'xх',
	'XХΧ',
	'yу',
	'YΥ',
	'zⲍ',
	'ZⲌΖ',
]

const words = (await Deno.readTextFile('./data/words.txt'))
	.split('\n')
	.map((x) => {
		const trimmed = x.trim()
		if (!trimmed || trimmed.startsWith('#') || '') return null
		return trimmed
	}).filter((x) => x != null)

type ObfuscatorOptions = {
	prng: () => number
	locale: string | Intl.Locale
	stemmer: Stemmer
	words: string[]
}

const defaultOptions: ObfuscatorOptions = {
	prng: Math.random,
	locale: 'en-US',
	stemmer: new EnglishStemmer(),
	words,
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

export class Obfuscator {
	#segmenter: Intl.Segmenter
	#prng: () => number
	#stemmer: Stemmer

	#targetWordRe: StatelessRegExp
	#converter: CharConverter
	#reverter: CharConverter

	constructor(options?: Partial<ObfuscatorOptions>) {
		const opts = { ...defaultOptions, ...options }
		this.#segmenter = new Intl.Segmenter(opts.locale, { granularity: 'word' })
		this.#prng = opts.prng
		this.#stemmer = opts.stemmer

		this.#targetWordRe = new StatelessRegExp(
			String.raw`^(?:${opts.words.sort((a, b) => b.length - a.length).join('|')})$`,
			'iu',
		)

		const scriptRe = createScriptRe(opts.locale)
		this.#converter = new CharConverter(homoglyphs, (c) => scriptRe.test(c), opts.prng)
		this.#reverter = new CharConverter(homoglyphs, (c) => !scriptRe.test(c), opts.prng)
	}

	obfuscate(text: string): string {
		let out = ''
		for (const s of this.#segmenter.segment(text)) {
			if (s.isWordLike && this.#targetWordRe.test(s.segment)) {
				out += this.obfuscateWord(s.segment.normalize('NFD'))
			} else {
				out += s.segment
			}
		}

		return out
	}

	protected obfuscateWord(word: string): string {
		const chars = [...this.#converter.convert(word)]

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
	}
}

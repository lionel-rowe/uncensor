declare class Stemmer {
	/** Stems a single word and returns the stemmed form. */
	stemWord(word: string): string
}

const _stemmers = [
	// <stemmers>
	['en', () => import('../snowball/js_out/english-stemmer.js')],
	// </stemmers>
] as const

type StemmerLocale = (typeof _stemmers)[number][0]

const stemmers = new Map<string, () => Promise<Partial<Record<string, typeof Stemmer>>>>(_stemmers)

/**
 * Dynamically imports the stemmer class for a given locale and returns it.
 * If no stemmer class is available for that locale, returns `null` instead
 *
 * @param locale
 * @returns `Stemmer` constructor, or `null` if none available for that locale
 * @throws {TypeError} if an invalid locale is passed
 */
export function getStemmer(locale: StemmerLocale): Promise<typeof Stemmer>
export function getStemmer(locale: string | Intl.Locale): Promise<typeof Stemmer | null>
export async function getStemmer(locale: string | Intl.Locale): Promise<typeof Stemmer | null> {
	const { language } = new Intl.Locale(locale)

	const mod = await stemmers.get(language)?.() ?? null
	if (mod == null) return null

	return mod[Object.keys(mod).find((k) => k.endsWith('Stemmer'))!]!
}

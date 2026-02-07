import { allInvisiblesRe, Obfuscator } from './main.ts'
import { bgGreen, bgRed } from '@std/fmt/colors'
import { AssertionError } from '@std/assert'
import { getRandomValuesSeeded, nextFloat64 } from '@std/random'
import { type Diff, DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT, diff_match_patch } from '@dmsnell/diff-match-patch'

// const SEED = crypto.getRandomValues(new BigUint64Array(1))[0]
const SEED = 1930584040571145426n

function initPrng() {
	const gen = getRandomValuesSeeded(SEED)
	return () => nextFloat64(gen)
}

type DiffOp = typeof DIFF_OPS[number]
const DIFF_OPS = [DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT] as const

const dmp = new diff_match_patch()
const allFns: Record<DiffOp, (x: string) => string> = {
	[DIFF_INSERT]: bgGreen,
	[DIFF_DELETE]: bgRed,
	[DIFF_EQUAL]: (x) => x,
}

function fmt(diffs: Diff[], include: Set<DiffOp>): string {
	const fns = { ...allFns }
	for (const op of DIFF_OPS) {
		if (!include.has(op)) fns[op] = () => ''
	}

	const str = diffs.map(([op, text]) => fns[op as DiffOp](text as string)).join('')

	return str.replaceAll(
		allInvisiblesRe.asStateful('g'),
		(c) => String.raw`\u${c.charCodeAt(0)!.toString(16).padStart(4, '0')}`,
	)
}

function assertEquals(actual: string, expected: string, message?: string) {
	if (actual !== expected) {
		const diffs = dmp.diff_main(actual, expected)

		const actualFormatted = fmt(diffs, new Set([DIFF_EQUAL, DIFF_DELETE]))
		const expectedFormatted = fmt(diffs, new Set([DIFF_EQUAL, DIFF_INSERT]))

		throw new AssertionError(
			`actual != expected${
				message ? `: ${message}` : ''
			}.\n\nActual: ${actualFormatted}\nExpect: ${expectedFormatted}`,
		)
	}
}

Deno.test(Obfuscator.name, async (t) => {
	await t.step('word detection', async (t) => {
		class Obfuscator_ extends Obfuscator {
			protected override obfuscateWord(str: string): string {
				return `[${str}]`
			}
		}

		const tests = [
			['Epstein didn’t kill himself.', '[Epstein] didn’t [kill] himself.'],
			['EPSTEIN DIDN’T KILL HIMSELF.', '[EPSTEIN] DIDN’T [KILL] HIMSELF.'],
		] as const

		for (const [input, expected] of tests) {
			await t.step(JSON.stringify(input), () => {
				const obfuscator = new Obfuscator_()
				const output = obfuscator.obfuscate(input)
				assertEquals(output, expected)
			})
		}
	})

	await t.step('word conversion', async (t) => {
		const tests = [
			['One', 'Ο\u2060n\u200de'],
			['Two', 'Τ\u2060ԝ\u180eο'],
			['Three', 'Τ\u202ee\u2060r\u200dh\u202ce'],
		] as const

		await t.step(Obfuscator.prototype['obfuscateWord'].name, async (t) => {
			for (const [word, expected] of tests) {
				await t.step(JSON.stringify(word), () => {
					const obfuscator = new Obfuscator({ prng: initPrng() })
					const output = obfuscator['obfuscateWord'](word)
					assertEquals(output, expected)
				})
			}
		})
	})

	await t.step('text conversion', async (t) => {
		const tests = [
			[
				'Epstein didn’t kill himself.',
				'ꓰ\u202eі\u180ee\u2060t\u200dѕ\u180eⲣ\u202cn didn’t k\u202el\u200cі\u202cl himself.',
			],
			[
				'EPSTEIN DIDN’T KILL HIMSELF.',
				'ꓰ\u202eІ\u180eᎬ\u200cΤ\u200cЅ\u200cⲢ\u202cΝ DIDN’T Κ\u202eԼ\u200cІ\u202cԼ HIMSELF.',
			],
		] as const

		await t.step(Obfuscator.prototype.obfuscate.name, async (t) => {
			for (const [input, expected] of tests) {
				await t.step(JSON.stringify(input), () => {
					const obfuscator = new Obfuscator({ prng: initPrng() })
					const output = obfuscator.obfuscate(input)
					assertEquals(output, expected)
				})
			}
		})

		await t.step(Obfuscator.prototype.deobfuscate.name, async (t) => {
			for (const [expected, obfuscated] of tests) {
				await t.step(JSON.stringify(obfuscated), () => {
					const obfuscator = new Obfuscator({ prng: initPrng() })
					const output = obfuscator.deobfuscate(obfuscated)
					assertEquals(output, expected)
				})
			}
		})
	})
})

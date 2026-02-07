import { Rotator } from './rot.ts'
import { assertEquals } from '@std/assert'

Deno.test('rot13', () => {
	const rotator = new Rotator()
	const tests = [
		['hello', 'uryyb'],
		['Hello, World!', 'Uryyb, Jbeyq!'],
		['ROT13', 'EBG13'],
	] as const

	for (const [input, expected] of tests) {
		const output = rotator.rotate(input)
		assertEquals(output, expected)
	}
})

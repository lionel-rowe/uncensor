import { Input } from '@cliffy/prompt'
import { Obfuscator } from './main.ts'
import { bgMagenta, bold } from '@std/fmt/colors'

const obfuscator = new Obfuscator()

while (true) {
	const input = await Input.prompt('Text to decensor')
	console.info(
		obfuscator.obfuscateToParts(input)
			.map((p) => p.kind === 'obfuscated' ? bold(bgMagenta(p.content)) : p.content)
			.join(''),
	)
}

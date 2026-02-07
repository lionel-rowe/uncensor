import { Input } from '@cliffy/prompt'
import { Obfuscator } from './main.ts'

const obfuscator = new Obfuscator()

while (true) {
	const input = await Input.prompt('Text to decensor')
	console.info(obfuscator.obfuscate(input))
}

import { Input } from '@cliffy/prompt'
import { Command } from '@cliffy/command'
import { Obfuscator } from './obfuscator.ts'
import { bgMagenta, bold } from '@std/fmt/colors'
import { decode } from './encoding.ts'
import { syncWords } from './syncWords.ts'

new Command()
	.name('uncensor')
	.description(
		'A tool to obfuscate suspected trigger words in text, making them less likely to be algorithmically censored, while remaining human-readable',
	)
	.arguments('[...args:string]')
	.action(async (_opts, ...args) => {
		await syncWords()

		const defaultWordsJson = JSON.parse(await Deno.readTextFile('./data/defaultWords.json')) as {
			words: (string | null)[]
		}
		const words = defaultWordsJson.words.filter((x) => x != null).map(decode)
		const obfuscator = new Obfuscator(words)

		if (args.length > 0) {
			console.info(render(args.join(' '), obfuscator))
			return
		}

		do {
			const input = await Input.prompt('Text to uncensor')
			console.info(render(input, obfuscator))
		} while (Deno.stdin.isTerminal())
	})
	.parse(Deno.args)

function render(input: string, obfuscator: Obfuscator): string {
	return obfuscator.obfuscateToParts(input)
		.map((p) => p.kind === 'obfuscated' ? bold(bgMagenta(p.content)) : p.content)
		.join('')
}

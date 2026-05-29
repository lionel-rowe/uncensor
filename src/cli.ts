import { Input } from '@cliffy/prompt'
import { Command } from '@cliffy/command'
import { Obfuscator } from './obfuscator.ts'
import { bgMagenta, bold } from '@std/fmt/colors'
import { decode, encode } from './encoding.ts'
import { distinctBy } from '@std/collections'
import defaultWordsJson from '../data/defaultWords.json' with { type: 'json' }

const words = defaultWordsJson.words.filter((x) => x != null).map(decode)
const obfuscator = new Obfuscator(words)

new Command()
	.name('uncensor')
	.description(
		'A tool to obfuscate suspected trigger words in text, making them less likely to be algorithmically censored, while remaining human-readable',
	)
	.arguments('[...args:string]')
	.action(async (_opts, ...args) => {
		if (args.length > 0) {
			console.info(render(args.join(' ')))
			return
		}

		do {
			const input = await Input.prompt('Text to uncensor')
			console.info(render(input))
		} while (Deno.stdin.isTerminal())
	})
	.command('edit', 'Edit the list of censored words')
	.action(async () => {
		const tmpFilePath = await Deno.makeTempFile({ suffix: '.txt' })
		await Deno.writeTextFile(tmpFilePath, words.join('\n'))

		await new Deno.Command(
			'edit',
			{ args: [tmpFilePath] },
		).spawn().output()

		const editedWords = distinctBy(
			(await Deno.readTextFile(tmpFilePath)).split('\n')
				.map((w) => w.trim()).filter(Boolean),
			(w) => w.toLowerCase(),
		)

		await Deno.writeTextFile(
			new URL('../data/defaultWords.json', import.meta.url),
			JSON.stringify({ ...defaultWordsJson, words: [...editedWords.map(encode), null] }, null, '\t') + '\n',
		)

		await Deno.remove(tmpFilePath)
	})
	.parse(Deno.args)

function render(input: string): string {
	return obfuscator.obfuscateToParts(input)
		.map((p) => p.kind === 'obfuscated' ? bold(bgMagenta(p.content)) : p.content)
		.join('')
}

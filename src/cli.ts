import { Input } from '@cliffy/prompt'
import { Command } from '@cliffy/command'
import { Obfuscator } from './main.ts'
import { bgMagenta, bold } from '@std/fmt/colors'
import { fromFileUrl } from '@std/path'

const obfuscator = new Obfuscator()

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
		await new Deno.Command(
			'edit',
			{ args: [fromFileUrl(import.meta.resolve('../data/words.txt'))] },
		).spawn().output()
	})
	.parse(Deno.args)

function render(input: string): string {
	return obfuscator.obfuscateToParts(input)
		.map((p) => p.kind === 'obfuscated' ? bold(bgMagenta(p.content)) : p.content)
		.join('')
}

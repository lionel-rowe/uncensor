import { Input } from '@cliffy/prompt'
import { Command } from '@cliffy/command'
import { Obfuscator } from './main.ts'
import { bgMagenta, bold } from '@std/fmt/colors'
import { fromFileUrl } from '@std/path'

const obfuscator = new Obfuscator()

new Command()
	.name('decensor')
	.description('Example command description')
	.action(async () => {
		while (true) {
			const input = await Input.prompt('Text to decensor')
			console.info(
				obfuscator.obfuscateToParts(input)
					.map((p) => p.kind === 'obfuscated' ? bold(bgMagenta(p.content)) : p.content)
					.join(''),
			)
		}
	})
	.command('edit', 'edit')
	.action(async () => {
		await new Deno.Command(
			'code',
			{ args: [fromFileUrl(import.meta.resolve('../data/words.txt'))] },
		).spawn().output()
	})
	.parse(Deno.args)

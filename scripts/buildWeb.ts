import { join, relative } from '@std/path'
import { assertEquals } from '@std/assert'
import { green, yellow } from '@std/fmt/colors'

await new Deno.Command(Deno.execPath(), {
	args: [
		'bundle',
		join('src', 'web.ts'),
		['-o', join('web', 'index.mjs')],
		['--format', 'esm'],
		// '--minify',
	].flat(),
}).spawn().output()

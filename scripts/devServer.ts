import { join } from '@std/path'
import { serveDir } from '@std/http/file-server'

await new Deno.Command(Deno.execPath(), {
	args: [
		'bundle',
		join('src', 'web', 'index.ts'),
		['-o', join('web', 'index.mjs')],
		['--format', 'esm'],
	].flat(),
}).spawn().output()

Deno.serve({
	port: 9999,
	handler(req) {
		return serveDir(req, {
			fsRoot: 'web',
			urlRoot: '',
		})
	},
})

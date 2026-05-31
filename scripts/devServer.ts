import { join } from '@std/path'
import { serveDir } from '@std/http/file-server'
import { exists } from '@std/fs'

const IS_DEV_MODE = !Deno.env.get('DENO_DEPLOY')
console.info(`Running in ${IS_DEV_MODE ? 'DEV' : 'PROD'} mode`)

const pathMap: Partial<Record<string, (outfile: string) => Promise<void> | void>> = {
	async '/index.mjs'(outFile: string) {
		const { denoPlugin } = await import('@deno/esbuild-plugin')
		const { build } = await import('esbuild')

		await build({
			entryPoints: [
				join('src', 'web', 'index.ts'),
			],
			bundle: true,
			outfile: outFile,
			platform: 'browser',
			format: 'esm',
			plugins: [denoPlugin()],
		})
	},
}

Deno.serve({
	port: 9999,
	async handler(req) {
		const url = new URL(req.url)
		const path = url.pathname

		if (Object.hasOwn(pathMap, path)) {
			const buildFn = pathMap[path]!
			const outPath = join('web', `.${path}`)
			if (IS_DEV_MODE || !(await exists(outPath))) {
				console.info(`Building ${path}...`)
				await buildFn(outPath)
			}
		}

		return serveDir(req, {
			fsRoot: 'web',
			urlRoot: '',
		})
	},
})

import { join } from '@std/path'
import { serveDir } from '@std/http/file-server'
import { exists } from '@std/fs'
import { STATUS_CODE } from '@std/http'
import markedAlert from 'marked-alert'
import { Marked } from 'marked'
import { CSS } from '@deno/gfm'

const IS_DEV_MODE = !Deno.env.get('DENO_DEPLOY')
console.info(`Running in ${IS_DEV_MODE ? 'DEV' : 'PROD'} mode`)

const buildFnsByPath: Partial<Record<string, (outfile: string) => Promise<void> | void>> = {
	async '/'() {
		const template = await Deno.readTextFile(join('src', 'web', 'index.html'))

		const marked = new Marked()
		marked.use(markedAlert())

		const instructions = `
			<link rel="stylesheet" href="gfm.css">
			<div data-color-mode="light" data-light-theme="light" data-dark-theme="dark" class="markdown-body">
				${marked.parse(await Deno.readTextFile(join('src', 'web', 'instructions.md')))}
			</div>
		`

		const html = template.replace(/<!--\s*INSTRUCTIONS\s*-->/, instructions)
		await Deno.writeTextFile(join('web', 'index.html'), html)
	},
	async '/gfm.css'() {
		await Deno.writeTextFile(join('web', 'gfm.css'), CSS)
	},
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
	async handler(req) {
		const staticResult = await serveDir(req, { fsRoot: 'static', urlRoot: '' })
		if (staticResult.status !== STATUS_CODE.NotFound) return staticResult

		const url = new URL(req.url)
		const path = url.pathname

		if (Object.hasOwn(buildFnsByPath, path)) {
			const buildFn = buildFnsByPath[path]!
			const outPath = join('web', `.${path === '/' ? '/index.html' : path}`)
			if (IS_DEV_MODE || !(await exists(outPath))) {
				console.info(`Building ${path}...`)
				await buildFn(outPath)
			}
		}

		return await serveDir(req, { fsRoot: 'web', urlRoot: '' })
	},
})

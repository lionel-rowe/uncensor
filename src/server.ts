import { join } from '@std/path'
import { serveDir } from '@std/http/file-server'
import { exists } from '@std/fs'
import { STATUS_CODE } from '@std/http'

const IS_DEV_MODE = !Deno.env.get('DENO_DEPLOY')
console.info(`Running in ${IS_DEV_MODE ? 'DEV' : 'PROD'} mode`)

const buildFnsByPath: Partial<Record<string, (outfile: string) => Promise<void> | void>> = {
	async '/'() {
		const { Marked } = await import('marked')
		const { default: markedAlert } = await import('marked-alert')
		const marked = new Marked()
		marked.use(markedAlert())

		const [template, instructions] = await Promise.all([
			Deno.readTextFile(join('src', 'web', 'index.html')),
			Deno.readTextFile(join('src', 'web', 'instructions.md')).then((x) => marked.parse(x)),
		])

		const replacement = `
			<link rel="stylesheet" href="gfm.css">
			<div data-color-mode="light" data-light-theme="light" data-dark-theme="dark" class="markdown-body">
				${instructions}
			</div>
		`

		const html = template.replace(/<!--\s*INSTRUCTIONS\s*-->/, replacement)
		await Deno.writeTextFile(join('web', 'index.html'), html)
	},
	async '/gfm.css'() {
		const { CSS } = await import('@deno/gfm')
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
		const { pathname } = url

		if (Object.hasOwn(buildFnsByPath, pathname)) {
			const buildFn = buildFnsByPath[pathname]!
			const outPath = join('web', `.${pathname === '/' ? '/index.html' : pathname}`)
			if (IS_DEV_MODE || !(await exists(outPath))) {
				console.info(`Building ${pathname}...`)
				await buildFn(outPath)
			}
		}

		return await serveDir(req, { fsRoot: 'web', urlRoot: '' })
	},
})

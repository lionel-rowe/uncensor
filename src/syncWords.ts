import { decode, encode } from './encoding.ts'
import { distinctBy } from '@std/collections'
import { debounce } from '@std/async/debounce'
import defaultWordsJson from '../data/defaultWords.json' with { type: 'json' }
import { exists } from '@std/fs/exists'
import { parseWords } from './parseWords.ts'

const DEBOUNCE_MS = 200
const PLAIN_FILE_PATH = './data/defaultWords.txt'
const OUT_FILE_PATH = './data/defaultWords.json'

const DEFAULT_PRELUDE = `# This file contains a list of words to decensor, one per line.
# Changes to this file will be reflected in defaultWords.json while the dev server is running.`

export async function syncWords() {
	if (!(await exists(PLAIN_FILE_PATH))) {
		await initTxt()
	}

	let editedWords = await getFromTxt()

	if (!editedWords.length) {
		await initTxt()
		editedWords = await getFromTxt()
	}

	await writeIfDiffed(
		OUT_FILE_PATH,
		JSON.stringify({ ...defaultWordsJson, words: [...editedWords.map(encode), null] }, null, '\t') + '\n',
	)
}

export async function watchWords() {
	const sync = debounce(syncWords, DEBOUNCE_MS)

	sync()

	for await (const event of Deno.watchFs(PLAIN_FILE_PATH)) {
		if (event.kind === 'modify') {
			sync()
		}
	}
}

async function initTxt() {
	await writeIfDiffed(
		PLAIN_FILE_PATH,
		DEFAULT_PRELUDE + '\n\n' + defaultWordsJson.words.filter((x) => x != null).map(decode).join('\n') + '\n',
	)
}

async function getFromTxt() {
	return distinctBy(
		parseWords(await Deno.readTextFile(PLAIN_FILE_PATH)),
		(w) => w.toLowerCase(),
	)
}

async function writeIfDiffed(path: string, content: string) {
	if (await exists(path)) {
		const existing = await Deno.readTextFile(path)
		if (existing === content) return
	}

	await Deno.writeTextFile(path, content)
}

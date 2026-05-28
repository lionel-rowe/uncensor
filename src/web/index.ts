/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { Obfuscator } from '../obfuscator.ts'
import { assert } from '@std/assert/assert'
import { type ChangeSpec, EditorState } from '@codemirror/state'
import { EditorView, placeholder } from '@codemirror/view'
import { type Diff, DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT, diff_match_patch } from '@dmsnell/diff-match-patch'
import { ls } from './localStorage.ts'
import { getRandomValuesSeeded, nextFloat64 } from '@std/random'

const DEFAULT_HASH = 'obfuscate'
const VALID_HASHES = new Set([DEFAULT_HASH, 'word-list'])

const SEED = crypto.getRandomValues(new BigUint64Array(1))[0]

function prng() {
	const gen = getRandomValuesSeeded(SEED)
	return () => nextFloat64(gen)
}

const dmp = new diff_match_patch()

type Mode = 'obfuscate' | 'deobfuscate'

const $wordListInput = getElementById('words', HTMLTextAreaElement)
const $textEditorHost = getElementById('text-input', HTMLDivElement)

$wordListInput.value = ls.get('uncensor:word-list') ?? ''

const $labelTextInput = getElementById('label-text-input', HTMLDivElement)
const textEditor = new EditorView({
	state: EditorState.create({
		doc: getInitialText(),
		extensions: [
			EditorView.lineWrapping,
			placeholder('Type text here...'),
			EditorView.contentAttributes.of({
				'aria-labelledby': $labelTextInput.id,
				'aria-multiline': 'true',
				role: 'textbox',
			}),
			EditorView.updateListener.of((update) => {
				if (!update.docChanged || isUpdating) return
				reapplyTransformation()
			}),
		],
	}),
	parent: $textEditorHost,
})

const obfuscator = createObfuscator()
const current = textEditor.state.doc.toString()
const plain = obfuscator.deobfuscate(current)
const next = transformText(plain)
patchEditorText(current, next)

let isUpdating = false

$wordListInput.addEventListener('input', () => {
	ls.set('uncensor:word-list', $wordListInput.value)
	reapplyTransformation()
})

function getInitialText(): string {
	const storedText = ls.get('uncensor:text-input')
	return storedText ?? ''
}

function getSelectedMode(): Mode {
	return getActiveHash() === 'deobfuscate' ? 'deobfuscate' : 'obfuscate'
}

function createObfuscator() {
	const words = $wordListInput.value.split(/[\n,]+/).map((word) => word.trim()).filter(Boolean)
	return new Obfuscator(words, { prng: prng() })
}

function transformText(text: string): string {
	const obfuscator = createObfuscator()
	const mode = getSelectedMode()
	return mode === 'obfuscate' ? obfuscator.obfuscate(text) : obfuscator.deobfuscate(text)
}

function reapplyTransformation() {
	const obfuscator = createObfuscator()
	const current = textEditor.state.doc.toString()
	const plain = obfuscator.deobfuscate(current)
	const next = transformText(plain)

	if (next !== current) {
		isUpdating = true
		try {
			patchEditorText(current, next)
		} finally {
			isUpdating = false
		}
	}

	ls.set('uncensor:text-input', plain)
}

function patchEditorText(currentText: string, nextText: string) {
	if (currentText === nextText) return

	const diffs = dmp.diff_main(currentText, nextText)
	const changes = diffsToChanges(diffs)
	if (changes.length === 0) return
	const currentSelection = textEditor.state.selection.main
	const mappedSelection = textEditor.state
		.changes(changes)
		.mapPos(currentSelection.head, 1)

	textEditor.dispatch({
		changes,
		selection: { anchor: mappedSelection },
	})
}

function diffsToChanges(diffs: Diff[]): ChangeSpec[] {
	const changes: ChangeSpec[] = []
	let offset = 0

	for (const diff of diffs) {
		const [op, text] = diff

		if (text.length === 0) continue

		switch (op) {
			case DIFF_EQUAL: {
				offset += text.length
				break
			}
			case DIFF_INSERT: {
				changes.push({
					from: offset,
					to: offset,
					insert: text,
				})
				break
			}
			case DIFF_DELETE: {
				changes.push({
					from: offset,
					to: offset + text.length,
					insert: '',
				})
				offset += text.length
				break
			}
		}
	}

	return changes
}

function getActiveHash() {
	const hash = location.hash.slice(1)
	return VALID_HASHES.has(hash) ? hash : DEFAULT_HASH
}

function applyHash() {
	const active = getActiveHash()

	if (location.href.endsWith('#')) {
		history.replaceState(null, '', location.href.slice(0, -1))
	}

	for (const id of VALID_HASHES) {
		const $tab = getElementById(`tab-${id}`)
		const $panel = getElementById(`panel-${id}`)
		const isActive = id === active

		$tab.setAttribute('aria-selected', String(isActive))
		$panel.hidden = !isActive
	}
}

globalThis.addEventListener('hashchange', applyHash)
applyHash()

function getElementById<T extends Element = HTMLElement>(
	id: string,
	// deno-lint-ignore no-explicit-any
	ExpectedClass: { new (...args: unknown[]): T } = HTMLElement as any,
): T {
	const el = document.getElementById(id)
	assert(el instanceof ExpectedClass, `Element with id "${id}" is not a ${ExpectedClass.name}`)
	return el
}

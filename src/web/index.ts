/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { Obfuscator } from '../obfuscator.ts'
import { assert } from '@std/assert/assert'
import { type ChangeSpec, EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, placeholder } from '@codemirror/view'
import { type Diff, DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT, diff_match_patch } from '@dmsnell/diff-match-patch'
import { ls } from './localStorage.ts'
import { getRandomValuesSeeded, nextFloat64 } from '@std/random'
import { StatelessRegExp } from '../utils.ts'

const DEFAULT_HASH = 'obfuscate'
const VALID_HASHES = [DEFAULT_HASH, 'deobfuscate', 'word-list'] as const
const validHashes = new Set<string>(VALID_HASHES)
const wordPartRe = new StatelessRegExp(/[^\p{P}\p{Z}\n]+/u)

const SEED = crypto.getRandomValues(new BigUint64Array(1))[0]

function prng() {
	const gen = getRandomValuesSeeded(SEED)
	return () => nextFloat64(gen)
}

const dmp = new diff_match_patch()

type Mode = 'obfuscate' | 'deobfuscate'
type HashView = (typeof VALID_HASHES)[number]

const transformedWordMark = Decoration.mark({ class: 'cm-transformed-target-word' })
const deobfuscatedTargetWordMark = Decoration.mark({ class: 'cm-target-word' })
const setTransformedWordHighlights = StateEffect.define<DecorationSet>()
const transformedWordHighlights = StateField.define<DecorationSet>({
	create() {
		return Decoration.none
	},
	update(highlights, tr) {
		highlights = highlights.map(tr.changes)

		for (const effect of tr.effects) {
			if (effect.is(setTransformedWordHighlights)) {
				return effect.value
			}
		}

		return highlights
	},
	provide: (f) => EditorView.decorations.from(f),
})

const $wordListInput = getElementById('words', HTMLTextAreaElement)
const $textEditorHost = getElementById('text-input', HTMLDivElement)

$wordListInput.value = ls.get('uncensor:word-list') ?? ''

const $labelTextInput = getElementById('label-text-input', HTMLDivElement)
const textEditor = new EditorView({
	state: EditorState.create({
		doc: getInitialText(),
		extensions: [
			EditorView.lineWrapping,
			transformedWordHighlights,
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
const mode = getSelectedMode()
const next = mode == null ? current : transformText(plain, obfuscator, mode)
patchEditorText(current, next)
refreshTransformedWordHighlights(next, obfuscator, mode)

let isUpdating = false

$wordListInput.addEventListener('input', () => {
	ls.set('uncensor:word-list', $wordListInput.value)
	reapplyTransformation()
})

function getInitialText(): string {
	const storedText = ls.get('uncensor:text-input')
	return storedText ?? ''
}

function getSelectedMode(): Mode | undefined {
	const hash = getActiveHash()
	return hash === 'word-list' ? undefined : hash
}

function createObfuscator() {
	const words = $wordListInput.value.split(/[\n,]+/).map((word) => word.trim()).filter(Boolean)
	return new Obfuscator(words, { prng: prng() })
}

function transformText(text: string, obfuscator: Obfuscator, mode: Mode): string {
	return mode === 'obfuscate' ? obfuscator.obfuscate(text) : obfuscator.deobfuscate(text)
}

function reapplyTransformation() {
	const obfuscator = createObfuscator()
	const current = textEditor.state.doc.toString()
	const plain = obfuscator.deobfuscate(current)
	const mode = getSelectedMode()
	const next = mode == null ? current : transformText(plain, obfuscator, mode)

	if (next !== current) {
		isUpdating = true
		try {
			patchEditorText(current, next)
		} finally {
			isUpdating = false
		}
	}

	refreshTransformedWordHighlights(next, obfuscator, mode)

	ls.set('uncensor:text-input', plain)
}

function refreshTransformedWordHighlights(transformedText: string, obfuscator: Obfuscator, mode = getSelectedMode()) {
	textEditor.dispatch({
		effects: setTransformedWordHighlights.of(createTransformedWordHighlights(transformedText, obfuscator, mode)),
	})
}

function createTransformedWordHighlights(
	transformedText: string,
	obfuscator: Obfuscator,
	mode = getSelectedMode(),
): DecorationSet {
	if (mode == null) return Decoration.none

	const ranges = new RangeSetBuilder<Decoration>()

	for (const x of transformedText.matchAll(wordPartRe.asStateful('g'))) {
		const word = x[0]
		const start = x.index
		if (mode === 'obfuscate' && obfuscator.isObfuscated(word)) {
			ranges.add(start, start + word.length, transformedWordMark)
		}
		if (mode === 'deobfuscate' && obfuscator.isTargetWord(word)) {
			ranges.add(start, start + word.length, deobfuscatedTargetWordMark)
		}
	}

	return ranges.finish()
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
	return validHashes.has(hash) ? hash as HashView : DEFAULT_HASH
}

function applyHash() {
	const active = getActiveHash()

	if (location.href.endsWith('#')) {
		history.replaceState(null, '', location.href.slice(0, -1))
	}

	for (const id of VALID_HASHES) {
		const $tab = getElementById(`tab-${id}`)
		const isActive = id === active

		$tab.setAttribute('aria-selected', String(isActive))
	}

	const $textPanel = getElementById('panel-obfuscate')
	const $wordListPanel = getElementById('panel-word-list')
	const isWordListActive = active === 'word-list'
	$textPanel.hidden = isWordListActive
	$wordListPanel.hidden = !isWordListActive

	reapplyTransformation()
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

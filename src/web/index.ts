/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { Obfuscator } from '../obfuscator.ts'
import { assert } from '@std/assert/assert'
import { type ChangeSpec, Compartment, EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, placeholder } from '@codemirror/view'
import { type Diff, DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT, diff_match_patch } from '@dmsnell/diff-match-patch'
import { ls } from './localStorage.ts'
import { getRandomValuesSeeded, nextFloat64 } from '@std/random'
import { StatelessRegExp } from '../utils.ts'
import defaultWordsJson from '../../data/defaultWords.json' with { type: 'json' }
import { decode } from '../encoding.ts'

const DEFAULT_HASH = 'instructions' as const
const VALID_HASHES = [DEFAULT_HASH, 'obfuscate', 'revert', 'word-list'] as const
const validHashes = new Set<string>(VALID_HASHES)
const wordPartRe = new StatelessRegExp(/[^\p{P}\p{Z}\n]+/u)

const SEED = crypto.getRandomValues(new BigUint64Array(1))[0]

function prng() {
	const gen = getRandomValuesSeeded(SEED)
	return () => nextFloat64(gen)
}

const dmp = new diff_match_patch()

type Mode = 'obfuscate' | 'revert'
type HashView = (typeof VALID_HASHES)[number]

const transformedWordMark = Decoration.mark({ class: 'cm-transformed-target-word' })
const deobfuscatedTargetWordMark = Decoration.mark({ class: 'cm-target-word' })
const placeholderCompartment = new Compartment()
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
const $includeDefaultWordsInput = getElementById('include-default-words', HTMLInputElement)
const $textEditorHost = getElementById('text-input', HTMLDivElement)
const defaultWords = defaultWordsJson.words.filter((x) => x != null).map(decode)

$wordListInput.value = ls.get('word-list') ?? ''
$includeDefaultWordsInput.checked = getIncludeDefaultWordList()

function createPlaceholder(mode: Mode) {
	return `Type text to ${mode} here...`
}

const $labelTextInput = getElementById('label-text-input', HTMLDivElement)
const textEditor = new EditorView({
	state: EditorState.create({
		doc: getInitialText(),
		extensions: [
			EditorView.lineWrapping,
			transformedWordHighlights,
			placeholderCompartment.of(placeholder(createPlaceholder('obfuscate'))),
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

textEditor.scrollDOM.addEventListener('click', (event) => {
	if (event.defaultPrevented || event.button !== 0) return

	const pos = textEditor.posAtCoords({
		x: event.clientX,
		y: event.clientY,
	})

	textEditor.dispatch({
		selection: {
			anchor: pos ?? textEditor.state.doc.length,
		},
		scrollIntoView: true,
	})

	textEditor.focus()
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
	ls.set('word-list', $wordListInput.value)
	reapplyTransformation()
})

$includeDefaultWordsInput.addEventListener('change', () => {
	ls.set('include-default-word-list', $includeDefaultWordsInput.checked ? '1' : '0')
	reapplyTransformation()
})

function getInitialText(): string {
	const storedText = ls.get('text-input')
	return storedText ?? ''
}

function getSelectedMode(): Mode | undefined {
	const hash = getActiveHash()
	switch (hash) {
		case 'obfuscate':
		case 'revert':
			return hash
		default:
			return undefined
	}
}

function createObfuscator() {
	const customWords = $wordListInput.value.split(/[\n,]+/).map((word) => word.trim()).filter(Boolean)
	const words = $includeDefaultWordsInput.checked ? [...new Set([...defaultWords, ...customWords])] : customWords
	return new Obfuscator(words, { prng: prng() })
}

function getIncludeDefaultWordList(): boolean {
	const stored = ls.get('include-default-word-list')
	if (stored == null) return true
	return stored === '1'
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

	ls.set('text-input', plain)
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
		if (mode === 'revert' && obfuscator.isTargetWord(word)) {
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

	const $instructionsPanel = getElementById('panel-instructions')
	const $textPanel = getElementById('panel-obfuscate')
	const $wordListPanel = getElementById('panel-word-list')
	$textPanel.hidden = active !== 'obfuscate' && active !== 'revert'
	$wordListPanel.hidden = active !== 'word-list'
	$instructionsPanel.hidden = active !== 'instructions'

	textEditor.dispatch({
		effects: placeholderCompartment.reconfigure(
			placeholder(createPlaceholder(active === 'revert' ? 'revert' : 'obfuscate')),
		),
	})

	if (active === 'instructions') {
		ls.set('has-viewed-instructions', 'true')
	} else if (!ls.get('has-viewed-instructions')) {
		const url = new URL(location.href)
		url.hash = ''
		location.replace(url)
		return
	}

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

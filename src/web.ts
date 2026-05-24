/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { Obfuscator } from './obfuscator.ts'
import { assert } from '@std/assert/assert'
import { throttle } from '@std/async/unstable-throttle'

type EditSource = 'plain' | 'obfuscated'

type OffsetRange = readonly [start: number, end: number]

type HighlightRegistryLike = {
	set(name: string, highlight: unknown): void
	delete(name: string): void
}

const PLAIN_HIGHLIGHT_NAME = 'target-plain'
const OBFUSCATED_HIGHLIGHT_NAME = 'target-obfuscated'

const $wordListInput = getElementById('words', HTMLTextAreaElement)
const $plainEditor = getElementById('plain-input', HTMLDivElement)
const $obfuscatedEditor = getElementById('obfuscated-input', HTMLDivElement)
const $copyObfuscatedButton = getElementById('copy-obfuscated', HTMLButtonElement)

$wordListInput.value = localStorage.getItem('uncensor:word-list') ?? localStorage.getItem('uncensor:words') ?? ''
setEditorText(
	$plainEditor,
	localStorage.getItem('uncensor:plain-input') ?? localStorage.getItem('uncensor:plain-input') ?? '',
)
setEditorText(
	$obfuscatedEditor,
	localStorage.getItem('uncensor:obfuscated-input') ?? localStorage.getItem('uncensor:obfuscated-input') ?? '',
)
let lastEdited: EditSource = localStorage.getItem('uncensor:last-edited-side') === 'obfuscated' ||
		localStorage.getItem('uncensor:last-edited-side') === 'deobfuscate' ||
		localStorage.getItem('uncensor:last-edited') === 'deobfuscate'
	? 'obfuscated'
	: 'plain'

$wordListInput.addEventListener('input', () => localStorage.setItem('uncensor:word-list', $wordListInput.value))
$plainEditor.addEventListener('input', () => localStorage.setItem('uncensor:plain-input', getEditorText($plainEditor)))
$obfuscatedEditor.addEventListener('input', () => {
	localStorage.setItem('uncensor:obfuscated-input', getEditorText($obfuscatedEditor))
})

$copyObfuscatedButton.addEventListener('click', async () => {
	const text = getEditorText($obfuscatedEditor)
	if (await copyText(text)) {
		const originalLabel = $copyObfuscatedButton.textContent ?? 'Copy'
		$copyObfuscatedButton.textContent = 'Copied!'
		globalThis.setTimeout(() => {
			$copyObfuscatedButton.textContent = originalLabel
		}, 3000)
	}
})

function createObfuscator() {
	const words = $wordListInput.value.split(/[\n,]+/).map((w) => w.trim()).filter(Boolean)
	return new Obfuscator(words)
}

function getTargetRanges(obfuscator: Obfuscator, plainText: string): {
	plainRanges: OffsetRange[]
	obfuscatedRanges: OffsetRange[]
} {
	const plainRanges: OffsetRange[] = []
	const obfuscatedRanges: OffsetRange[] = []
	let obfuscatedOffset = 0

	for (const part of obfuscator.obfuscateToParts(plainText)) {
		const nextOffset = obfuscatedOffset + part.content.length
		if (part.kind === 'obfuscated') {
			plainRanges.push([part.start, part.end])
			obfuscatedRanges.push([obfuscatedOffset, nextOffset])
		}

		obfuscatedOffset = nextOffset
	}

	return { plainRanges, obfuscatedRanges }
}

function updateHighlights(obfuscator: Obfuscator) {
	if (!supportsCustomHighlight()) return

	try {
		const plainText = getEditorText($plainEditor)
		const { plainRanges, obfuscatedRanges } = getTargetRanges(obfuscator, plainText)

		applyHighlight(PLAIN_HIGHLIGHT_NAME, $plainEditor, plainRanges)
		applyHighlight(OBFUSCATED_HIGHLIGHT_NAME, $obfuscatedEditor, obfuscatedRanges)
	} catch (e) {
		// swallow any error and log to console
		console.error(e)
	}
}

function supportsCustomHighlight(): boolean {
	return typeof globalThis.CSS?.highlights === 'object' && typeof globalThis.Highlight === 'function'
}

function getEditorText(editor: HTMLDivElement): string {
	return editor.textContent ?? ''
}

function setEditorText(editor: HTMLDivElement, value: string) {
	editor.textContent = value
}

async function copyText(text: string): Promise<boolean> {
	if (globalThis.isSecureContext && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text)
			return true
		} catch {
			// fallback below
		}
	}

	const $temp = document.createElement('textarea')
	$temp.value = text
	$temp.setAttribute('readonly', 'true')
	$temp.style.position = 'fixed'
	$temp.style.opacity = '0'
	document.body.append($temp)
	$temp.select()
	const copied = document.execCommand('copy')
	$temp.remove()
	return copied
}

function applyHighlight(name: string, $el: HTMLElement, ranges: OffsetRange[]) {
	$el.normalize() // merge adjacent text nodes to simplify range calculations
	if ($el.childNodes.length > 1) {
		// clobber any unexpected element nodes (should be just a single text node)
		// deno-lint-ignore no-self-assign
		$el.textContent = $el.textContent
	}

	const registry = getHighlightRegistry()
	if (!registry) return

	registry.delete(name)
	if (ranges.length === 0) return

	const indexedNodes = indexTextNodes($el)
	if (indexedNodes.length === 0) return

	const textLength = indexedNodes[indexedNodes.length - 1].end
	const validRanges = ranges.filter(([start, end]) => {
		return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start < end && end <= textLength
	})

	if (validRanges.length === 0) return

	const highlightRanges = validRanges.map(([start, end]) => {
		const startPosition = locateTextPosition(indexedNodes, start)
		const endPosition = locateTextPosition(indexedNodes, end)
		assert(startPosition != null && endPosition != null, 'Highlight range position must exist')

		const range = new Range()
		range.setStart(startPosition.node, startPosition.offset)
		range.setEnd(endPosition.node, endPosition.offset)
		return range
	})

	const HighlightCtor = globalThis.Highlight as new (...ranges: Range[]) => unknown
	registry.set(name, new HighlightCtor(...highlightRanges))
}

function getHighlightRegistry(): HighlightRegistryLike | null {
	const cssWithHighlights = CSS as unknown as { highlights?: HighlightRegistryLike }
	return cssWithHighlights.highlights ?? null
}

type IndexedTextNode = {
	node: Text
	start: number
	end: number
}

function indexTextNodes(root: HTMLElement): IndexedTextNode[] {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
	const nodes: IndexedTextNode[] = []
	let offset = 0

	while (true) {
		const next = walker.nextNode()
		if (!(next instanceof Text)) break

		const length = next.data.length
		if (length === 0) continue

		nodes.push({ node: next, start: offset, end: offset + length })
		offset += length
	}

	return nodes
}

function locateTextPosition(
	nodes: IndexedTextNode[],
	index: number,
): { node: Text; offset: number } | null {
	for (const part of nodes) {
		if (index < part.end) {
			return { node: part.node, offset: index - part.start }
		}
	}

	const last = nodes.at(-1)
	if (!last) return null
	if (index === last.end) return { node: last.node, offset: last.node.length }

	return null
}

const syncFromPlain = throttle(
	() => {
		const obfuscator = createObfuscator()
		setEditorText($obfuscatedEditor, obfuscator.obfuscate(getEditorText($plainEditor)))
		localStorage.setItem('uncensor:obfuscated-input', getEditorText($obfuscatedEditor))
		updateHighlights(obfuscator)
	},
	(previousDuration: number) => previousDuration,
	{ ensureLastCall: true },
)

const syncFromObfuscated = throttle(
	() => {
		const obfuscator = createObfuscator()
		setEditorText($plainEditor, obfuscator.deobfuscate(getEditorText($obfuscatedEditor)))
		localStorage.setItem('uncensor:plain-input', getEditorText($plainEditor))
		updateHighlights(obfuscator)
	},
	(previousDuration: number) => previousDuration,
	{ ensureLastCall: true },
)

$plainEditor.addEventListener('input', () => {
	lastEdited = 'plain'
	localStorage.setItem('uncensor:last-edited-side', lastEdited)
	syncFromPlain()
})

$obfuscatedEditor.addEventListener('input', () => {
	lastEdited = 'obfuscated'
	localStorage.setItem('uncensor:last-edited-side', lastEdited)
	syncFromObfuscated()
})

$wordListInput.addEventListener('input', () => {
	if (lastEdited === 'obfuscated') {
		syncFromObfuscated()
	} else {
		syncFromPlain()
	}
})

if (lastEdited === 'obfuscated') {
	syncFromObfuscated()
} else {
	syncFromPlain()
}

const VALID_HASHES = new Set(['obfuscate', 'edit-words'])
const DEFAULT_HASH = 'obfuscate'

function getActiveHash() {
	const hash = location.hash.slice(1)
	return VALID_HASHES.has(hash) ? hash : DEFAULT_HASH
}

function applyHash() {
	const active = getActiveHash()

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
	Expect: { new (...args: unknown[]): T } = HTMLElement as any,
): T {
	const el = document.getElementById(id)
	assert(el instanceof Expect, `Element with id "${id}" is not a ${Expect.name}`)
	return el
}

// fix for contenteditable vs textarea
for (const $labeledBy of document.querySelectorAll('.editor[aria-labelledby]')) {
	if (!($labeledBy instanceof HTMLElement)) continue
	const labelId = $labeledBy.getAttribute('aria-labelledby')!
	const $label = document.getElementById(labelId)
	if ($label == null) continue

	$label.addEventListener('click', () => {
		$labeledBy.focus()
	})
}

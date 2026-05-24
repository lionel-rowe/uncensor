/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { Obfuscator } from './obfuscator.ts'
import { assert } from '@std/assert/assert'
import { throttle } from '@std/async/unstable-throttle'

type EditSource = 'plain' | 'obfuscated'

const $words = getElementById('words', HTMLTextAreaElement)
const $plainInput = getElementById('obf-input', HTMLTextAreaElement)
const $obfuscatedInput = getElementById('deobf-input', HTMLTextAreaElement)

$words.value = localStorage.getItem('uncensor:word-list') ?? localStorage.getItem('uncensor:words') ?? ''
$plainInput.value = localStorage.getItem('uncensor:plain-input') ?? localStorage.getItem('uncensor:obf-input') ?? ''
$obfuscatedInput.value = localStorage.getItem('uncensor:obfuscated-input') ??
	localStorage.getItem('uncensor:deobf-input') ?? ''
let lastEdited: EditSource = localStorage.getItem('uncensor:last-edited-side') === 'obfuscated' ||
		localStorage.getItem('uncensor:last-edited-side') === 'deobfuscate' ||
		localStorage.getItem('uncensor:last-edited') === 'deobfuscate'
	? 'obfuscated'
	: 'plain'

$words.addEventListener('input', () => localStorage.setItem('uncensor:word-list', $words.value))
$plainInput.addEventListener('input', () => localStorage.setItem('uncensor:plain-input', $plainInput.value))
$obfuscatedInput.addEventListener(
	'input',
	() => localStorage.setItem('uncensor:obfuscated-input', $obfuscatedInput.value),
)

// ── Obfuscator helpers ────────────────────────────────────────────────────────

function createObfuscator() {
	const words = $words.value.split(/[\n,]+/).map((w) => w.trim()).filter(Boolean)
	return new Obfuscator(words)
}

const syncFromPlain = throttle(
	() => {
		const obfuscator = createObfuscator()
		$obfuscatedInput.value = obfuscator.obfuscate($plainInput.value)
		localStorage.setItem('uncensor:obfuscated-input', $obfuscatedInput.value)
	},
	(previousDuration: number) => previousDuration,
	{ ensureLastCall: true },
)

const syncFromObfuscated = throttle(
	() => {
		const obfuscator = createObfuscator()
		$plainInput.value = obfuscator.deobfuscate($obfuscatedInput.value)
		localStorage.setItem('uncensor:plain-input', $plainInput.value)
	},
	(previousDuration: number) => previousDuration,
	{ ensureLastCall: true },
)

$plainInput.addEventListener('input', () => {
	lastEdited = 'plain'
	localStorage.setItem('uncensor:last-edited-side', lastEdited)
	syncFromPlain()
})

$obfuscatedInput.addEventListener('input', () => {
	lastEdited = 'obfuscated'
	localStorage.setItem('uncensor:last-edited-side', lastEdited)
	syncFromObfuscated()
})

$words.addEventListener('input', () => {
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

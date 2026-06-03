export function parseWords(txt: string) {
	return txt.split('\n').flatMap((x) => {
		const trimmed = x.trim()
		if (!trimmed || trimmed.startsWith('#') || '') return null

		return trimmed.split(',').map((x) => {
			const trimmed = x.trim()
			if (!trimmed) return null
			return trimmed
		})
	}).filter((x) => x != null)
}

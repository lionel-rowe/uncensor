type LsKey = 'word-list' | 'text-input' | 'mode' | 'include-default-word-list' | 'has-viewed-instructions'

const PREFIX = 'uncensor::'

export const ls = {
	get(key: LsKey) {
		return localStorage.getItem(PREFIX + key) ?? null
	},
	set(key: LsKey, value: string) {
		localStorage.setItem(PREFIX + key, value)
	},
	remove(key: LsKey) {
		localStorage.removeItem(PREFIX + key)
	},
}

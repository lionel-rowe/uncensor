type LsKeySuffix = 'word-list' | 'text-input' | 'mode'
type LsKey = `uncensor:${LsKeySuffix}`
export const ls = {
	get(key: LsKey) {
		return localStorage.getItem(key) ?? null
	},
	set(key: LsKey, value: string) {
		localStorage.setItem(key, value)
	},
	remove(key: LsKey) {
		localStorage.removeItem(key)
	},
}

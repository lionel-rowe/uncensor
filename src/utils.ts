import { assert } from '@std/assert/assert'

type StatelessFlags = `${'d' | ''}${'i' | ''}${'m' | ''}${'s' | ''}${'u' | 'v' | ''}`
type StatefulFlags = `${'g' | ''}${'y' | ''}`
export class StatelessRegExp extends RegExp {
	constructor(pattern: string | RegExp, flags?: StatelessFlags) {
		flags ??= typeof pattern === 'string' ? '' : pattern.flags as StatelessFlags
		assert(!/[gy]/.test(flags))
		super(pattern, flags)
	}

	asStateful(flags: StatefulFlags): RegExp {
		return new RegExp(this.source, this.flags + flags)
	}
}

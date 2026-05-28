import { execCommand } from './execCommand.ts'

Deno.test('execCommand types', () => {
	checkTypes(() => {
		execCommand('bold')
		// @ts-expect-error !
		execCommand('bold', 3)
		execCommand('fontSize', 3)
		// @ts-expect-error !
		execCommand('fontSize', '3')

		execCommand('insertText', 'text')
		// @ts-expect-error !
		execCommand('insertText')
		// @ts-expect-error !
		execCommand('insertText', 3)
	})
})

/**
 * Check types without actually calling the code. This is useful for testing types of code without causing any
 * side-effects or requiring mocks for unavailable APIs (e.g. DOM APIs).
 *
 * @param fn The function to check types of. This function will not be called, it's only for type checking.
 */
// deno-lint-ignore no-unused-vars
function checkTypes(fn: () => void) {
	// do nothing, just check types
}

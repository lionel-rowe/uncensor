/// <reference lib="dom" />

type ExecCommandMap = {
	backColor: string
	bold: undefined
	contentReadOnly: boolean
	copy: undefined
	createLink: string
	cut: undefined
	decreaseFontSize: undefined
	defaultParagraphSeparator: string
	delete: undefined
	enableAbsolutePositionEditor: boolean
	enableInlineTableEditing: boolean
	enableObjectResizing: boolean
	fontName: string
	fontSize: 1 | 2 | 3 | 4 | 5 | 6 | 7
	foreColor: string
	formatBlock: string
	forwardDelete: undefined
	heading: `H${1 | 2 | 3 | 4 | 5 | 6}`
	hiliteColor: string
	increaseFontSize: undefined
	indent: undefined
	insertBrOnReturn: boolean
	insertHorizontalRule: undefined
	insertHTML: string
	insertImage: string
	insertLineBreak: undefined
	insertOrderedList: undefined
	insertUnorderedList: undefined
	insertParagraph: undefined
	insertText: string
	italic: undefined
	justifyCenter: undefined
	justifyFull: undefined
	justifyLeft: undefined
	justifyRight: undefined
	outdent: undefined
	paste: undefined
	redo: undefined
	removeFormat: undefined
	selectAll: undefined
	strikeThrough: undefined
	subscript: undefined
	superscript: undefined
	underline: undefined
	undo: undefined
	unlink: undefined
	/** @deprecated */
	useCSS: boolean
	styleWithCSS: boolean
	AutoUrlDetect: boolean
	showDefaultUI: boolean
}

export function execCommand<K extends keyof ExecCommandMap>(
	commandId: K,
	...[value]: ExecCommandMap[K] extends undefined ? []
		: [value: ExecCommandMap[K]]
): boolean {
	return document.execCommand(commandId, false, value as string | undefined)
}

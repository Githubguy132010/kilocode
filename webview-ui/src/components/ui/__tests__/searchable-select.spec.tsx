import type { ReactNode } from "react"

import { fireEvent, render, screen } from "@/utils/test-utils"

import { SearchableSelect } from "../searchable-select"

vi.mock("@/hooks/useEscapeKey", () => ({
	useEscapeKey: vi.fn(),
}))

vi.mock("@/components/ui", () => ({
	Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
	Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CommandEmpty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CommandInput: ({ onValueChange, ...props }: any) => (
		<input
			{...props}
			onChange={(event) => {
				onValueChange?.((event.target as HTMLInputElement).value)
			}}
		/>
	),
	CommandItem: ({ children, className, onSelect, onMouseEnter, ...props }: any) => (
		<div className={className} onClick={() => onSelect?.("")} onMouseEnter={onMouseEnter} {...props}>
			{children}
		</div>
	),
	CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

describe("SearchableSelect", () => {
	const options = [
		{ value: "a", label: "Alpha" },
		{ value: "b", label: "Beta" },
		{ value: "c", label: "Gamma" },
	]

	it("selects the next option with ArrowDown + Enter", () => {
		const onValueChange = vi.fn()

		render(
			<SearchableSelect
				value="a"
				onValueChange={onValueChange}
				options={options}
				placeholder="Select"
				searchPlaceholder="Search"
				emptyMessage="No results"
			/>,
		)

		const input = screen.getByPlaceholderText("Search")
		fireEvent.keyDown(input, { key: "ArrowDown" })
		fireEvent.keyDown(input, { key: "Enter" })

		expect(onValueChange).toHaveBeenCalledWith("b")
	})

	it("skips disabled options during keyboard navigation", () => {
		const onValueChange = vi.fn()

		render(
			<SearchableSelect
				value="a"
				onValueChange={onValueChange}
				options={[
					{ value: "a", label: "Alpha" },
					{ value: "b", label: "Beta", disabled: true },
					{ value: "c", label: "Gamma" },
				]}
				placeholder="Select"
				searchPlaceholder="Search"
				emptyMessage="No results"
			/>,
		)

		const input = screen.getByPlaceholderText("Search")
		fireEvent.keyDown(input, { key: "ArrowDown" })
		fireEvent.keyDown(input, { key: "Enter" })

		expect(onValueChange).toHaveBeenCalledWith("c")
	})
})

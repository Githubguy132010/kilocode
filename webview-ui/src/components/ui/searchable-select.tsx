import * as React from "react"
import { Check, ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
	Button,
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui"
import { useEscapeKey } from "@/hooks/useEscapeKey"

export interface SearchableSelectOption {
	value: string
	label: string
	disabled?: boolean
	icon?: React.ReactNode
}

interface SearchableSelectProps {
	value?: string
	onValueChange: (value: string) => void
	options: SearchableSelectOption[]
	placeholder: string
	searchPlaceholder: string
	emptyMessage: string
	className?: string
	disabled?: boolean
	"data-testid"?: string
}

export function SearchableSelect({
	value,
	onValueChange,
	options,
	placeholder,
	searchPlaceholder,
	emptyMessage,
	className,
	disabled,
	"data-testid": dataTestId,
}: SearchableSelectProps) {
	const [open, setOpen] = React.useState(false)
	const [searchValue, setSearchValue] = React.useState("")
	const [highlightedIndex, setHighlightedIndex] = React.useState(-1) // kilocode_change
	const searchInputRef = React.useRef<HTMLInputElement>(null)
	const searchResetTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
	const isMountedRef = React.useRef(true)

	// Find the selected option
	const selectedOption = options.find((option) => option.value === value)

	// Filter options based on search
	const filteredOptions = React.useMemo(() => {
		if (!searchValue) return options
		return options.filter((option) => option.label.toLowerCase().includes(searchValue.toLowerCase()))
	}, [options, searchValue])

	// kilocode_change start - keyboard navigation and selection support in searchable dropdown
	const enabledFilteredOptions = React.useMemo(
		() => filteredOptions.filter((option) => !option.disabled),
		[filteredOptions],
	)

	const getDefaultHighlightedIndex = React.useCallback(() => {
		if (enabledFilteredOptions.length === 0) {
			return -1
		}

		if (value) {
			const selectedEnabledOptionIndex = enabledFilteredOptions.findIndex((option) => option.value === value)
			if (selectedEnabledOptionIndex !== -1) {
				return selectedEnabledOptionIndex
			}
		}

		return 0
	}, [enabledFilteredOptions, value])
	// kilocode_change end

	// Cleanup timeout on unmount
	React.useEffect(() => {
		return () => {
			isMountedRef.current = false
			if (searchResetTimeoutRef.current) {
				clearTimeout(searchResetTimeoutRef.current)
			}
		}
	}, [])

	// Reset search when value changes
	React.useEffect(() => {
		const timeoutId = setTimeout(() => {
			if (isMountedRef.current) {
				setSearchValue("")
			}
		}, 100)
		return () => clearTimeout(timeoutId)
	}, [value])

	// Use the shared ESC key handler hook
	useEscapeKey(open, () => setOpen(false))

	const handleOpenChange = (open: boolean) => {
		setOpen(open)
		setHighlightedIndex(open ? getDefaultHighlightedIndex() : -1) // kilocode_change
		// Reset search when closing
		if (!open) {
			if (searchResetTimeoutRef.current) {
				clearTimeout(searchResetTimeoutRef.current)
			}
			searchResetTimeoutRef.current = setTimeout(() => setSearchValue(""), 100)
		}
	}

	const handleSelect = (selectedValue: string) => {
		setOpen(false)
		onValueChange(selectedValue)
	}

	const handleClearSearch = () => {
		setSearchValue("")
		searchInputRef.current?.focus()
	}

	// kilocode_change start - keyboard navigation and selection support in searchable dropdown
	const handleSearchValueChange = (nextSearchValue: string) => {
		setSearchValue(nextSearchValue)
		setHighlightedIndex(0)
	}

	const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (enabledFilteredOptions.length === 0) {
			return
		}

		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault()
			const direction = event.key === "ArrowDown" ? 1 : -1
			const safeIndex = highlightedIndex === -1 ? 0 : highlightedIndex
			const nextIndex = (safeIndex + direction + enabledFilteredOptions.length) % enabledFilteredOptions.length
			setHighlightedIndex(nextIndex)
			return
		}

		if (event.key === "Enter" && highlightedIndex >= 0) {
			event.preventDefault()
			const highlightedOption = enabledFilteredOptions[highlightedIndex]
			if (highlightedOption) {
				handleSelect(highlightedOption.value)
			}
		}
	}
	// kilocode_change end

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className={cn(
						"w-full justify-between font-normal",
						"h-7 px-3 py-2",
						"border border-vscode-dropdown-border",
						"bg-vscode-dropdown-background hover:bg-transparent",
						"text-vscode-dropdown-foreground",
						"focus-visible:border-vscode-focusBorder",
						"aria-expanded:border-vscode-focusBorder",
						!selectedOption && "text-muted-foreground",
						className,
					)}
					data-testid={dataTestId}>
					<span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
					<ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
				<Command>
					<div className="relative">
						<CommandInput
							ref={searchInputRef}
							value={searchValue}
							onValueChange={handleSearchValueChange}
							onKeyDown={handleInputKeyDown}
							placeholder={searchPlaceholder}
							className="h-9 mr-4"
						/>
						{searchValue.length > 0 && (
							<div
								className="absolute right-2 top-0 bottom-0 flex items-center justify-center"
								data-testid="clear-search-button"
								onClick={handleClearSearch}>
								<X className="text-vscode-input-foreground opacity-50 hover:opacity-100 size-4 p-0.5 cursor-pointer" />
							</div>
						)}
					</div>
					<CommandList>
						<CommandEmpty>
							{searchValue && <div className="py-2 px-1 text-sm">{emptyMessage}</div>}
						</CommandEmpty>
						<CommandGroup>
							{filteredOptions.map((option) => {
								const enabledOptionIndex = enabledFilteredOptions.findIndex(
									(enabledOption) => enabledOption.value === option.value,
								)
								const isHighlighted = enabledOptionIndex === highlightedIndex && !option.disabled

								return (
									<CommandItem
										key={option.value}
										value={option.label}
										onSelect={() => handleSelect(option.value)}
										onMouseEnter={() => !option.disabled && setHighlightedIndex(enabledOptionIndex)}
										disabled={option.disabled}
										className={cn(
											option.disabled && "text-vscode-errorForeground",
											isHighlighted && "bg-accent text-accent-foreground",
										)}>
										<div className="flex items-center">
											{option.icon}
											{option.label}
										</div>
										<Check
											className={cn(
												"ml-auto h-4 w-4 p-0.5",
												value === option.value ? "opacity-100" : "opacity-0",
											)}
										/>
									</CommandItem>
								)
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}

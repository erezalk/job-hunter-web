import { Autocomplete, TextField } from '@mui/material'

// Free-text input with a suggestion dropdown (MUI Autocomplete freeSolo). The
// typed text is the value; suggestions never restrict it.
export function SuggestField({
  label,
  value,
  options,
  onChange,
  error,
  helperText,
  disabled,
  placeholder,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  error?: boolean
  helperText?: string
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <Autocomplete
      freeSolo
      forcePopupIcon
      openOnFocus
      size="small"
      fullWidth
      options={options}
      value={value}
      inputValue={value}
      onInputChange={(_event, next) => onChange(next)}
      disabled={disabled}
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={placeholder} error={error} helperText={helperText} />
      )}
    />
  )
}

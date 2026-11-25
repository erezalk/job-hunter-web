import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Alert, Box, Button, IconButton, Paper, TextField, Tooltip, Typography } from '@mui/material'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addExcludedCompany,
  fetchExcludedCompanies,
  removeExcludedCompany,
  renameExcludedCompany,
  type ExcludedCompany,
} from '../../api/excludedCompanies'
import { formErrors } from '../../api/formErrors'

const EXCLUDED_COMPANIES_KEY = ['excludedCompanies']
const NAME_MAX_LENGTH = 255
const EMPTY_NAME = 'Enter a company name.'

// Same rule as the server: trimmed, inner whitespace collapsed, compared ignoring case.
function normalize(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function duplicateOf(name: string, companies: ExcludedCompany[], exceptId?: number): ExcludedCompany | undefined {
  const key = normalize(name).toLowerCase()
  return companies.find((c) => c.id !== exceptId && c.name.toLowerCase() === key)
}

function alreadyExcluded(company: ExcludedCompany): string {
  return `“${company.name}” is already in your excluded companies.`
}

// The server's message for the name field (400 empty/too long, 409 duplicate), else a general one.
function nameFailure(err: unknown, fallback: string): string {
  const result = formErrors(err, fallback)
  return result.fields.name ?? result.message ?? fallback
}

function byName(a: ExcludedCompany, b: ExcludedCompany): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.name.localeCompare(b.name) || a.id - b.id
}

/**
 * Settings → Job Search → Excluded Companies. The list lives on the server
 * (MCP clients read it through get_excluded_companies); it never changes the
 * Board, so nothing else in the query cache is touched here.
 */
export function ExcludedCompaniesSettings() {
  const queryClient = useQueryClient()
  const companiesQuery = useQuery({ queryKey: EXCLUDED_COMPANIES_KEY, queryFn: fetchExcludedCompanies })
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: number; name: string; error: string | null } | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  const companies = companiesQuery.data
  const headingId = useId()

  function updateList(update: (list: ExcludedCompany[]) => ExcludedCompany[]) {
    queryClient.setQueryData<ExcludedCompany[]>(EXCLUDED_COMPANIES_KEY, (current) => update(current ?? []).sort(byName))
  }

  const addMutation = useMutation({
    mutationFn: (name: string) => addExcludedCompany(name),
    onMutate: () => setAddError(null),
    onSuccess: (created, submitted) => {
      // Keep anything typed while the request was in flight.
      setNewName((current) => (normalize(current) === submitted ? '' : current))
      updateList((list) => [...list.filter((c) => c.id !== created.id), created])
    },
    onError: (err) => {
      setAddError(nameFailure(err, 'Could not add the company.'))
      queryClient.invalidateQueries({ queryKey: EXCLUDED_COMPANIES_KEY })
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameExcludedCompany(id, name),
    onSuccess: (renamed) => {
      setEditing(null)
      setAddError(null)
      updateList((list) => list.map((c) => (c.id === renamed.id ? renamed : c)))
    },
    onError: (err) => {
      setEditing((current) => (current ? { ...current, error: nameFailure(err, 'Could not rename the company.') } : current))
      queryClient.invalidateQueries({ queryKey: EXCLUDED_COMPANIES_KEY })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (company: ExcludedCompany) => removeExcludedCompany(company.id),
    onMutate: () => setListError(null),
    onSuccess: (_, company) => {
      setEditing((current) => (current?.id === company.id ? null : current))
      // A duplicate warning for the add field may no longer apply.
      setAddError(null)
      updateList((list) => list.filter((c) => c.id !== company.id))
    },
    onError: (err, company) => {
      setListError(nameFailure(err, `Could not remove “${company.name}”.`))
      queryClient.invalidateQueries({ queryKey: EXCLUDED_COMPANIES_KEY })
    },
  })

  function handleAdd(event: FormEvent) {
    event.preventDefault()
    if (addMutation.isPending) return
    const name = normalize(newName)
    if (name === '') {
      setAddError(EMPTY_NAME)
      return
    }
    const duplicate = duplicateOf(name, companies ?? [])
    if (duplicate) {
      setAddError(alreadyExcluded(duplicate))
      return
    }
    addMutation.mutate(name)
  }

  function saveEdit() {
    if (!editing || renameMutation.isPending) return
    const name = normalize(editing.name)
    if (name === '') {
      setEditing({ ...editing, error: EMPTY_NAME })
      return
    }
    const duplicate = duplicateOf(name, companies ?? [], editing.id)
    if (duplicate) {
      setEditing({ ...editing, error: alreadyExcluded(duplicate) })
      return
    }
    const unchanged = companies?.find((c) => c.id === editing.id)?.name === name
    if (unchanged) {
      setEditing(null)
      return
    }
    renameMutation.mutate({ id: editing.id, name })
  }

  function handleEditKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveEdit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setEditing(null)
    }
  }

  return (
    <Paper
      component="section"
      aria-labelledby={headingId}
      elevation={0}
      sx={{ p: { xs: 2, sm: 4 }, border: '1px solid', borderColor: 'divider' }}
    >
      <Typography id={headingId} variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
        Excluded Companies
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Companies to skip during AI job searches. This does not affect your board.
      </Typography>

      <Box component="form" noValidate onSubmit={handleAdd} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-start', mb: 3 }}>
        <TextField
          size="small"
          placeholder="Company name"
          value={newName}
          onChange={(event) => {
            setNewName(event.target.value)
            if (addError) setAddError(null)
          }}
          error={addError !== null}
          helperText={addError ?? undefined}
          slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH, 'aria-label': 'Company name' } }}
          sx={{ flex: '1 1 200px', maxWidth: 400 }}
        />
        <Button type="submit" variant="contained" disabled={addMutation.isPending}>
          {addMutation.isPending ? 'Adding…' : 'Add'}
        </Button>
      </Box>

      {listError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setListError(null)}>
          {listError}
        </Alert>
      )}
      {companiesQuery.isLoading && <Typography color="text.secondary">Loading…</Typography>}
      {companiesQuery.isError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => companiesQuery.refetch()}>
              Retry
            </Button>
          }
        >
          Could not load your excluded companies.
        </Alert>
      )}
      {companies && companies.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No excluded companies yet.
        </Typography>
      )}
      {companies && companies.length > 0 && (
        <Box component="ul" aria-label="Excluded companies" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {companies.map((company) => (
            <Box
              component="li"
              key={company.id}
              data-testid={`excluded-company-${company.id}`}
              sx={{
                display: 'flex',
                // Only the inline rename (field + Save + Cancel) wraps on narrow screens; a long
                // name shrinks and wraps its text instead, keeping the icons on its line.
                flexWrap: editing?.id === company.id ? 'wrap' : 'nowrap',
                alignItems: 'center',
                gap: 1,
                py: 1,
                minHeight: 48,
                borderTop: '1px solid',
                borderColor: 'divider',
                '&:first-of-type': { borderTop: 'none' },
              }}
            >
              {editing?.id === company.id ? (
                <>
                  <TextField
                    size="small"
                    autoFocus
                    value={editing.name}
                    onChange={(event) => setEditing({ ...editing, name: event.target.value, error: null })}
                    onKeyDown={handleEditKeyDown}
                    error={editing.error !== null}
                    helperText={editing.error ?? undefined}
                    disabled={renameMutation.isPending}
                    slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH, 'aria-label': `New name for ${company.name}` } }}
                    sx={{ flex: '1 1 200px' }}
                  />
                  <Button size="small" variant="contained" onClick={saveEdit} disabled={renameMutation.isPending}>
                    {renameMutation.isPending ? 'Saving…' : 'Save'}
                  </Button>
                  <Button size="small" onClick={() => setEditing(null)} disabled={renameMutation.isPending}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Typography sx={{ flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere' }}>{company.name}</Typography>
                  <Tooltip title="Edit">
                    <IconButton
                      size="small"
                      aria-label={`Edit ${company.name}`}
                      onClick={() => setEditing({ id: company.id, name: company.name, error: null })}
                    >
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Remove">
                    <span>
                      <IconButton
                        size="small"
                        aria-label={`Remove ${company.name}`}
                        disabled={removeMutation.isPending && removeMutation.variables?.id === company.id}
                        onClick={() => removeMutation.mutate(company)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  )
}

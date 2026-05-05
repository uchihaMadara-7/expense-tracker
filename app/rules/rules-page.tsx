"use client"

import { useEffect, useState } from "react"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isSupabaseConfigured, supabase } from "@/lib/supabase"

type RuleRow = {
  rule: string
  category: string
}

type RuleFormMode = "create" | "edit"

export function RulesPage() {
  const [rules, setRules] = useState<RuleRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formMode, setFormMode] = useState<RuleFormMode>("create")
  const [selectedRule, setSelectedRule] = useState<RuleRow | null>(null)
  const [ruleValue, setRuleValue] = useState("")
  const [categoryValue, setCategoryValue] = useState("")

  async function loadRules() {
    if (!supabase) {
      setError("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.")
      setRules([])
      return
    }

    setIsLoading(true)
    setError(null)

    const { data, error: rulesError } = await supabase
      .from("Rules")
      .select("rule,category")
      .order("rule", { ascending: true })

    if (rulesError) {
      setRules([])
      setError(rulesError.message)
      setIsLoading(false)
      return
    }

    setRules(((data ?? []) as RuleRow[]).map((rule) => ({
      rule: rule.rule,
      category: rule.category,
    })))
    setIsLoading(false)
  }

  useEffect(() => {
    void Promise.resolve().then(loadRules)
  }, [])

  function resetForm() {
    setSelectedRule(null)
    setRuleValue("")
    setCategoryValue("")
    setFormMode("create")
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open)

    if (!open) {
      resetForm()
    }
  }

  function handleAddRuleClick() {
    resetForm()
    setDialogOpen(true)
  }

  function handleEditRuleClick(rule: RuleRow) {
    setSelectedRule(rule)
    setRuleValue(rule.rule)
    setCategoryValue(rule.category)
    setFormMode("edit")
    setDialogOpen(true)
  }

  async function handleRuleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabase) {
      setError("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.")
      return
    }

    const nextRule = ruleValue.trim()
    const nextCategory = categoryValue.trim()

    if (!nextRule || !nextCategory) {
      setError("Rule and category are required.")
      return
    }

    setIsSaving(true)
    setError(null)

    const savePromise = (async () => {
      if (formMode === "edit" && selectedRule) {
        const { error: updateError } = await supabase
          .from("Rules")
          .update({ category: nextCategory })
          .eq("rule", selectedRule.rule)

        if (updateError) {
          throw new Error(updateError.message)
        }
      } else {
        const { error: insertError } = await supabase
          .from("Rules")
          .insert({ rule: nextRule, category: nextCategory })

        if (insertError) {
          throw new Error(insertError.message)
        }
      }

      await loadRules()
      setDialogOpen(false)
      resetForm()
      return formMode === "edit" ? "Rule updated." : "Rule added."
    })()

    toast.promise(savePromise, {
      loading: formMode === "edit" ? "Saving rule..." : "Adding rule...",
      success: (message) => message,
      error: (saveError) => saveError instanceof Error ? saveError.message : "Failed to save rule.",
    })

    try {
      await savePromise
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save rule.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteRuleClick(rule: RuleRow) {
    if (!supabase) {
      setError("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.")
      return
    }

    if (!window.confirm(`Delete rule "${rule.rule}"?`)) {
      return
    }

    setError(null)

    const deletePromise = (async () => {
      const { error: deleteError } = await supabase
        .from("Rules")
        .delete()
        .eq("rule", rule.rule)

      if (deleteError) {
        throw new Error(deleteError.message)
      }

      await loadRules()
      return rule.rule
    })()

    toast.promise(deletePromise, {
      loading: "Deleting rule...",
      success: (deletedRule) => `Deleted ${deletedRule}.`,
      error: (deleteError) => deleteError instanceof Error ? deleteError.message : "Failed to delete rule.",
    })

    try {
      await deletePromise
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete rule.")
    }
  }

  const columns: ColumnDef<RuleRow>[] = [
    {
      accessorKey: "rule",
      header: "Rule",
      cell: ({ row }) => <span className="font-semibold text-slate-900">{row.original.rule}</span>,
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => <span className="text-slate-600">{row.original.category}</span>,
    },
    {
      id: "actions",
      header: () => <span className="block text-right">Actions</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleEditRuleClick(row.original)}
          >
            <PencilIcon />
            Edit
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => void handleDeleteRuleClick(row.original)}
          >
            <Trash2Icon />
            Delete
          </Button>
        </div>
      ),
    },
  ]

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Rules</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Category rules</h1>
          </div>
          <Button type="button" onClick={handleAddRuleClick}>
            <PlusIcon />
            Add rule
          </Button>
        </header>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Rules error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="overflow-hidden rounded-lg border-slate-200 bg-white p-0 shadow-sm">
          <CardContent>
            <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-xl font-bold">Rules table</CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  {isSupabaseConfigured ? `${rules.length} rules${isLoading ? " loading" : ""}` : "Supabase keys missing"}
                </p>
              </div>
            </div>
            <DataTable columns={columns} data={rules} />
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={handleRuleSubmit}>
            <DialogHeader>
              <DialogTitle>{formMode === "edit" ? "Edit rule" : "Add rule"}</DialogTitle>
              <DialogDescription>
                Rules match merchant text and assign a category.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="mt-4">
              <Field>
                <Label htmlFor="rule-value">Rule</Label>
                <Input
                  id="rule-value"
                  name="rule"
                  value={ruleValue}
                  readOnly={formMode === "edit"}
                  onChange={(event) => setRuleValue(event.target.value)}
                />
              </Field>
              <Field>
                <Label htmlFor="rule-category">Category</Label>
                <Input
                  id="rule-category"
                  name="category"
                  value={categoryValue}
                  onChange={(event) => setCategoryValue(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <DialogFooter className="mt-4">
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={isSaving}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Select, Switch, Table, Tabs, Text, Textarea, toast } from "@medusajs/ui"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"
import { CreditFooter } from "../../components/credit-footer"
import { SessionDrawer } from "../../components/session-drawer"
import { Loading } from "../../components/states"
import { CONFIG_KEY, formatDateTime, getConfig, getSettings, getStats, KEY, lang, listSessions, SESSIONS_KEY, SETTINGS_KEY, STATS_KEY, updateSettings, usd, type Faq, type SessionFilters } from "../../lib/api"

const PAGE_SIZE = 25

const AiChatPage = () => {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab = ["conversations", "settings"].includes(params.get("tab") ?? "") ? (params.get("tab") as string) : "overview"
  const setTab = (v: string) => {
    const next = new URLSearchParams(params)
    if (v === "overview") next.delete("tab")
    else next.set("tab", v)
    setParams(next, { replace: true })
  }
  const qc = useQueryClient()
  const { data: config } = useQuery({ queryKey: CONFIG_KEY, queryFn: getConfig, staleTime: 60_000 })
  const { data: settingsData } = useQuery({ queryKey: SETTINGS_KEY, queryFn: getSettings })
  const settings = settingsData?.settings
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => updateSettings({ enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: Error) => toast.error(e.message),
  })
  return (
    <div className="flex flex-col gap-y-3">
      <Tabs value={tab} onValueChange={setTab}>
        <Container className="divide-y p-0">
          <div className="flex flex-wrap items-start justify-between gap-2 px-6 py-4">
            <div>
              <Heading>{t("aiChat.title")}</Heading>
              <Text size="small" className="text-ui-fg-subtle mt-1">{t("aiChat.description")}</Text>
              {config && !config.provider.ready && config.provider.id !== "mock" ? (
                <Text size="small" className="text-ui-fg-error mt-1">{t("aiChat.providerNotReady", { env: config.provider.api_key_env })}</Text>
              ) : null}
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={settings?.enabled ?? true} onCheckedChange={(v) => toggle.mutate(v)} disabled={!settings} />
                {settings?.enabled === false ? t("aiChat.disabled") : t("aiChat.enabled")}
              </label>
              <Tabs.List>
                <Tabs.Trigger value="overview">{t("aiChat.tabs.overview")}</Tabs.Trigger>
                <Tabs.Trigger value="conversations">{t("aiChat.tabs.conversations")}</Tabs.Trigger>
                <Tabs.Trigger value="settings">{t("aiChat.tabs.settings")}</Tabs.Trigger>
              </Tabs.List>
            </div>
          </div>
          <Tabs.Content value="overview">
            <OverviewTab />
          </Tabs.Content>
          <Tabs.Content value="conversations">
            <ConversationsTab />
          </Tabs.Content>
          <Tabs.Content value="settings">
            <SettingsTab />
          </Tabs.Content>
        </Container>
      </Tabs>
      <CreditFooter />
    </div>
  )
}

const Stat = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
  <div className="rounded-lg border px-4 py-3">
    <Text size="xsmall" className="text-ui-fg-subtle">{label}</Text>
    <Text size="large" weight="plus">{value}</Text>
    {hint ? <Text size="xsmall" className="text-ui-fg-muted">{hint}</Text> : null}
  </div>
)

const OverviewTab = () => {
  const { t } = useTranslation()
  const days = 30
  const { data: stats, isLoading } = useQuery({ queryKey: [...STATS_KEY, days], queryFn: () => getStats(days) })
  const { data: config } = useQuery({ queryKey: CONFIG_KEY, queryFn: getConfig, staleTime: 60_000 })
  if (isLoading || !stats) return <Loading />
  const pct = stats.today.budget_usd > 0 ? Math.min(100, Math.round((stats.today.cost_usd / stats.today.budget_usd) * 100)) : 0
  return (
    <div className="flex flex-col gap-4 px-6 py-4">
      <div>
        <Heading level="h2" className="mb-2 text-sm">{t("aiChat.overview.today", { day: stats.today.day })}</Heading>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label={t("aiChat.overview.spent")} value={usd(stats.today.cost_usd)} hint={`${pct}%`} />
          <Stat label={t("aiChat.overview.budget")} value={stats.today.budget_usd > 0 ? usd(stats.today.budget_usd) : "∞"} />
          <Stat label={t("aiChat.overview.sessions")} value={stats.today.sessions} />
          <Stat label={t("aiChat.overview.turns")} value={stats.today.turns} />
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-ui-bg-subtle">
          <div className={`h-full ${pct >= 100 ? "bg-ui-tag-red-icon" : "bg-ui-fg-interactive"}`} style={{ width: `${pct}%` }} />
        </div>
        <Text size="xsmall" className="text-ui-fg-muted mt-1">{t("aiChat.overview.budgetHint", { tz: stats.timezone })}</Text>
      </div>
      <div>
        <Heading level="h2" className="mb-2 text-sm">{t("aiChat.overview.last", { days })}</Heading>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label={t("aiChat.overview.sessions")} value={stats.totals.sessions} />
          <Stat label={t("aiChat.overview.turns")} value={stats.totals.turns} hint={usd(stats.totals.cost_usd)} />
          <Stat label={t("aiChat.overview.handoffs")} value={stats.totals.handoffs} />
          <Stat label={t("aiChat.overview.refused")} value={stats.totals.refused} />
          <Stat label={t("aiChat.overview.feedback")} value={`${stats.totals.feedback_up} / ${stats.totals.feedback_down}`} />
          <Stat label={t("aiChat.overview.flagged")} value={stats.totals.flagged} />
        </div>
      </div>
      {config ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          {t("aiChat.overview.model")}: {config.provider.id} / {config.provider.model}.{" "}
          {config.pricing ? t("aiChat.overview.pricing", { input: usd(config.pricing.input), output: usd(config.pricing.output), read: usd(config.pricing.cache_read), write: usd(config.pricing.cache_write) }) : t("aiChat.overview.noPricing")}{" "}
          {t("aiChat.overview.retention", { days: config.retention_days })}
        </Text>
      ) : null}
    </div>
  )
}

const ConversationsTab = () => {
  const { t, i18n } = useTranslation()
  const l = lang(i18n.language)
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get("q") ?? "")
  const filter = (params.get("filter") ?? "all") as "all" | "handoff" | "noHandoff" | "up" | "down" | "flagged"
  const page = Math.max(0, Number(params.get("page") ?? 0))
  const open = params.get("session")
  const filters: SessionFilters = { q: params.get("q") ?? undefined }
  if (filter === "handoff") filters.handoff = "true"
  if (filter === "noHandoff") filters.handoff = "false"
  if (filter === "up") filters.feedback = "up"
  if (filter === "down") filters.feedback = "down"
  if (filter === "flagged") filters.flagged = "true"
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) v === null || v === "" ? next.delete(k) : next.set(k, v)
    setParams(next, { replace: true })
  }
  useEffect(() => {
    const h = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) set({ q: q || null, page: null })
    }, 400)
    return () => clearTimeout(h)
  }, [q])
  const { data, isLoading } = useQuery({ queryKey: [...SESSIONS_KEY, filters, page], queryFn: () => listSessions(filters, PAGE_SIZE, page * PAGE_SIZE), placeholderData: keepPreviousData })
  const chips: [typeof filter, string][] = [["all", t("aiChat.sessions.all")], ["handoff", t("aiChat.sessions.handoff")], ["noHandoff", t("aiChat.sessions.noHandoff")], ["up", t("aiChat.sessions.up")], ["down", t("aiChat.sessions.down")], ["flagged", t("aiChat.sessions.flagged")]]
  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input size="small" placeholder={t("aiChat.sessions.search")} value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        {chips.map(([k, label]) => (
          <Button key={k} size="small" variant={filter === k ? "primary" : "secondary"} onClick={() => set({ filter: k === "all" ? null : k, page: null })}>
            {label}
          </Button>
        ))}
      </div>
      {isLoading || !data ? (
        <Loading />
      ) : !data.sessions.length ? (
        <Text size="small" className="text-ui-fg-subtle">{t("aiChat.sessions.empty")}</Text>
      ) : (
        <>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("aiChat.sessions.columns.when")}</Table.HeaderCell>
                <Table.HeaderCell>{t("aiChat.sessions.columns.first")}</Table.HeaderCell>
                <Table.HeaderCell>{t("aiChat.sessions.columns.turns")}</Table.HeaderCell>
                <Table.HeaderCell>{t("aiChat.sessions.columns.cost")}</Table.HeaderCell>
                <Table.HeaderCell>{t("aiChat.sessions.columns.handoff")}</Table.HeaderCell>
                <Table.HeaderCell>{t("aiChat.sessions.columns.feedback")}</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.sessions.map((s) => (
                <Table.Row key={s.id} className="cursor-pointer" onClick={() => set({ session: s.id })}>
                  <Table.Cell className="whitespace-nowrap">
                    {formatDateTime(s.created_at, l)} <Badge size="2xsmall">{s.locale.toUpperCase()}</Badge>
                  </Table.Cell>
                  <Table.Cell className="max-w-md truncate">{s.first_message ?? "–"}</Table.Cell>
                  <Table.Cell>{s.turns}</Table.Cell>
                  <Table.Cell>{usd(s.cost_usd)}</Table.Cell>
                  <Table.Cell>{s.handoff_at ? <Badge size="2xsmall" color="blue">{s.handoff_reason}</Badge> : "–"}</Table.Cell>
                  <Table.Cell>
                    {s.feedback_up ? `👍${s.feedback_up} ` : ""}
                    {s.feedback_down ? `👎${s.feedback_down} ` : ""}
                    {s.flagged ? <Badge size="2xsmall" color="orange">!</Badge> : null}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          <div className="flex items-center justify-between">
            <Text size="small" className="text-ui-fg-subtle">{t("aiChat.sessions.pagination", { from: page * PAGE_SIZE + 1, to: Math.min((page + 1) * PAGE_SIZE, data.count), count: data.count })}</Text>
            <div className="flex gap-2">
              <Button size="small" variant="secondary" disabled={page === 0} onClick={() => set({ page: String(page - 1) })}>{t("aiChat.sessions.prev")}</Button>
              <Button size="small" variant="secondary" disabled={(page + 1) * PAGE_SIZE >= data.count} onClick={() => set({ page: String(page + 1) })}>{t("aiChat.sessions.next")}</Button>
            </div>
          </div>
        </>
      )}
      <SessionDrawer id={open} onClose={() => set({ session: null })} />
    </div>
  )
}

const SettingsTab = () => {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: config } = useQuery({ queryKey: CONFIG_KEY, queryFn: getConfig, staleTime: 60_000 })
  const { data, isLoading } = useQuery({ queryKey: SETTINGS_KEY, queryFn: getSettings })
  const locales = config?.locales ?? ["en"]
  const [greeting, setGreeting] = useState<Record<string, string>>({})
  const [instructions, setInstructions] = useState("")
  const [budget, setBudget] = useState("")
  const [faqs, setFaqs] = useState<Faq[]>([])
  useEffect(() => {
    const s = data?.settings
    if (!s) return
    setGreeting(s.greeting ?? {})
    setInstructions(s.instructions ?? "")
    setBudget(s.daily_budget_usd === null ? "" : String(s.daily_budget_usd))
    setFaqs(s.faqs ?? [])
  }, [data?.settings])
  const save = useMutation({
    mutationFn: () => updateSettings({ greeting, instructions, faqs: faqs.filter((f) => f.question.trim() && f.answer.trim()), daily_budget_usd: budget.trim() === "" ? null : Number(budget) }),
    onSuccess: () => {
      toast.success(t("aiChat.settings.saved"))
      qc.invalidateQueries({ queryKey: KEY })
    },
    onError: (e: Error) => toast.error(t("aiChat.settings.saveError", { message: e.message })),
  })
  if (isLoading || !data) return <Loading />
  const editFaq = (i: number, patch: Partial<Faq>) => setFaqs((all) => all.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  return (
    <div className="flex flex-col gap-6 px-6 py-4">
      <section className="flex flex-col gap-2">
        <Heading level="h2" className="text-sm">{t("aiChat.settings.general")}</Heading>
        <Text size="xsmall" className="text-ui-fg-muted">{t("aiChat.settings.enabledHint")}</Text>
        <label className="flex flex-col gap-1">
          <Text size="small">{t("aiChat.settings.budget")}</Text>
          <Input size="small" type="number" min={0} step="0.1" value={budget} onChange={(e) => setBudget(e.target.value)} className="max-w-xs" />
          <Text size="xsmall" className="text-ui-fg-muted">{t("aiChat.settings.budgetHint", { default: usd(config?.budget.default_daily_usd ?? 1) })}</Text>
        </label>
      </section>
      <section className="flex flex-col gap-2">
        <Heading level="h2" className="text-sm">{t("aiChat.settings.greeting")}</Heading>
        <Text size="xsmall" className="text-ui-fg-muted">{t("aiChat.settings.greetingHint")}</Text>
        {locales.map((loc) => (
          <label key={loc} className="flex flex-col gap-1">
            <Text size="small">{loc.toUpperCase()}</Text>
            <Textarea rows={2} value={greeting[loc] ?? ""} onChange={(e) => setGreeting({ ...greeting, [loc]: e.target.value })} />
          </label>
        ))}
      </section>
      <section className="flex flex-col gap-2">
        <Heading level="h2" className="text-sm">{t("aiChat.settings.instructions")}</Heading>
        <Text size="xsmall" className="text-ui-fg-muted">{t("aiChat.settings.instructionsHint")}</Text>
        <Textarea rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </section>
      <section className="flex flex-col gap-2">
        <Heading level="h2" className="text-sm">{t("aiChat.settings.faqs")}</Heading>
        <Text size="xsmall" className="text-ui-fg-muted">{t("aiChat.settings.faqsHint")}</Text>
        {faqs.map((f, i) => (
          <div key={f.id || i} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_2fr_8rem_auto]">
            <Textarea rows={2} placeholder={t("aiChat.settings.question")} value={f.question} onChange={(e) => editFaq(i, { question: e.target.value })} />
            <Textarea rows={2} placeholder={t("aiChat.settings.answer")} value={f.answer} onChange={(e) => editFaq(i, { answer: e.target.value })} />
            <Select size="small" value={f.locale ?? "*"} onValueChange={(v) => editFaq(i, { locale: v === "*" ? null : v })}>
              <Select.Trigger>
                <Select.Value placeholder={t("aiChat.settings.locale")} />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="*">{t("aiChat.settings.anyLocale")}</Select.Item>
                {locales.map((loc) => (
                  <Select.Item key={loc} value={loc}>{loc.toUpperCase()}</Select.Item>
                ))}
              </Select.Content>
            </Select>
            <Button size="small" variant="secondary" onClick={() => setFaqs(faqs.filter((_, j) => j !== i))}>{t("aiChat.settings.remove")}</Button>
          </div>
        ))}
        <Button size="small" variant="secondary" className="w-fit" onClick={() => setFaqs([...faqs, { id: "", question: "", answer: "", locale: null }])}>{t("aiChat.settings.addFaq")}</Button>
      </section>
      <div>
        <Button size="small" onClick={() => save.mutate()} isLoading={save.isPending}>{t("aiChat.settings.save")}</Button>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "AI Assistant",
  icon: ChatBubbleLeftRight,
})

export default AiChatPage

import { Badge, Button, Drawer, Heading, Prompt, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { deleteSession, formatDateTime, getSession, KEY, lang, SESSIONS_KEY, usd, type Message } from "../lib/api"
import { Loading } from "./states"

const Bubble = ({ m }: { m: Message }) => {
  const { t } = useTranslation()
  const mine = m.role === "assistant"
  return (
    <div className={`flex ${mine ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-ui-bg-subtle" : "bg-ui-bg-base border"}`}>
        <Text size="small" className="whitespace-pre-wrap">{m.content}</Text>
        {m.products?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {m.products.map((p) => (
              <a key={p.handle} href={p.url} target="_blank" rel="noopener noreferrer" className="rounded border px-2 py-0.5 text-xs hover:bg-ui-bg-base-hover">
                {p.title}
                {p.price ? ` · ${p.price}` : ""}
              </a>
            ))}
          </div>
        ) : null}
        {m.tool_calls?.length ? (
          <details className="mt-2 text-xs text-ui-fg-subtle">
            <summary className="cursor-pointer">
              {t("aiChat.drawer.tools")}: {m.tool_calls.map((c) => c.name).join(", ")}
            </summary>
            {m.tool_calls.map((c, i) => (
              <pre key={i} className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-ui-bg-base p-2">
                {c.name}({JSON.stringify(c.input)}) {c.ms} ms{c.error ? " ✗" : ""}
                {"\n"}
                {c.result.slice(0, 1500)}
              </pre>
            ))}
          </details>
        ) : null}
        {m.metadata?.removed?.length ? (
          <div className="mt-2 text-xs text-ui-fg-error">
            {t("aiChat.drawer.removed")}: {m.metadata.removed.join(" | ")}
          </div>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-ui-fg-muted">
          {mine ? <span>{t("aiChat.drawer.tokens", { in: m.input_tokens, out: m.output_tokens })} · {usd(m.cost_usd)}{m.latency_ms ? ` · ${(m.latency_ms / 1000).toFixed(1)} s` : ""}</span> : null}
          {m.feedback === 1 ? <Badge size="2xsmall" color="green">👍</Badge> : null}
          {m.feedback === -1 ? <Badge size="2xsmall" color="red">👎</Badge> : null}
          {(m.flagged ?? []).map((f) => (
            <Badge key={f} size="2xsmall" color="orange">
              {t(`aiChat.drawer.flag.${f}`, { defaultValue: f })}
            </Badge>
          ))}
          {m.handoff ? <Badge size="2xsmall" color="blue">WhatsApp</Badge> : null}
        </div>
      </div>
    </div>
  )
}

export const SessionDrawer = ({ id, onClose }: { id: string | null; onClose: () => void }) => {
  const { t, i18n } = useTranslation()
  const l = lang(i18n.language)
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: [...SESSIONS_KEY, "one", id], queryFn: () => getSession(id as string), enabled: !!id })
  const s = data?.session
  const del = useMutation({
    mutationFn: () => deleteSession(id as string),
    onSuccess: () => {
      toast.success(t("aiChat.drawer.deleted"))
      qc.invalidateQueries({ queryKey: KEY })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })
  return (
    <Drawer open={!!id} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{t("aiChat.drawer.title")}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-3 overflow-y-auto">
          {isLoading || !s ? (
            <Loading />
          ) : (
            <>
              <Text size="small" className="text-ui-fg-subtle">
                {t("aiChat.drawer.meta", { locale: s.locale.toUpperCase(), turns: s.turns, cost: usd(s.cost_usd), when: formatDateTime(s.created_at, l) })}
                {s.page ? ` · ${t("aiChat.drawer.page", { page: s.page })}` : ""}
              </Text>
              {s.handoff_at ? (
                <Badge color="blue" className="w-fit">
                  {t("aiChat.drawer.handoff", { reason: s.handoff_reason, source: t(`aiChat.drawer.source.${s.handoff_source ?? "ai"}`) })}
                </Badge>
              ) : null}
              {s.summary ? (
                <div className="rounded-lg border p-3">
                  <Heading level="h3" className="mb-1 text-sm">{t("aiChat.drawer.summary")}</Heading>
                  <Text size="small" className="whitespace-pre-wrap">{s.summary}</Text>
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                {s.messages.map((m) => (
                  <Bubble key={m.id} m={m} />
                ))}
              </div>
            </>
          )}
        </Drawer.Body>
        <Drawer.Footer>
          <Prompt open={confirm} onOpenChange={setConfirm}>
            <Prompt.Trigger asChild>
              <Button variant="danger" size="small" disabled={!s}>
                {t("aiChat.drawer.delete")}
              </Button>
            </Prompt.Trigger>
            <Prompt.Content>
              <Prompt.Header>
                <Prompt.Title>{t("aiChat.drawer.delete")}</Prompt.Title>
                <Prompt.Description>{t("aiChat.drawer.deleteConfirm")}</Prompt.Description>
              </Prompt.Header>
              <Prompt.Footer>
                <Prompt.Cancel>{t("aiChat.drawer.cancel")}</Prompt.Cancel>
                <Prompt.Action onClick={() => del.mutate()}>{t("aiChat.drawer.delete")}</Prompt.Action>
              </Prompt.Footer>
            </Prompt.Content>
          </Prompt>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

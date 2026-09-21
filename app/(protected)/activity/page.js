import { MissionTimeline, ReceiptRow } from "@/components/forge/lists";
import { EmptyState, Notice, PageHeader, Section } from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import { listAgents, listReceipts, listRunEvents, loadWork } from "@/lib/forge/queries";

const EVENT_LIMIT = 80;
const RECEIPT_LIMIT = 40;
const WORK_WINDOW = 200;

export default async function ActivityPage() {
  const context = await requireForgeContext();
  const supabase = context.supabase;
  const workspaceId = context.workspace?.id;

  const [eventsResult, receiptsResult, work, agentsResult] = await Promise.all([
    listRunEvents(supabase, { workspaceId, limit: EVENT_LIMIT }),
    listReceipts(supabase, { workspaceId, limit: RECEIPT_LIMIT }),
    loadWork(supabase, workspaceId, { limit: WORK_WINDOW }),
    listAgents(supabase),
  ]);

  const agentsById = new Map(agentsResult.agents.map((agent) => [agent.id, agent]));
  const taskById = new Map(work.tasks.map((task) => [task.id, task]));
  const actorLabels = new Map([[context.user.id, context.displayName]]);

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Activity"
        subtitle="The Forge event stream and execution receipts: what missions did, what was refused, and what was actually executed."
        meta={
          context.workspace
            ? `${eventsResult.events.length} events · ${receiptsResult.receipts.length} receipts`
            : "No workspace membership yet"
        }
      />

      <div className="forge-stack forge-stack--pushed">
        {eventsResult.failed || receiptsResult.failed ? (
          <Notice tone="warn">
            Activity data could not be fully loaded. Showing what is available.
          </Notice>
        ) : null}

        <Section title="Mission events" meta={eventsResult.events.length}>
          {eventsResult.events.length > 0 ? (
            <div className="forge-pad-top">
              <MissionTimeline
                events={eventsResult.events}
                actorLabels={actorLabels}
              />
            </div>
          ) : (
            <EmptyState
              title="No events recorded yet"
              text="Queued missions, started runs, staged approvals, denied tools, and delegated subagent work are written here as they happen."
            />
          )}
        </Section>

        <Section title="Execution receipts" meta={receiptsResult.receipts.length}>
          {receiptsResult.receipts.length > 0 ? (
            <div className="forge-rows">
              {receiptsResult.receipts.map((receipt) => {
                const mission = receipt.taskId ? taskById.get(receipt.taskId) : null;
                return (
                  <ReceiptRow
                    key={receipt.id}
                    receipt={receipt}
                    task={mission ?? null}
                    agentName={
                      agentsById.get(mission?.agent_id)?.name ?? null
                    }
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Nothing executed yet"
              text="A receipt is written only when Forge actually runs an action. Denied requests are recorded as events instead, because nothing happened."
            />
          )}
        </Section>

        <p className="forge-meta-faint">
          Event summaries, metadata, and receipt summaries are sanitized before
          they are stored. Credentials and raw tool payloads are never written.
        </p>
      </div>
    </>
  );
}

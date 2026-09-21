import { MissionTimeline, ReceiptRow, RunRow } from "@/components/forge/lists";
import { EmptyState, Notice, PageHeader, Section } from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import {
  listAgents,
  listReceipts,
  listRunEvents,
  loadWork,
} from "@/lib/forge/queries";

const EVENT_LIMIT = 120;
const RECEIPT_LIMIT = 60;
const WORK_WINDOW = 200;

// History: the durable record. Mission events, execution receipts, and the run
// tree, with nothing invented in the UI.
export default async function HistoryPage() {
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

  return (
    <>
      <PageHeader
        eyebrow="Mission Bay"
        title="History"
        subtitle="The durable record: what missions did, what workers reported, and what was actually executed."
        meta={
          context.workspace
            ? `${eventsResult.events.length} events · ${receiptsResult.receipts.length} receipts · ${work.runs.length} runs`
            : "No workspace membership yet"
        }
      />

      <div className="forge-stack forge-stack--pushed">
        {eventsResult.failed || receiptsResult.failed ? (
          <Notice tone="warn">
            History could not be fully loaded. Showing what is available.
          </Notice>
        ) : null}

        <Section title="Mission events" meta={eventsResult.events.length}>
          {eventsResult.events.length > 0 ? (
            <div className="forge-pad-top">
              <MissionTimeline
                events={eventsResult.events}
                actorLabels={new Map([[context.user.id, context.displayName]])}
              />
            </div>
          ) : (
            <EmptyState
              title="No events recorded yet"
              text="Queued missions, assigned teams, delegated worker runs, tool requests, and confirmations are written here as they happen."
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
                    agentName={agentsById.get(mission?.agent_id)?.name ?? null}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Nothing executed yet"
              text="A receipt is written only when Forge runs an action. Accepted means the tool returned; confirmed means the provider returned a reference."
            />
          )}
        </Section>

        <Section title="Runs" meta={work.runs.length}>
          {work.runs.length > 0 ? (
            <div className="forge-rows">
              {work.runs.map((run) => {
                const mission = taskById.get(run.task_id) ?? null;
                return (
                  <RunRow
                    key={run.id}
                    run={run}
                    task={mission ?? null}
                    agentName={agentsById.get(mission?.agent_id)?.name ?? null}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              glyph="spark"
              title="No runs recorded"
              text="Runs appear here when a mission is submitted to Hermes."
            />
          )}
        </Section>
      </div>
    </>
  );
}

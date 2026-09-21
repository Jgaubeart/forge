import { ApprovalCard } from "@/components/forge/lists";
import {
  EmptyState,
  Notice,
  PageHeader,
  Section,
} from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import { listAgents, loadWork } from "@/lib/forge/queries";

const WORK_WINDOW = 200;
const DECIDED_LIMIT = 10;

export default async function ApprovalsPage() {
  const context = await requireForgeContext();
  const supabase = context.supabase;

  const [work, agentsResult] = await Promise.all([
    loadWork(supabase, context.workspace?.id, { limit: WORK_WINDOW }),
    listAgents(supabase),
  ]);

  const agentsById = new Map(
    agentsResult.agents.map((agent) => [agent.id, agent])
  );
  const taskById = new Map(work.tasks.map((task) => [task.id, task]));

  const pending = work.approvals.filter(
    (approval) => approval.status === "pending"
  );
  const decided = work.approvals
    .filter((approval) => approval.status !== "pending")
    .slice(0, DECIDED_LIMIT);

  const describe = (approval) => {
    const task = taskById.get(approval.task_id);
    return {
      agentName: agentsById.get(task?.agent_id)?.name ?? null,
      taskTitle: task ? task.title : null,
    };
  };

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Approvals"
        subtitle="Decisions that require a human. Everything here is read-only until the approval execution layer is implemented."
        meta={
          pending.length > 0
            ? `${pending.length} awaiting a decision`
            : "Nothing waiting on you"
        }
      />

      <div className="forge-stack forge-stack--pushed">
        {work.failed ? (
          <Notice tone="warn">
            Approval data could not be fully loaded. Showing what is available.
          </Notice>
        ) : null}

        <Section title="Waiting for you" meta={pending.length}>
          {pending.length > 0 ? (
            pending.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                task={taskById.get(approval.task_id) ?? null}
                {...describe(approval)}
              />
            ))
          ) : (
            <EmptyState
              title="No approvals waiting"
              text="Your workforce is not blocked on a decision. Requests appear here before any action beyond read or draft."
            />
          )}
        </Section>

        {decided.length > 0 ? (
          <Section title="Recently decided" meta={decided.length}>
            {decided.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                task={taskById.get(approval.task_id) ?? null}
                {...describe(approval)}
              />
            ))}
          </Section>
        ) : null}

        <p className="forge-meta-faint">
          Approving or denying is not wired up yet. Until it is, decisions stay
          read-only here and no action is executed on your behalf.
        </p>
      </div>
    </>
  );
}

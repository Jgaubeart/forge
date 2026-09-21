import Link from "next/link";

import { ConfirmApproval } from "@/components/forge/confirm-approval";
import { EmptyState, Notice, PageHeader, Pill, Section } from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import { actorLabel, formatDateTime, formatWhen } from "@/lib/forge/format";
import { listAgents, loadWork } from "@/lib/forge/queries";
import { approveApprovalAction, denyApprovalAction } from "../missions/actions";

const WORK_WINDOW = 200;
const DECIDED_LIMIT = 12;

// The approval queue. Each entry is one staged action with its exact arguments;
// confirming runs that snapshot, declining closes it, and neither path lets the
// runtime change the action afterwards.
export default async function ApprovalsPage() {
  const context = await requireForgeContext();
  const supabase = context.supabase;

  const [work, agentsResult] = await Promise.all([
    loadWork(supabase, context.workspace?.id, { limit: WORK_WINDOW }),
    listAgents(supabase),
  ]);

  const agentsById = new Map(agentsResult.agents.map((agent) => [agent.id, agent]));
  const taskById = new Map(work.tasks.map((task) => [task.id, task]));

  const pending = work.approvals.filter((approval) => approval.status === "pending");
  const decided = work.approvals
    .filter((approval) => approval.status !== "pending")
    .slice(0, DECIDED_LIMIT);

  return (
    <>
      <PageHeader
        eyebrow="Mission control"
        title="Approvals"
        subtitle="Staged actions waiting on you. The action that runs is exactly the snapshot reviewed here."
        meta={
          pending.length > 0
            ? `${pending.length} awaiting your word`
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
            pending.map((approval) => {
              const mission = taskById.get(approval.task_id);
              return (
                <div className="forge-card-stack" key={approval.id}>
                  <ConfirmApproval
                    approval={{
                      ...approval,
                      stagedArguments: approval.payloadSummary ?? [],
                    }}
                    approveAction={approveApprovalAction}
                    denyAction={denyApprovalAction}
                  />
                  <p className="forge-meta-faint">
                    {agentsById.get(mission?.agent_id)?.name ?? "Agent"} ·{" "}
                    {mission ? (
                      <Link href={`/missions/${mission.id}`}>{mission.title}</Link>
                    ) : (
                      "Mission unavailable"
                    )}{" "}
                    · requested by {actorLabel(approval.requested_by, context.user.id)} ·{" "}
                    {formatWhen(approval.created_at)}
                  </p>
                </div>
              );
            })
          ) : (
            <EmptyState
              title="No approvals waiting"
              text="Your workforce is not blocked on a decision. Anything that mutates an external service appears here first."
            />
          )}
        </Section>

        {decided.length > 0 ? (
          <Section title="Recently decided" meta={decided.length}>
            <div className="forge-rows">
              {decided.map((approval) => {
                const mission = taskById.get(approval.task_id);
                return (
                  <Link
                    className="forge-row"
                    href={mission ? `/missions/${mission.id}` : "/approvals"}
                    key={approval.id}
                  >
                    <span className="forge-row-main">
                      <span className="forge-row-title">
                        {approval.tool ?? approval.capability}
                      </span>
                      <span className="forge-row-meta">
                        <span className="forge-mono">{approval.capability}</span>
                        <span>{mission?.title ?? "Mission"}</span>
                        {approval.decided_at ? (
                          <span>{formatDateTime(approval.decided_at)}</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="forge-row-end">
                      <Pill
                        label={approval.status}
                        tone={approval.status === "approved" ? "accent" : "muted"}
                      />
                    </span>
                  </Link>
                );
              })}
            </div>
          </Section>
        ) : null}

        <p className="forge-meta-faint">
          Declining never executes anything. Approving runs the stored snapshot,
          and a receipt is written only if a tool actually ran.
        </p>
      </div>
    </>
  );
}

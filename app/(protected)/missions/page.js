import Link from "next/link";

import { MissionCard } from "@/components/forge/mission-card";
import { EmptyState, FilterChips, Notice, PageHeader, Section } from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import { groupBy } from "@/lib/forge/db";
import { getMissionKind } from "@/lib/forge/missions/catalog.js";
import { listAgents, listRunEvents, loadWork } from "@/lib/forge/queries";
import { isActiveMission } from "@/lib/forge/status";
import { approveApprovalAction, denyApprovalAction } from "./actions";

const WORK_WINDOW = 200;
const EVENT_WINDOW = 300;

const FILTERS = [
  { key: "all", label: "All", test: () => true },
  { key: "active", label: "Active", test: (mission) => isActiveMission(mission.status) },
  { key: "waiting", label: "Awaiting confirm", test: (m) => m.status === "waiting_approval" },
  { key: "completed", label: "Completed", test: (m) => m.status === "completed" },
  { key: "failed", label: "Failed", test: (m) => m.status === "failed" },
  { key: "cancelled", label: "Cancelled", test: (m) => m.status === "cancelled" },
];

export default async function MissionsPage({ searchParams }) {
  const context = await requireForgeContext();
  const supabase = context.supabase;
  const params = await searchParams;
  const raw = Array.isArray(params?.state) ? params.state[0] : params?.state;
  const active = FILTERS.find((filter) => filter.key === raw) ?? FILTERS[0];

  const [work, agentsResult, eventsResult] = await Promise.all([
    loadWork(supabase, context.workspace?.id, { limit: WORK_WINDOW }),
    listAgents(supabase),
    listRunEvents(supabase, { workspaceId: context.workspace?.id, limit: EVENT_WINDOW }),
  ]);

  const agentsById = new Map(agentsResult.agents.map((agent) => [agent.id, agent]));
  const runsByTask = groupBy(work.runs, "task_id");
  const eventsByTask = groupBy(eventsResult.events, "task_id");
  const approvalsByTask = groupBy(
    work.approvals.filter((approval) => approval.status === "pending"),
    "task_id"
  );

  const counts = new Map(
    FILTERS.map((filter) => [
      filter.key,
      work.tasks.filter((mission) => filter.test(mission)).length,
    ])
  );

  const visible = work.tasks.filter((mission) => active.test(mission));

  return (
    <>
      <PageHeader
        eyebrow="Mission Bay"
        title="Missions"
        subtitle="Every durable mission with its kind, lead agent, team, and current state."
        meta={
          context.workspace
            ? `${context.workspace.name} · ${work.tasks.length} recorded`
            : "No workspace membership yet"
        }
        actions={
          <Link className="forge-button" href="/">
            Mission Bay
          </Link>
        }
      />

      <div className="forge-stack forge-stack--pushed">
        {work.failed ? (
          <Notice tone="warn">
            Mission data could not be fully loaded. Showing what is available.
          </Notice>
        ) : null}

        <FilterChips
          options={FILTERS.map((filter) => ({
            label: filter.label,
            href: filter.key === "all" ? "/missions" : `/missions?state=${filter.key}`,
            count: counts.get(filter.key) ?? 0,
            active: filter.key === active.key,
          }))}
        />

        <Section title={active.key === "all" ? "All missions" : active.label} meta={visible.length}>
          {visible.length > 0 ? (
            <div className="forge-missions">
              {visible.map((mission) => {
                const kind = getMissionKind(mission.kind);
                return (
                  <MissionCard
                    key={mission.id}
                    mission={mission}
                    agentName={agentsById.get(mission.agent_id)?.name ?? null}
                    team={[]}
                    events={(eventsByTask.get(mission.id) ?? []).slice().reverse()}
                    approvals={approvalsByTask.get(mission.id) ?? []}
                    approveAction={approveApprovalAction}
                    denyAction={denyApprovalAction}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              glyph="spark"
              title={
                work.tasks.length === 0 ? "No missions yet" : "No missions in this state"
              }
              text={
                work.tasks.length === 0
                  ? `Mission kinds available: ${FILTERS.length > 0 ? "" : ""}dispatch one from Mission Bay.`
                  : "Try another state filter."
              }
            />
          )}
        </Section>
      </div>
    </>
  );
}

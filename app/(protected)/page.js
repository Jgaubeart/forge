import Link from "next/link";

import { MissionCard } from "@/components/forge/mission-card";
import { MissionTimeline } from "@/components/forge/lists";
import { StartMission } from "@/components/forge/start-mission";
import { Dot, EmptyState, MetricRow, Notice, PageHeader, Section } from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import { groupBy } from "@/lib/forge/db";
import { listMissionKinds } from "@/lib/forge/missions/catalog.js";
import {
  listAgents,
  listFleets,
  listRunEvents,
  loadWork,
} from "@/lib/forge/queries";
import { isActiveMission } from "@/lib/forge/status";
import { approveApprovalAction, denyApprovalAction, startMissionAction } from "./missions/actions";

const WORK_WINDOW = 60;
const EVENT_WINDOW = 200;

// Mission Bay: the central work surface, ported from the reference build. Live
// missions with their feeds and confirm controls come first; everything else on
// this screen supports that.
export default async function MissionBayPage() {
  const context = await requireForgeContext();
  const { supabase, user, workspace, membership } = context;

  const [agentsResult, work, eventsResult, fleetsResult] = await Promise.all([
    listAgents(supabase),
    loadWork(supabase, workspace?.id, { limit: WORK_WINDOW }),
    listRunEvents(supabase, { workspaceId: workspace?.id, limit: EVENT_WINDOW }),
    listFleets(supabase),
  ]);

  const agentsById = new Map(agentsResult.agents.map((agent) => [agent.id, agent]));
  const runsByTask = groupBy(work.runs, "task_id");
  const eventsByTask = groupBy(eventsResult.events, "task_id");
  const pendingApprovals = work.approvals.filter(
    (approval) => approval.status === "pending"
  );
  const approvalsByTask = groupBy(pendingApprovals, "task_id");

  const activeMissions = work.tasks
    .filter((mission) => isActiveMission(mission.status))
    .slice(0, 6);
  const recentMissions = work.tasks
    .filter((mission) => !isActiveMission(mission.status))
    .slice(0, 4);

  const fleet = fleetsResult.fleets[0] ?? null;
  const partial =
    agentsResult.failed || work.failed || eventsResult.failed || fleetsResult.failed;

  const cardProps = (mission) => ({
    mission,
    agentName: agentsById.get(mission.agent_id)?.name ?? null,
    team: teamFor(mission, agentsById, runsByTask.get(mission.id) ?? []),
    events: (eventsByTask.get(mission.id) ?? []).slice().reverse(),
    approvals: approvalsByTask.get(mission.id) ?? [],
    approveAction: approveApprovalAction,
    denyAction: denyApprovalAction,
  });

  return (
    <>
      <PageHeader
        eyebrow="Mission Bay"
        title="Mission Bay"
        subtitle="Durable missions, the agents working them, and the exact actions waiting on your confirmation."
        meta={
          workspace
            ? `${workspace.name} · ${activeMissions.length} active · ${pendingApprovals.length} awaiting confirmation`
            : "No workspace membership yet"
        }
      />

      <div className="forge-stack forge-stack--pushed">
        {partial ? (
          <Notice tone="warn">
            Some Mission Bay data could not be loaded. Showing what is available.
          </Notice>
        ) : null}

        {workspace ? (
          <>
            <StartMission
              kinds={listMissionKinds()}
              action={startMissionAction}
            />

            {pendingApprovals.length > 0 ? (
              <Notice tone="warn">
                {pendingApprovals.length} staged action
                {pendingApprovals.length === 1 ? "" : "s"} awaiting your confirmation.
                Confirm them on the mission cards below, or in{" "}
                <Link href="/approvals">Approvals</Link>.
              </Notice>
            ) : null}

            <MetricRow
              items={[
                {
                  label: "Active missions",
                  value: activeMissions.length,
                  hint: "Independent of this page",
                },
                {
                  label: "Awaiting confirmation",
                  value: pendingApprovals.length,
                  hint: "Exact staged actions",
                },
                {
                  label: "Worker runs",
                  value: work.runs.length,
                  hint: `${work.runs.filter((run) => run.kind === "subagent").length} delegated`,
                },
                {
                  label: "Receipts",
                  value: work.runs.length,
                  hint: "Proof of executed actions",
                },
              ]}
            />

            <Section title="Active missions" meta={activeMissions.length}>
              {activeMissions.length > 0 ? (
                <div className="forge-missions">
                  {activeMissions.map((mission) => (
                    <MissionCard key={mission.id} {...cardProps(mission)} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  glyph="spark"
                  title="No missions running"
                  text="Dispatch a mission above. It is recorded durably before any work starts, so it survives this page."
                />
              )}
            </Section>

            {fleet ? (
              <Section
                title="The fleet"
                meta={`${fleet.members.length} agents`}
                action={
                  <Link className="forge-section-link" href="/agents">
                    Agent roster
                  </Link>
                }
              >
                <div className="forge-team">
                  {fleet.members.map((member) => (
                    <span className="forge-team-chip" key={member.slug}>
                      <Dot tone="accent" />
                      {member.name}
                      <em>{member.role}</em>
                    </span>
                  ))}
                </div>
                {fleet.description ? (
                  <p className="forge-meta-faint forge-pad-top">{fleet.description}</p>
                ) : null}
              </Section>
            ) : null}

            {recentMissions.length > 0 ? (
              <Section
                title="Recently closed"
                action={
                  <Link className="forge-section-link" href="/missions">
                    Mission history
                  </Link>
                }
              >
                <div className="forge-missions">
                  {recentMissions.map((mission) => (
                    <MissionCard key={mission.id} {...cardProps(mission)} />
                  ))}
                </div>
              </Section>
            ) : null}
          </>
        ) : (
          <EmptyState
            title="No workspace yet"
            text="Mission Bay opens once your account belongs to a workspace."
          />
        )}

        <Section
          title="Recent mission events"
          action={
            eventsResult.events.length > 0 ? (
              <Link className="forge-section-link" href="/history">
                Full history
              </Link>
            ) : null
          }
        >
          {eventsResult.events.length > 0 ? (
            <div className="forge-pad-top">
              <MissionTimeline
                events={eventsResult.events.slice(0, 12)}
                actorLabels={new Map([[user.id, context.displayName]])}
              />
            </div>
          ) : (
            <EmptyState
              title="Nothing recorded yet"
              text="Mission, worker, tool, and approval events are written here as they happen."
            />
          )}
        </Section>
      </div>
    </>
  );
}

// Assigned team from the mission policy snapshot, with the tone reflecting what
// Hermes actually reported for that worker's child run.
function teamFor(mission, agentsById, runs) {
  const slugs = Array.isArray(mission.policy?.team) ? mission.policy.team : [];
  if (slugs.length === 0) return [];

  const byslug = new Map();
  for (const agent of agentsById.values()) {
    if (agent.slug) byslug.set(agent.slug, agent);
  }

  return slugs.map((slug) => {
    const agent = byslug.get(slug);
    const childRun = runs.find(
      (run) => run.kind === "subagent" && run.actorLabel === agent?.name
    );
    const status = String(childRun?.status ?? "").toLowerCase();

    return {
      slug,
      name: agent?.name ?? slug.toUpperCase(),
      role: null,
      tone: !childRun
        ? "muted"
        : status === "completed"
          ? "accent"
          : status === "failed"
            ? "danger"
            : "accent",
      live: status === "running" || status === "queued",
    };
  });
}

// Forge run controller.
//
// The only place that submits work to Hermes. React components never call
// Hermes, and the Hermes API key never leaves server code.
//
// Responsibilities: authorize, build permitted context, create the durable
// mission and run records, submit through the existing adapter, record the
// Hermes run id, mirror status, stop runs on cancel, and append events.

import { RUNTIME_ERROR_CODES, RuntimeError, toSafeError } from "./errors.js";
import {
  canCancelMission,
  isTerminalMission,
  mapRunStatus,
} from "./policy.js";
import { RUN_EVENT_TYPES } from "./events.js";
import { getMissionKind, missionTitle } from "../missions/catalog.js";
import { COORDINATOR_PROMPT, workerPromptFor } from "../missions/prompts.js";

export function createRunController({
  repository,
  hermes,
  contextBuilder,
  events,
  clock = () => new Date(),
}) {
  return {
    // Start a catalog mission the way the reference build does: resolve the kind,
    // pick the lead agent (and team, when the kind runs as a fleet), authorize the
    // capability, record the durable mission, then submit through Hermes.
    //
    // Forge records the team composition here. Child work is only recorded when
    // Hermes reports it (registerFleetWork), so nothing in Forge pretends a
    // subagent is running before the runtime says it is.
    async startCatalogMission({
      actorUserId,
      workspaceId,
      kind,
      brief = "",
      connectionIds = [],
      idempotencyKey = null,
    }) {
      const meta = getMissionKind(kind);
      if (!meta) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.invalidRequest,
          `Unknown mission kind: ${kind}.`
        );
      }

      const text = String(brief ?? "").trim();
      if (meta.needsBrief && !text) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.invalidRequest,
          `${meta.name} needs a brief.`
        );
      }

      const lead = await repository.getAgentBySlug(meta.leadAgentSlug);
      if (!lead) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.notFound,
          `The ${meta.leadAgentSlug.toUpperCase()} agent is not seeded in this workspace.`
        );
      }

      const fleet = meta.fleetSlug
        ? await repository.getFleetBySlug(meta.fleetSlug)
        : null;
      const team = (fleet?.members ?? []).filter((member) => member.agent);

      const context = await contextBuilder.build({
        actorUserId,
        workspaceId,
        agentId: lead.id,
        capability: meta.capability,
        requestedActionLevel: "read",
        connectionIds,
      });

      const mission = await repository.createTask({
        workspaceId,
        agentId: lead.id,
        requestedBy: actorUserId,
        actionLevel: "read",
        input: text
          ? { title: missionTitle(meta.key, text), brief: text }
          : { title: meta.name },
        status: "queued",
        currentStep: "Queued",
        kind: meta.key,
        icon: meta.icon,
        fleetId: fleet?.id ?? null,
        policy: {
          ...context.policySnapshot,
          mission_kind: meta.key,
          lead_agent: lead.slug,
          team: team.map((member) => member.agent.slug),
        },
        createdAt: clock(),
      });

      await events.record({
        type: RUN_EVENT_TYPES.taskQueued,
        taskId: mission.id,
        workspaceId,
        actorUserId,
        summary: `${meta.name} queued`,
        metadata: {
          kind: meta.key,
          capability: meta.capability,
          lead_agent: lead.slug,
          fleet: fleet?.slug ?? null,
        },
      });

      for (const member of team) {
        await events.record({
          type: RUN_EVENT_TYPES.agentAssigned,
          taskId: mission.id,
          workspaceId,
          actorUserId,
          actorLabel: member.agent.name,
          summary: `${member.agent.name} assigned as ${member.role}`,
          metadata: { agent: member.agent.slug, role: member.role },
        });
      }

      const run = await repository.createRun({
        taskId: mission.id,
        kind: "primary",
        actorLabel: lead.name,
        status: "queued",
        createdAt: clock(),
      });

      try {
        const hermesRun = await hermes.createRun({
          input: text || meta.name,
          instructions: missionInstruction(meta, { brief: text, lead, team }),
          idempotencyKey,
        });

        const hermesRunId = hermesRun?.id ?? hermesRun?.run_id ?? null;
        if (!hermesRunId) {
          throw new RuntimeError(
            RUNTIME_ERROR_CODES.hermesUnavailable,
            "Hermes accepted the mission but returned no run id."
          );
        }

        const now = clock();
        const updatedRun = await repository.updateRun(run.id, {
          hermesRunId,
          status: "running",
          startedAt: now,
          updatedAt: now,
        });

        await repository.updateTask(mission.id, {
          status: "running",
          startedAt: now,
          currentStep: `Running in Hermes · ${lead.name}`,
        });

        await events.record({
          type: RUN_EVENT_TYPES.runStarted,
          taskId: mission.id,
          workspaceId,
          agentRunId: run.id,
          actorUserId,
          summary: `${lead.name} started work`,
          metadata: { hermes_run_id: hermesRunId, kind: meta.key },
        });

        return {
          status: "running",
          kind: meta.key,
          icon: meta.icon,
          team: team.map((member) => ({
            slug: member.agent.slug,
            name: member.agent.name,
            role: member.role,
          })),
          mission: {
            ...mission,
            status: "running",
            currentStep: `Running in Hermes · ${lead.name}`,
          },
          run: updatedRun ?? run,
        };
      } catch (error) {
        const safe = toSafeError(error);
        const now = clock();

        await repository.updateRun(run.id, {
          status: "failed",
          completedAt: now,
          updatedAt: now,
          error: safe,
        });

        await repository.updateTask(mission.id, {
          status: "failed",
          completedAt: now,
          currentStep: `Submission failed: ${safe.message}`,
        });

        await events.record({
          type: RUN_EVENT_TYPES.runFailed,
          taskId: mission.id,
          workspaceId,
          agentRunId: run.id,
          actorUserId,
          summary: safe.message,
          metadata: { code: safe.code, kind: meta.key },
        });

        return { status: "failed", kind: meta.key, mission, run, error: safe };
      }
    },

    // Record a worker Hermes actually delegated. Called with the child run id
    // and the agent Hermes reported; Forge never invents this structure.
    async registerFleetWork({
      actorUserId,
      parentRunId,
      agentSlug,
      role = null,
      hermesRunId = null,
      status = "running",
    }) {
      const parent = await repository.getRunForUser({
        runId: parentRunId,
        userId: actorUserId,
      });
      if (!parent) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.notFound,
          "That parent run is not available to you."
        );
      }

      const agent = await repository.getAgentBySlug(agentSlug);

      const run = await repository.createRun({
        taskId: parent.taskId,
        parentRunId: parent.id,
        kind: "subagent",
        actorLabel: agent?.name ?? String(agentSlug ?? "subagent"),
        hermesRunId,
        status,
        startedAt: clock(),
        createdAt: clock(),
      });

      await events.record({
        type: RUN_EVENT_TYPES.agentDelegated,
        taskId: parent.taskId,
        workspaceId: parent.workspaceId,
        agentRunId: run.id,
        actorUserId,
        actorLabel: run.actorLabel,
        summary: `${run.actorLabel} was delegated work${role ? ` (${role})` : ""}`,
        metadata: {
          parent_run_id: parent.id,
          agent: agent?.slug ?? agentSlug,
          role,
          hermes_run_id: hermesRunId,
        },
      });

      await events.record({
        type: RUN_EVENT_TYPES.workerSpawned,
        taskId: parent.taskId,
        workspaceId: parent.workspaceId,
        agentRunId: run.id,
        actorUserId,
        actorLabel: run.actorLabel,
        summary: `${run.actorLabel} started`,
        metadata: { role, hermes_run_id: hermesRunId },
      });

      return { parent, run, agent };
    },

    // Worker stage announcements (SCAFFOLD / CODE / TEST / LAUNCH and friends).
    async recordWorkerStage({ actorUserId, runId, stage, label = null }) {
      const run = await repository.getRunForUser({ runId, userId: actorUserId });
      if (!run) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.notFound,
          "That run is not available to you."
        );
      }

      const text = String(stage ?? "").trim().toUpperCase().slice(0, 24);
      if (!text) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.invalidRequest,
          "A stage is required."
        );
      }

      await events.record({
        type: RUN_EVENT_TYPES.workerStage,
        taskId: run.taskId,
        workspaceId: run.workspaceId,
        agentRunId: run.id,
        actorUserId,
        actorLabel: run.actorLabel,
        summary: label ? `${text} — ${label}` : text,
        metadata: { stage: text },
      });

      await repository.updateTask(run.taskId, { currentStep: text });

      return { stage: text };
    },

    // Persist the final mission result. Only a real runtime result belongs here;
    // the receipt discipline still applies to anything external.
    async completeMission({ actorUserId, taskId, result = {}, summary = null }) {
      const task = await repository.getTaskForUser({ taskId, userId: actorUserId });
      if (!task) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.notFound,
          "That mission is not available to you."
        );
      }

      const now = clock();
      const updated = await repository.updateTask(task.id, {
        status: "completed",
        completedAt: now,
        currentStep: summary ?? "Mission complete",
        result,
      });

      await events.record({
        type: RUN_EVENT_TYPES.missionCompleted,
        taskId: task.id,
        workspaceId: task.workspaceId,
        agentRunId: null,
        actorUserId,
        summary: summary ?? "Mission complete",
        metadata: { result_keys: Object.keys(result ?? {}) },
      });

      return { mission: updated ?? { ...task, status: "completed", result } };
    },

    async failMission({ actorUserId, taskId, note }) {
      const task = await repository.getTaskForUser({ taskId, userId: actorUserId });
      if (!task) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.notFound,
          "That mission is not available to you."
        );
      }

      const safe = toSafeError(note instanceof Error ? note : new Error(String(note)));
      const now = clock();

      await repository.updateTask(task.id, {
        status: "failed",
        completedAt: now,
        currentStep: `Failed: ${safe.message}`,
      });

      await events.record({
        type: RUN_EVENT_TYPES.workerFailed,
        taskId: task.id,
        workspaceId: task.workspaceId,
        actorUserId,
        summary: safe.message,
        metadata: { code: safe.code },
      });

      return { failed: true, missionId: task.id };
    },

    // Start a durable mission: authorize, snapshot policy, submit to Hermes.
    async startMission({
      actorUserId,
      workspaceId,
      agentId,
      capability,
      requestedActionLevel = "read",
      goal,
      title = null,
      connectionIds = [],
      idempotencyKey = null,
    }) {
      if (!goal || typeof goal !== "string" || !goal.trim()) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.invalidRequest,
          "A mission goal is required."
        );
      }

      const context = await contextBuilder.build({
        actorUserId,
        workspaceId,
        agentId,
        capability,
        requestedActionLevel,
        connectionIds,
      });

      const input = title ? { title, goal } : { goal };

      const mission = await repository.createTask({
        workspaceId,
        agentId: context.agent.id,
        requestedBy: actorUserId,
        actionLevel: requestedActionLevel,
        input,
        status: "queued",
        currentStep: "Queued",
        policy: context.policySnapshot,
        createdAt: clock(),
      });

      await events.record({
        type: RUN_EVENT_TYPES.taskQueued,
        taskId: mission.id,
        workspaceId,
        actorUserId,
        summary: `Mission queued for ${context.agent.name}`,
        metadata: {
          capability,
          action_level: requestedActionLevel,
          connection_ids: context.policySnapshot.connection_ids,
        },
      });

      const run = await repository.createRun({
        taskId: mission.id,
        kind: "primary",
        actorLabel: context.agent.name,
        status: "queued",
        createdAt: clock(),
      });

      try {
        const hermesRun = await hermes.createRun({
          input: goal,
          instructions: context.agent.instructions,
          idempotencyKey,
        });

        const hermesRunId = hermesRun?.id ?? hermesRun?.run_id ?? null;
        if (!hermesRunId) {
          throw new RuntimeError(
            RUNTIME_ERROR_CODES.hermesUnavailable,
            "Hermes accepted the request but returned no run id."
          );
        }

        const now = clock();
        const updatedRun = await repository.updateRun(run.id, {
          hermesRunId,
          status: "running",
          startedAt: now,
          updatedAt: now,
        });

        await repository.updateTask(mission.id, {
          status: "running",
          startedAt: now,
          currentStep: "Running in Hermes",
        });

        await events.record({
          type: RUN_EVENT_TYPES.runStarted,
          taskId: mission.id,
          workspaceId,
          agentRunId: run.id,
          actorUserId,
          summary: `${context.agent.name} started work`,
          metadata: { hermes_run_id: hermesRunId, capability },
        });

        return {
          status: "running",
          mission: { ...mission, status: "running", currentStep: "Running in Hermes" },
          run: updatedRun ?? run,
        };
      } catch (error) {
        const safe = toSafeError(error);
        const now = clock();

        await repository.updateRun(run.id, {
          status: "failed",
          completedAt: now,
          updatedAt: now,
          error: safe,
        });

        await repository.updateTask(mission.id, {
          status: "failed",
          completedAt: now,
          currentStep: `Submission failed: ${safe.message}`,
        });

        await events.record({
          type: RUN_EVENT_TYPES.runFailed,
          taskId: mission.id,
          workspaceId,
          agentRunId: run.id,
          actorUserId,
          summary: safe.message,
          metadata: { code: safe.code },
        });

        return { status: "failed", mission, run, error: safe };
      }
    },

    // Cancel a mission: authorize, mark intent, stop the Hermes run when one
    // exists, then finalize. History is preserved either way.
    async cancelMission({ actorUserId, taskId, reason = null }) {
      const task = await repository.getTaskForUser({ taskId, userId: actorUserId });
      if (!task) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.notFound,
          "That mission is not available to you."
        );
      }

      if (!canCancelMission(task.status)) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.conflict,
          `A mission that is ${task.status} cannot be cancelled.`,
          { status: task.status }
        );
      }

      const runs = await repository.listRunsForTask(task.id);
      const stoppableRun =
        runs.find((run) => run.hermesRunId && !isTerminalMission(run.status)) ??
        runs.find((run) => run.hermesRunId) ??
        null;

      const now = clock();

      await repository.updateTask(task.id, {
        cancelRequestedAt: now,
        cancelRequestedBy: actorUserId,
        currentStep: "Cancellation requested",
      });

      await events.record({
        type: RUN_EVENT_TYPES.taskCancelRequested,
        taskId: task.id,
        workspaceId: task.workspaceId,
        agentRunId: stoppableRun?.id ?? null,
        actorUserId,
        summary: reason ? `Cancellation requested: ${reason}` : "Cancellation requested",
        metadata: { hermes_run_id: stoppableRun?.hermesRunId ?? null },
      });

      let stopError = null;

      if (stoppableRun?.hermesRunId) {
        try {
          await hermes.stopRun(stoppableRun.hermesRunId);
        } catch (error) {
          stopError = toSafeError(error);
        }
      }

      if (stopError) {
        await events.record({
          type: RUN_EVENT_TYPES.runCancelFailed,
          taskId: task.id,
          workspaceId: task.workspaceId,
          agentRunId: stoppableRun.id,
          actorUserId,
          summary: stopError.message,
          metadata: {
            code: stopError.code,
            hermes_run_id: stoppableRun.hermesRunId,
          },
        });

        await repository.updateTask(task.id, {
          currentStep: "Cancellation requested; the Hermes stop call failed",
        });

        throw new RuntimeError(
          RUNTIME_ERROR_CODES.hermesUnavailable,
          `Hermes did not stop the run: ${stopError.message}`,
          { taskId: task.id, runId: stoppableRun.id }
        );
      }

      const finishedAt = clock();

      if (stoppableRun) {
        await repository.updateRun(stoppableRun.id, {
          status: "cancelled",
          cancelledAt: finishedAt,
          completedAt: finishedAt,
          updatedAt: finishedAt,
        });
      }

      const updatedTask = await repository.updateTask(task.id, {
        status: "cancelled",
        cancelledAt: finishedAt,
        completedAt: finishedAt,
        currentStep: "Cancelled",
      });

      await events.record({
        type: RUN_EVENT_TYPES.runCancelled,
        taskId: task.id,
        workspaceId: task.workspaceId,
        agentRunId: stoppableRun?.id ?? null,
        actorUserId,
        summary: "Mission cancelled",
        metadata: {
          hermes_run_id: stoppableRun?.hermesRunId ?? null,
          hermes_stop_called: Boolean(stoppableRun?.hermesRunId),
        },
      });

      return {
        cancelled: true,
        taskId: task.id,
        runId: stoppableRun?.id ?? null,
        hermesStopped: Boolean(stoppableRun?.hermesRunId),
        mission: updatedTask ?? { ...task, status: "cancelled" },
      };
    },

    // Mirror Hermes run status onto the Forge records.
    async syncRun({ actorUserId, runId }) {
      const run = await repository.getRunForUser({ runId, userId: actorUserId });
      if (!run) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.notFound,
          "That run is not available to you."
        );
      }
      if (!run.hermesRunId) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.conflict,
          "This run has no Hermes run id yet."
        );
      }

      const remote = await hermes.getRun(run.hermesRunId);
      const status = mapRunStatus(remote?.status ?? run.status);
      const now = clock();

      const updated = await repository.updateRun(run.id, {
        status,
        updatedAt: now,
        completedAt: isTerminalMission(status) ? now : null,
      });

      await repository.updateTask(run.taskId, {
        status:
          status === "completed"
            ? "completed"
            : status === "failed"
              ? "failed"
              : status === "cancelled"
                ? "cancelled"
                : "running",
        currentStep: `Hermes reported ${status}`,
        ...(isTerminalMission(status) ? { completedAt: now } : {}),
      });

      await events.record({
        type: RUN_EVENT_TYPES.runCompleted,
        taskId: run.taskId,
        workspaceId: run.workspaceId,
        agentRunId: run.id,
        actorUserId,
        summary: `Run status is ${status}`,
        metadata: { hermes_run_id: run.hermesRunId, status },
      });

      return { run: updated ?? run, status };
    },

    // Record a Hermes subagent run. Hermes performs the delegation; Forge
    // records and displays the resulting parent/child structure.
    async registerSubagentRun({
      actorUserId,
      parentRunId,
      agentLabel = null,
      hermesRunId = null,
      status = "running",
    }) {
      const parent = await repository.getRunForUser({
        runId: parentRunId,
        userId: actorUserId,
      });
      if (!parent) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.notFound,
          "That parent run is not available to you."
        );
      }

      const run = await repository.createRun({
        taskId: parent.taskId,
        parentRunId: parent.id,
        kind: "subagent",
        actorLabel: agentLabel ?? "subagent",
        hermesRunId,
        status,
        startedAt: clock(),
        createdAt: clock(),
      });

      await events.record({
        type: RUN_EVENT_TYPES.agentDelegated,
        taskId: parent.taskId,
        workspaceId: parent.workspaceId,
        agentRunId: run.id,
        actorUserId,
        summary: `${agentLabel ?? "A subagent"} was delegated work`,
        metadata: {
          parent_run_id: parent.id,
          hermes_run_id: hermesRunId,
          kind: "subagent",
        },
      });

      return { parent, run };
    },
  };
}

// The instruction payload handed to Hermes for a mission: the lead agent's
// durable instructions, the ported mission prompt, and — for a fleet — the
// delegated worker instructions so Hermes can hand them to subagents.
function missionInstruction(meta, { brief, lead, team = [] }) {
  const text = String(brief ?? "").trim();
  const parts = [];

  if (lead?.instructions) parts.push(lead.instructions);

  parts.push(
    meta.key === "fleet"
      ? COORDINATOR_PROMPT(text)
      : workerPromptFor(meta.leadAgentSlug, text, {
          platforms: meta.platforms ?? [],
        })
  );

  if (team.length > 0) {
    parts.push(
      "Team assigned to this mission. Delegate this work to subagents and report " +
        "each child run; Forge records the structure but performs no delegation itself:\n" +
        team
          .map(
            (member) =>
              `- ${member.agent.name} (${member.role}): ${workerPromptFor(
                member.agent.slug,
                text
              )}`
          )
          .join("\n")
    );
  }

  const instruction = parts.join("\n\n");
  return instruction.length > INSTRUCTION_LIMIT
    ? `${instruction.slice(0, INSTRUCTION_LIMIT)} [INSTRUCTION TRUNCATED]`
    : instruction;
}

const INSTRUCTION_LIMIT = 16000;

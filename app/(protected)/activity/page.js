import { ActivityTimeline } from "@/components/forge/lists";
import { EmptyState, Notice, PageHeader, Section } from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import { listActivity, loadWork } from "@/lib/forge/queries";

const ACTIVITY_LIMIT = 60;
const WORK_WINDOW = 200;

export default async function ActivityPage() {
  const context = await requireForgeContext();
  const supabase = context.supabase;

  const [activityResult, work] = await Promise.all([
    listActivity(supabase, context.workspace?.id, { limit: ACTIVITY_LIMIT }),
    loadWork(supabase, context.workspace?.id, { limit: WORK_WINDOW }),
  ]);

  const taskTitles = new Map(
    work.tasks.map((task) => [task.id, task.title])
  );

  const actorLabels = new Map([[context.user.id, context.displayName]]);

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Activity"
        subtitle="A chronological record of what happened, who asked for it, and which task it belongs to."
        meta={
          context.workspace
            ? `${context.workspace.name} · ${activityResult.events.length} recent events`
            : "No workspace membership yet"
        }
      />

      <div className="forge-stack forge-stack--pushed">
        {activityResult.failed ? (
          <Notice tone="warn">
            Activity data could not be fully loaded. Showing what is available.
          </Notice>
        ) : null}

        <Section title="History" meta={activityResult.events.length}>
          {activityResult.events.length > 0 ? (
            <div className="forge-pad-top">
              <ActivityTimeline
                events={activityResult.events}
                taskTitles={taskTitles}
                actorLabels={actorLabels}
              />
            </div>
          ) : (
            <EmptyState
              title="No activity recorded yet"
              text="Audit events appear here as your workforce takes on work, requests approvals, and finishes runs."
            />
          )}
        </Section>

        <p className="forge-meta-faint">
          Event metadata is summarized by shape. Tokens, credentials, and raw
          payloads are never rendered.
        </p>
      </div>
    </>
  );
}

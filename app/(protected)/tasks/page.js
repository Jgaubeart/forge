import { redirect } from "next/navigation";

// Missions replaced the task list; the old route stays as a signpost.
export default function TasksRedirect() {
  redirect("/missions");
}

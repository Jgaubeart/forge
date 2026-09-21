import { redirect } from "next/navigation";

export default async function TaskRedirect({ params }) {
  const { id } = await params;
  redirect(`/missions/${id}`);
}

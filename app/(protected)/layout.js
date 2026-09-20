import { requireUser } from "@/lib/auth";

export default async function ProtectedLayout({ children }) {
  await requireUser();
  return <>{children}</>;
}

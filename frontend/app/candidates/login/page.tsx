import { redirect } from "next/navigation";

export default function CandidatesLoginRedirect() {
  redirect("/login");
}

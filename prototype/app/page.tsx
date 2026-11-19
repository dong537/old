import { redirect } from "next/navigation";
import { cityPath } from "@/lib/paths";

export default function Root() {
  redirect(cityPath());
}

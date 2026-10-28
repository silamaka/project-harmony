import type { User } from "@/types";

export const fullName = (u: Pick<User, "first_name" | "last_name">) =>
  `${u.first_name} ${u.last_name}`.trim();

/** Personnes mentionnées : celles dont "@Prénom Nom" figure encore dans le texte. */
export function mentionedIds(body: string, candidates: User[]) {
  return candidates.filter((u) => body.includes(`@${fullName(u)}`)).map((u) => u.id);
}

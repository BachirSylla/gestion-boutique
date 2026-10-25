"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorizeAction } from "@/modules/auth-accounts/server";
import { errorFromDatabase, failure, type ActionState } from "@/shared/server/action-state";
import { text, uuid } from "@/shared/server/form";
import { getServerSupabase } from "@/shared/supabase/server";

// Les saisies du journal (prise, versement, annulation, demande) passent par la file d'envoi de
// l'appareil (module sync). Reste ici la décision du propriétaire, faite en ligne.

/** Décision du propriétaire sur une demande d'annulation. */
export async function decideCancellationAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("decideCancellations");
  if (!account) return failure("forbidden");
  const requestId = uuid(form, "requestId");
  if (!requestId) return failure("invalidInput");
  const approve = form.get("approve") === "true";
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("decide_cancellation", {
    p_request_id: requestId,
    p_approve: approve,
    p_note: text(form, "note", 500),
    p_cancellation_id: crypto.randomUUID(),
  });
  if (error) return failure(errorFromDatabase(error));
  revalidatePath("/", "layout");
  // La demande quitte la liste : la confirmation s'affiche en haut de la page.
  redirect(`/cancellations?decided=${approve ? "approved" : "rejected"}`);
}

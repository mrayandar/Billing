import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { updateClientAction } from "../../actions";
import { ClientForm } from "../../client-form";

export default async function EditClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser("clients.edit");
  const { id } = await params;
  const { error } = await searchParams;
  const client = await db.client.findUnique({ where: { id: Number(id) || 0 } });
  if (!client) notFound();
  return (
    <>
      <div>
        <Link href={`/clients/${client.id}`} className="text-[13px] text-accent">← {client.name}</Link>
        <h1 className="mt-1 text-[22px] font-semibold">Edit client</h1>
      </div>
      {typeof error === "string" && <p role="alert" className="card border-danger text-danger">{error}</p>}
      <ClientForm client={client} action={updateClientAction} submitLabel="Save changes" />
    </>
  );
}

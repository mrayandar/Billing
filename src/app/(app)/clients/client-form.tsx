import { Field } from "@/components/field";
import { paisaToRupeesText } from "@/lib/money";

export type ClientValues = {
  id: number;
  code: string;
  name: string;
  type: string;
  contactPerson: string | null;
  mobile: string | null;
  whatsapp: string | null;
  phone2: string | null;
  email: string | null;
  address: string | null;
  area: string | null;
  city: string | null;
  mapLink: string | null;
  deliveryAddress: string | null;
  cnic: string | null;
  ntn: string | null;
  salesman: string | null;
  referredBy: string | null;
  linkedSchools: string | null;
  notes: string | null;
  creditLimit: number;
  termsDays: number;
  overLimitAction: string;
  sendInvoices: boolean;
  sendReminders: boolean;
  notifyArrivals: boolean;
  messageLanguage: string;
};

const TYPES = [
  ["RETAIL", "Retail customer"],
  ["WHOLESALE", "Wholesale / shop"],
  ["SCHOOL", "School / institution"],
  ["SUB_DEALER", "Sub-dealer"],
];

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="card flex flex-col gap-3">
    <h2 className="text-[15px] font-semibold">{title}</h2>
    {children}
  </section>
);

const Choice = ({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) => (
  <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-field bg-white px-3 has-[:checked]:border-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:font-semibold">
    <input type="radio" name={name} value={value} defaultChecked={checked} className="accent-[#0b6b66]" />
    {label}
  </label>
);

// The client form from NewClient.dc.html, used for "New client" and "Edit client".
export function ClientForm({
  client,
  action,
  submitLabel,
  copyFrom,
}: {
  client?: ClientValues;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  copyFrom?: { id: number; name: string; companies: number; books: number }[];
}) {
  const creating = !client;
  const t = (v: string | null | undefined) => v ?? "";
  return (
    <form action={action} className="flex flex-wrap items-start gap-4">
      {client && <input type="hidden" name="id" value={client.id} />}
      <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-4">
        <Section title="Basic details">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Client type</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Client type">
              {TYPES.map(([v, l]) => (
                <Choice key={v} name="type" value={v} label={l} checked={(client?.type ?? "WHOLESALE") === v} />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Client / business name *"><input name="name" required defaultValue={client?.name} className="input" /></Field>
            <Field label="Contact person"><input name="contactPerson" defaultValue={t(client?.contactPerson)} placeholder="Owner or buyer's name" className="input" /></Field>
            <Field label="Mobile"><input name="mobile" defaultValue={t(client?.mobile)} placeholder="03XX-XXXXXXX" inputMode="tel" className="input font-mono" /></Field>
            <Field label="WhatsApp"><input name="whatsapp" defaultValue={t(client?.whatsapp)} placeholder="Same as mobile" inputMode="tel" className="input font-mono" /></Field>
            <Field label="Other phone"><input name="phone2" defaultValue={t(client?.phone2)} placeholder="Landline or second number" inputMode="tel" className="input font-mono" /></Field>
            <Field label="Email"><input name="email" type="email" defaultValue={t(client?.email)} placeholder="Optional" className="input" /></Field>
          </div>
        </Section>

        <Section title="Address and delivery">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Shop address" className="sm:col-span-3"><input name="address" defaultValue={t(client?.address)} placeholder="Shop number, street, market" className="input" /></Field>
            <Field label="Area / market"><input name="area" defaultValue={t(client?.area)} placeholder="e.g. Urdu Bazaar" className="input" /></Field>
            <Field label="City"><input name="city" defaultValue={t(client?.city)} className="input" /></Field>
            <Field label="Location link"><input name="mapLink" defaultValue={t(client?.mapLink)} placeholder="Map pin, optional" className="input" /></Field>
            <Field label="Delivery address, if different" className="sm:col-span-3"><input name="deliveryAddress" defaultValue={t(client?.deliveryAddress)} placeholder="Godown or school address" className="input" /></Field>
          </div>
        </Section>

        <Section title="Business details">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="CNIC"><input name="cnic" defaultValue={t(client?.cnic)} placeholder="XXXXX-XXXXXXX-X" className="input font-mono" /></Field>
            <Field label="NTN / tax number"><input name="ntn" defaultValue={t(client?.ntn)} placeholder="Optional" className="input font-mono" /></Field>
            <Field label="Salesman / handled by"><input name="salesman" defaultValue={t(client?.salesman)} placeholder="Staff name" className="input" /></Field>
            <Field label="Referred by"><input name="referredBy" defaultValue={t(client?.referredBy)} placeholder="Optional" className="input" /></Field>
            <Field label="Linked school(s)"><input name="linkedSchools" defaultValue={t(client?.linkedSchools)} placeholder="For book sets" className="input" /></Field>
            <Field label="Client code" hint={creating ? "empty = next number" : undefined}>
              <input name="code" defaultValue={client?.code} maxLength={12} autoComplete="off" autoCapitalize="none" placeholder={creating ? "e.g. 64" : undefined} className="input font-mono" />
            </Field>
          </div>
          <Field label="Notes">
            <textarea name="notes" rows={2} defaultValue={t(client?.notes)} placeholder="Anything staff should know, e.g. orders only on Mondays" className="input py-2" />
          </Field>
        </Section>
      </div>

      <aside className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
        <Section title="Account and credit">
          {creating && (
            <div className="flex flex-col gap-1">
              <Field label="Opening balance (Rs.)">
                <input name="openingBalance" defaultValue="0" inputMode="decimal" className="input text-right font-mono" />
              </Field>
              <div className="flex gap-1.5" role="radiogroup" aria-label="Opening balance type">
                <Choice name="openingSide" value="THEY_OWE" label="They owe us" checked />
                <Choice name="openingSide" value="WE_OWE" label="We owe them" checked={false} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Credit limit (Rs.)">
              <input name="creditLimit" defaultValue={client ? paisaToRupeesText(client.creditLimit) : "0"} inputMode="decimal" className="input text-right font-mono" />
            </Field>
            <Field label="Payment terms (days)">
              <input name="termsDays" defaultValue={client?.termsDays ?? 0} inputMode="numeric" className="input text-right font-mono" />
            </Field>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Over the credit limit</span>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Over the credit limit">
              <Choice name="overLimitAction" value="WARN" label="Warn" checked={(client?.overLimitAction ?? "WARN") === "WARN"} />
              <Choice name="overLimitAction" value="BLOCK" label="Block, needs approval" checked={client?.overLimitAction === "BLOCK"} />
            </div>
          </div>
        </Section>

        {creating && (
          <Section title="Discounts">
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-field bg-white px-3 has-[:checked]:border-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:font-semibold">
              <input type="radio" name="copyFrom" value="" defaultChecked className="accent-[#0b6b66]" /> Start with no discounts
            </label>
            {(copyFrom ?? []).map((c) => (
              <label key={c.id} className="flex min-h-11 items-center gap-2 rounded-md border border-field bg-white px-3 has-[:checked]:border-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:font-semibold">
                <input type="radio" name="copyFrom" value={c.id} className="accent-[#0b6b66]" />
                <span>Copy from client: {c.name} <span className="font-normal text-muted">· {c.companies} companies, {c.books} book rules</span></span>
              </label>
            ))}
            <span className="text-[13px] text-muted">You can change any of them after saving.</span>
          </Section>
        )}

        <Section title="Messages">
          <label className="flex min-h-8 items-center gap-2.5"><input type="checkbox" name="sendInvoices" defaultChecked={client?.sendInvoices ?? true} className="size-[18px] accent-[#0b6b66]" /> Send invoices on WhatsApp</label>
          <label className="flex min-h-8 items-center gap-2.5"><input type="checkbox" name="sendReminders" defaultChecked={client?.sendReminders ?? true} className="size-[18px] accent-[#0b6b66]" /> Send payment reminders</label>
          <label className="flex min-h-8 items-center gap-2.5"><input type="checkbox" name="notifyArrivals" defaultChecked={client?.notifyArrivals ?? false} className="size-[18px] accent-[#0b6b66]" /> Tell them when requested books arrive</label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Message language</span>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Message language">
              <Choice name="messageLanguage" value="EN" label="English" checked={(client?.messageLanguage ?? "EN") === "EN"} />
              <Choice name="messageLanguage" value="UR" label="اردو" checked={client?.messageLanguage === "UR"} />
            </div>
          </div>
        </Section>

        <button className="btn btn-primary">{submitLabel}</button>
      </aside>
    </form>
  );
}

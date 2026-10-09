import { Field } from "@/components/field";
import { paisaToRupeesText } from "@/lib/money";

type ItemValues = {
  id: number;
  code: string;
  name: string;
  nameUrdu: string | null;
  searchSpelling: string | null;
  isbn: string | null;
  author: string | null;
  subject: string | null;
  language: string | null;
  classGrade: string | null;
  categoryId: number | null;
  basePrice: number;
  costPrice: number;
  baseUnit: string;
  minStock: number;
  status: string;
  companyName: string;
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  OLD_EDITION: "Old edition",
  DISCONTINUED: "Discontinued",
};

// The item form used for both "New item" and the details panel on the Items screen.
export function ItemForm({
  item,
  companies,
  categories,
  canSeeCost,
  action,
  submitLabel,
}: {
  item?: ItemValues;
  companies: string[];
  categories: { id: number; path: string }[];
  canSeeCost: boolean;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}) {
  const creating = !item;
  return (
    <form action={action} className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
      {item && <input type="hidden" name="id" value={item.id} />}
      <Field label="Name" className="sm:col-span-2">
        <input name="name" defaultValue={item?.name} required className="input" />
      </Field>
      <Field label="Name in Urdu" hint="printed when a bill is printed in Urdu" className="sm:col-span-2">
        <input
          name="nameUrdu"
          defaultValue={item?.nameUrdu ?? ""}
          lang="ur"
          dir="rtl"
          className="input font-urdu text-base leading-loose"
        />
      </Field>
      <Field label="English spelling of the Urdu title" hint="used to find it by search" className="sm:col-span-2">
        <input name="searchSpelling" defaultValue={item?.searchSpelling ?? ""} placeholder="e.g. Bang-e-Dra" className="input" />
      </Field>
      <Field label="Item code" hint={creating ? "leave empty for the next number" : undefined}>
        <input name="code" defaultValue={item?.code} autoComplete="off" className="input font-mono" />
      </Field>
      <Field label="ISBN">
        <input name="isbn" defaultValue={item?.isbn ?? ""} autoComplete="off" className="input font-mono" />
      </Field>
      <Field label="Company / publisher">
        <input name="company" list="company-list" defaultValue={item?.companyName} required autoComplete="off" className="input" />
        <datalist id="company-list">
          {companies.map((c) => <option key={c} value={c} />)}
        </datalist>
      </Field>
      <Field label="Category">
        <select name="categoryId" defaultValue={item?.categoryId ?? ""} className="input">
          <option value="">No category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
        </select>
      </Field>
      <Field label="Author">
        <input name="author" defaultValue={item?.author ?? ""} className="input" />
      </Field>
      <Field label="Subject">
        <input name="subject" defaultValue={item?.subject ?? ""} className="input" />
      </Field>
      <Field label="Class / grade">
        <input name="classGrade" defaultValue={item?.classGrade ?? ""} className="input" />
      </Field>
      <Field label="Language">
        <input name="language" defaultValue={item?.language ?? ""} className="input" />
      </Field>
      <Field label="Base price (Rs.)">
        <input
          name="basePrice"
          defaultValue={item ? paisaToRupeesText(item.basePrice) : ""}
          required
          inputMode="decimal"
          className="input text-right font-mono"
        />
      </Field>
      {canSeeCost ? (
        <Field label="Average cost (Rs.)" hint={<span className="text-[#8e4b00]">managers</span>}>
          <input
            name="costPrice"
            defaultValue={item ? paisaToRupeesText(item.costPrice) : ""}
            inputMode="decimal"
            className="input bg-[#faf9f6] text-right font-mono"
          />
        </Field>
      ) : (
        <div className="hidden sm:block" />
      )}
      <Field label="Base unit">
        <input name="baseUnit" defaultValue={item?.baseUnit ?? "piece"} className="input" />
      </Field>
      <Field label="Minimum stock">
        <input name="minStock" defaultValue={item?.minStock ?? 0} inputMode="numeric" className="input text-right font-mono" />
      </Field>
      <Field label="Status" className="sm:col-span-2">
        <select name="status" defaultValue={item?.status ?? "ACTIVE"} className="input">
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      {creating && (
        <>
          <Field label="Other barcodes" hint="maker's barcode; separate with commas" className="sm:col-span-2">
            <input name="extraBarcodes" autoComplete="off" className="input font-mono" />
          </Field>
          <Field label="Larger units" hint="one per line, like: dozen = 12" className="sm:col-span-2">
            <textarea name="units" rows={2} placeholder={"dozen = 12\nbox = 24"} className="input py-2 font-mono" />
          </Field>
        </>
      )}
      <div className="flex justify-end sm:col-span-2">
        <button className="btn btn-primary px-5">{submitLabel}</button>
      </div>
    </form>
  );
}

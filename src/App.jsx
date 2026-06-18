import React, { useState, useEffect, useMemo, useRef } from "react";

/* =====================================================================
   إدارة العقارات والإيجارات — تطبيق متكامل (عربي / RTL)
   حفظ دائم للبيانات عبر window.storage
   ===================================================================== */

const STORE_KEY = "pm:data";
let MEM_FALLBACK = null; // يعمل في المعاينة لو لم يتوفر التخزين الدائم

async function loadData() {
  try {
    if (typeof window !== "undefined" && window.storage) {
      const r = await window.storage.get(STORE_KEY);
      if (r && r.value) return JSON.parse(r.value);
    }
  } catch (e) {
    /* المفتاح غير موجود بعد */
  }
  return MEM_FALLBACK;
}
async function saveData(data) {
  MEM_FALLBACK = data;
  try {
    if (typeof window !== "undefined" && window.storage) {
      await window.storage.set(STORE_KEY, JSON.stringify(data));
    }
  } catch (e) {
    console.error("تعذّر الحفظ:", e);
  }
}

/* ----------------------------- أدوات مساعدة ----------------------------- */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const pad2 = (n) => String(n).padStart(2, "0");
const parseISO = (iso) => { const [y, m, d] = (iso || "").split("-").map(Number); return new Date(Date.UTC(y, (m || 1) - 1, d || 1)); };
const toISO = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const todayISO = () => { const n = new Date(); return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`; };

function addMonths(iso, m) { const d = parseISO(iso); d.setUTCMonth(d.getUTCMonth() + m); return toISO(d); }
function addDays(iso, n) { const d = parseISO(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); }
function addYears(iso, n) { const d = parseISO(iso); d.setUTCFullYear(d.getUTCFullYear() + n); return toISO(d); }
function daysBetween(aISO, bISO) { return Math.round((parseISO(bISO) - parseISO(aISO)) / 86400000); }

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function fmt(n) { return (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }

const RENT_TYPES = [
  { id: "daily", label: "يومي" },
  { id: "weekly", label: "أسبوعي" },
  { id: "monthly", label: "شهري" },
  { id: "yearly", label: "سنوي" },
];
const rentLabel = (id) => (RENT_TYPES.find((r) => r.id === id) || {}).label || id;

const PROP_TYPES = ["شقة", "عمارة", "محل تجاري", "مخزن", "أرض", "فيلا", "مكتب", "أخرى"];
const EXPENSE_CATS = ["صيانة", "كهرباء/ماء", "ضرائب/رسوم", "تأمين", "تنظيف", "عمولة", "أخرى"];

/* تطبيع رقم الهاتف لرابط واتساب */
function waNumber(phone, cc) {
  let n = (phone || "").replace(/\D/g, "");
  if (!n) return "";
  if (n.startsWith("00")) n = n.slice(2);
  cc = (cc || "").replace(/\D/g, "");
  if (cc && n.startsWith(cc)) return n;
  if (n.startsWith("0")) n = n.slice(1);
  return cc + n;
}
function waLink(phone, cc, text) {
  return `https://wa.me/${waNumber(phone, cc)}?text=${encodeURIComponent(text)}`;
}

/* ===== جدولة ميلادية: تناسب الفترة الأولى ثم أشهر/سنوات كاملة ===== */
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DEFAULT_TERMS = [
  "عاين المستأجر العين المؤجرة قبل استلامها ووجدها صالحة ومناسبة لغرضه وخالية من العيوب.",
  "يلتزم المستأجر بالمحافظة على العين المؤجرة ونظافتها وعدم إحداث أي تلف أو تغيير في معالمها دون إذن خطّي من المؤجر.",
  "يلتزم المستأجر بسداد الإيجار في موعده المتفق عليه.",
  "لا يجوز للمستأجر التنازل عن العقد أو تأجير العين من الباطن للغير إلا بموافقة المؤجر الخطية.",
  "يلتزم المستأجر باحترام الجيران وعدم إزعاجهم، وعدم استعمال العين فيما يخالف القانون أو الآداب العامة.",
  "يتحمّل المستأجر قيمة استهلاك المرافق (ماء، كهرباء، …) ما لم يُتّفق على غير ذلك.",
  "يلتزم المستأجر عند انتهاء العقد بإخلاء العين وتسليمها بالحالة التي استلمها عليها.",
  "يحق للمؤجر فسخ العقد عند إخلال المستأجر بأيٍّ من شروطه، مع اتخاذ الإجراءات النظامية والقانونية.",
];
function daysInMonthOf(iso) { const [y, m] = iso.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function firstOfMonth(iso) { return iso.slice(0, 7) + "-01"; }
function lastOfMonth(iso) { return iso.slice(0, 7) + "-" + String(daysInMonthOf(iso)).padStart(2, "0"); }
function isFirstOfMonth(iso) { return Number(iso.slice(8, 10)) === 1; }
function isJan1(iso) { return iso.slice(5) === "01-01"; }
function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function daysInYearOf(iso) { return isLeap(Number(iso.slice(0, 4))) ? 366 : 365; }
function dayOfYear(iso) { const [y, m, d] = iso.split("-").map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1; }
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function monthLabel(iso) { return `${AR_MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`; }
function dayWord(n) { return `${n} ${n >= 3 && n <= 10 ? "أيام" : "يوم"}`; }
function monthWord(n) { return n === 1 ? "شهراً" : n === 2 ? "شهرين" : (n >= 3 && n <= 10) ? `${n} أشهر` : `${n} شهراً`; }
function monthsCoveredLabel(c, indices) {
  if (!indices.length) return "";
  const items = indices.map((i) => { const ps = periodSchedule(c, i); return { y: ps.start.slice(0, 4), m: AR_MONTHS[Number(ps.start.slice(5, 7)) - 1], label: ps.label }; });
  if (items.length === 1) return items[0].label;
  const years = [...new Set(items.map((x) => x.y))];
  if (years.length === 1) return `إيجار شهر ${items.map((x) => x.m).join(" و")} ${years[0]}`;
  return `إيجار: ${items.map((x) => `${x.m} ${x.y}`).join(" و")}`;
}
// نسخة تعمل على مصفوفة فترات جاهزة (سلسلة عقود)
function labelForPeriods(periods, indices) {
  if (!indices.length) return "";
  const items = indices.map((i) => periods[i]).filter(Boolean);
  if (items.length === 1) return items[0].label;
  const years = [...new Set(items.map((x) => (x.start || x.due).slice(0, 4)))];
  const months = items.map((x) => AR_MONTHS[Number((x.start || x.due).slice(5, 7)) - 1]);
  if (years.length === 1) return `إيجار شهر ${months.join(" و")} ${years[0]}`;
  return `إيجار: ${items.map((x) => `${AR_MONTHS[Number((x.start || x.due).slice(5, 7)) - 1]} ${(x.start || x.due).slice(0, 4)}`).join(" و")}`;
}

/* يُرجع تفاصيل الفترة رقم index: {start,end,due,amount,label,prorated,days} */
function periodSchedule(contract, index) {
  const s = contract.startDate || todayISO();
  const rent = num(contract.amount);
  if (contract.rentType === "daily") {
    const start = addDays(s, index);
    return { start, end: start, due: start, amount: rent, label: `إيجار يوم ${start}`, prorated: false };
  }
  if (contract.rentType === "weekly") {
    const start = addDays(s, 7 * index), end = addDays(start, 6);
    return { start, end, due: start, amount: rent, label: `أسبوع ${start} إلى ${end}`, prorated: false };
  }
  if (contract.rentType === "yearly") {
    const y = Number(s.slice(0, 4));
    if (!isJan1(s) && index === 0) {
      const diy = daysInYearOf(s), days = Math.max(1, diy - dayOfYear(s)), amount = round2(rent / diy * days);
      return { start: s, end: `${y}-12-31`, due: s, amount, prorated: true, days, label: `إيجار سنة ${y} (${dayWord(days)})` };
    }
    const yr = y + index;
    const start = `${yr}-01-01`, end = `${yr}-12-31`;
    return { start, end, due: start, amount: rent, label: `إيجار سنة ${yr}`, prorated: false };
  }
  // monthly (افتراضي)
  if (!isFirstOfMonth(s) && index === 0) {
    const dim = daysInMonthOf(s), startDay = Number(s.slice(8, 10)), days = Math.max(1, dim - startDay), amount = round2(rent / dim * days);
    return { start: s, end: lastOfMonth(s), due: s, amount, prorated: true, days, label: `إيجار شهر ${monthLabel(s)} (${dayWord(days)})` };
  }
  const base = isFirstOfMonth(s) ? firstOfMonth(s) : firstOfMonth(addMonths(firstOfMonth(s), 1));
  const off = isFirstOfMonth(s) ? index : index - 1;
  const start = addMonths(base, off), end = lastOfMonth(start);
  return { start, end, due: start, amount: rent, label: `إيجار شهر ${monthLabel(start)}`, prorated: false };
}
function monthlyEquivalent(contract) {
  const a = num(contract.amount);
  switch (contract.rentType) {
    case "daily": return a * 30;
    case "weekly": return a * 4.33;
    case "yearly": return a / 12;
    default: return a;
  }
}

/* تعارض الإشغال: هل الهدف (عقار/وحدة) مشغول بعقد نشط آخر؟ */
function rangesOverlap(s1, e1, s2, e2) {
  const FAR = "9999-12-31", LOW = "0000-01-01";
  const a1 = s1 || LOW, b1 = e1 || FAR, a2 = s2 || LOW, b2 = e2 || FAR;
  return a1 <= b2 && a2 <= b1;
}
function occupancyConflict(contracts, cand, excludeId) {
  return contracts.find((c) => {
    if (c.id === excludeId) return false;
    if (c.propertyId !== cand.propertyId) return false;
    const sameUnit = (c.unitId == null || cand.unitId == null) ? true : (c.unitId === cand.unitId);
    if (!sameUnit) return false;
    if (!rangesOverlap(cand.startDate, cand.endDate, c.startDate, c.endDate)) return false;
    // يتعارض إذا كان العقد الآخر نشطاً (إشغال) أو لنفس المستأجر (تكرار)
    return c.status === "active" || c.tenantId === cand.tenantId;
  }) || null;
}

/* حالة الدفعة */
function paymentStatus(p) {
  const net = num(p.dueAmount) - num(p.discount) + num(p.fine);
  const diff = num(p.received) - net;
  if (p.statusKey) {
    const map = {
      paid: { label: "مسدّد بالكامل", color: "bg-emerald-100 text-emerald-700" },
      partial: { label: "سداد جزئي (نقص)", color: "bg-amber-100 text-amber-700" },
      surplus: { label: "زيادة", color: "bg-sky-100 text-sky-700" },
      unpaid: { label: "غير مسدّد", color: "bg-rose-100 text-rose-700" },
    };
    const m = map[p.statusKey] || map.paid;
    return { key: p.statusKey, label: m.label, color: m.color, diff, net };
  }
  if (num(p.received) <= 0) return { key: "unpaid", label: "غير مسدّد", color: "bg-rose-100 text-rose-700", diff, net };
  if (Math.abs(diff) < 0.005) return { key: "paid", label: "مسدّد بالكامل", color: "bg-emerald-100 text-emerald-700", diff, net };
  if (diff > 0) return { key: "surplus", label: "زيادة", color: "bg-sky-100 text-sky-700", diff, net };
  return { key: "partial", label: "سداد جزئي (نقص)", color: "bg-amber-100 text-amber-700", diff, net };
}

/* ----------------------------- مكونات واجهة ----------------------------- */
function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-900/50 p-0 sm:p-4">
      <div className={`bg-white w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} rounded-t-3xl sm:rounded-3xl shadow-xl max-h-screen overflow-y-auto`}>
        <div className="sticky top-0 bg-white border-b border-stone-100 px-5 py-4 flex items-center justify-between">
          <h3 className="font-bold text-stone-800 text-lg">{title}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-2xl leading-none w-8 h-8">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block mb-3">
      <span className="block text-sm font-semibold text-stone-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-stone-400 mt-1">{hint}</span>}
    </label>
  );
}
const inputCls = "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-stone-800 focus:border-teal-600 focus:bg-white focus:outline-none";

function TextInput(props) { return <input {...props} className={inputCls} />; }
function Select({ value, onChange, children }) {
  return <select value={value} onChange={onChange} className={inputCls}>{children}</select>;
}
function Btn({ children, onClick, kind = "primary", className = "", type = "button", as, href, target }) {
  const styles = {
    primary: "bg-teal-800 text-white hover:bg-teal-900 shadow-sm",
    ghost: "bg-stone-100 text-stone-700 hover:bg-stone-200",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    gold: "bg-amber-500 text-white hover:bg-amber-600 shadow-sm",
    wa: "bg-green-600 text-white hover:bg-green-700",
  };
  const cls = `inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 font-bold text-sm transition ${styles[kind]} ${className}`;
  if (as === "a") return <a href={href} target={target} rel="noopener noreferrer" className={cls}>{children}</a>;
  return <button type={type} onClick={onClick} className={cls}>{children}</button>;
}
function Stat({ label, value, sub, color = "text-stone-800" }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-4">
      <div className="text-xs text-stone-500 font-bold mb-1.5 tracking-wide">{label}</div>
      <div className={`text-2xl font-extrabold leading-none ${color}`}>{value}</div>
      {sub && <div className="text-xs text-stone-400 mt-1.5">{sub}</div>}
    </div>
  );
}
function Pill({ children, className = "" }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${className}`}>{children}</span>;
}
function WaButtons({ phones, cc, text, label, kind = "wa", cls = "px-3 py-2" }) {
  const list = (phones || []).filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return <Btn as="a" href={waLink(list[0], cc, text)} target="_blank" kind={kind} className={cls}>{label}</Btn>;
  return <>{list.map((p, i) => <Btn key={i} as="a" href={waLink(p, cc, text)} target="_blank" kind={kind} className={cls}>{label} ({i + 1})</Btn>)}</>;
}
function SectionTitle({ title, badge, badgeColor }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-0.5">
      <span className="h-4 w-1.5 rounded-full bg-teal-800"></span>
      <h3 className="font-extrabold text-stone-700">{title}</h3>
      {badge != null && <span className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-xs font-bold ${badgeColor || "bg-stone-200 text-stone-600"}`}>{badge}</span>}
    </div>
  );
}
function Empty({ icon, text, action }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="text-4xl mb-2 opacity-80">{icon}</div>
      <p className="text-stone-400 mb-4">{text}</p>
      {action}
    </div>
  );
}

/* ----------------------------- النماذج ----------------------------- */
function PropertyForm({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [type, setType] = useState(initial?.type || "شقة");
  const [location, setLocation] = useState(initial?.location || "");
  const [note, setNote] = useState(initial?.note || "");
  return (
    <Modal title={initial ? "تعديل العقار" : "إضافة عقار"} onClose={onClose}>
      <Field label="اسم العقار *"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="عمارة الزاوية - شارع البحر" /></Field>
      <Field label="نوع العقار"><Select value={type} onChange={(e) => setType(e.target.value)}>{PROP_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
      <Field label="الموقع"><TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="المدينة / الحي" /></Field>
      <Field label="ملاحظات"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="flex gap-2 mt-2">
        <Btn onClick={() => { if (!name.trim()) return; onSave({ ...(initial || {}), name: name.trim(), type, location, note }); }} className="flex-1">حفظ</Btn>
        <Btn kind="ghost" onClick={onClose}>إلغاء</Btn>
      </div>
    </Modal>
  );
}

function UnitForm({ propertyName, initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [desc, setDesc] = useState(initial?.desc || "");
  return (
    <Modal title={initial ? "تعديل الوحدة" : `إضافة وحدة — ${propertyName}`} onClose={onClose}>
      <p className="text-sm text-stone-500 mb-3">الوحدة هي جزء قابل للتأجير داخل العقار (شقة، محل، مخزن…).</p>
      <Field label="اسم/رقم الوحدة *"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="شقة 1 / محل 3" /></Field>
      <Field label="وصف"><TextInput value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="الطابق الأول، غرفتين…" /></Field>
      <div className="flex gap-2 mt-2">
        <Btn onClick={() => { if (!name.trim()) return; onSave({ ...(initial || {}), id: initial?.id || uid(), name: name.trim(), desc }); }} className="flex-1">حفظ</Btn>
        <Btn kind="ghost" onClick={onClose}>إلغاء</Btn>
      </div>
    </Modal>
  );
}

function TenantForm({ initial, onSave, onClose, defaultCC }) {
  const [name, setName] = useState(initial?.name || "");
  const initPhones = (initial && Array.isArray(initial.phones) && initial.phones.length) ? initial.phones : (initial?.phone ? [initial.phone] : [""]);
  const [phones, setPhones] = useState(initPhones.length ? initPhones : [""]);
  const [nationalId, setNationalId] = useState(initial?.nationalId || "");
  const [note, setNote] = useState(initial?.note || "");
  const setPhoneAt = (i, v) => setPhones((arr) => arr.map((x, j) => (j === i ? v : x)));
  const addPhone = () => setPhones((arr) => [...arr, ""]);
  const removePhone = (i) => setPhones((arr) => arr.filter((_, j) => j !== i));
  return (
    <Modal title={initial ? "تعديل المستأجر" : "إضافة مستأجر"} onClose={onClose}>
      <Field label="اسم المستأجر *"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="mb-3">
        <span className="block text-sm font-semibold text-stone-600 mb-1">أرقام الهاتف (واتساب)</span>
        {phones.map((p, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <input value={p} onChange={(e) => setPhoneAt(i, e.target.value)} type="tel" placeholder="0925545155" className={inputCls} />
            {phones.length > 1 && <button onClick={() => removePhone(i)} className="text-rose-500 text-xl shrink-0 w-8">×</button>}
          </div>
        ))}
        <button onClick={addPhone} className="text-teal-700 text-sm font-bold">+ إضافة رقم آخر</button>
        <span className="block text-xs text-stone-400 mt-1">{phones.filter(Boolean).length ? `سيُرسل إلى: ${phones.filter(Boolean).map((x) => waNumber(x, defaultCC)).join("، ")}` : "أدخل الرقم المحلي بدون رمز الدولة أو مع 00"}</span>
      </div>
      <Field label="رقم الهوية / جواز السفر"><TextInput value={nationalId} onChange={(e) => setNationalId(e.target.value)} /></Field>
      <Field label="ملاحظات"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="flex gap-2 mt-2">
        <Btn onClick={() => { if (!name.trim()) return; const ph = phones.map((x) => x.trim()).filter(Boolean); onSave({ ...(initial || {}), name: name.trim(), phones: ph, phone: ph[0] || "", nationalId, note }); }} className="flex-1">حفظ</Btn>
        <Btn kind="ghost" onClick={onClose}>إلغاء</Btn>
      </div>
    </Modal>
  );
}

function ContractForm({ initial, preset, properties, tenants, contracts, onSave, onClose, onAddTenant }) {
  const [propertyId, setPropertyId] = useState(initial?.propertyId || preset?.presetProperty || (properties[0]?.id || ""));
  const [unitId, setUnitId] = useState(initial?.unitId || preset?.presetUnit || "");
  const [tenantId, setTenantId] = useState(initial?.tenantId || (tenants[0]?.id || ""));
  const [rentType, setRentType] = useState(initial?.rentType || "monthly");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate || todayISO());
  const [endDate, setEndDate] = useState(initial?.endDate || "");
  const [deposit, setDeposit] = useState(initial?.deposit ?? "");
  const [note, setNote] = useState(initial?.note || "");
  const prop = properties.find((p) => p.id === propertyId);
  const units = prop?.units || [];
  const conflict = occupancyConflict(contracts || [], { propertyId, unitId: unitId || null, tenantId, startDate, endDate: endDate || null }, initial?.id);
  const occName = conflict ? (tenants.find((t) => t.id === conflict.tenantId)?.name || "") : "";

  return (
    <Modal title={initial ? "تعديل عقد الإيجار" : "عقد إيجار جديد"} onClose={onClose} wide>
      {tenants.length === 0 && (
        <div className="bg-amber-50 text-amber-800 text-sm rounded-xl p-3 mb-3">
          لا يوجد مستأجرون بعد. <button onClick={onAddTenant} className="underline font-bold">أضف مستأجراً أولاً</button>
        </div>
      )}
      {conflict && (
        <div className="bg-rose-50 text-rose-700 text-sm rounded-xl p-3 mb-3 font-bold">
          ⛔ يتعارض زمنياً مع عقد {conflict.contractNo || ""} للمستأجر «{occName}» على نفس {unitId ? "الوحدة" : "العقار"} ضمن فترة متداخلة. لا يمكن الحفظ — غيّر التواريخ أو الوحدة.
        </div>
      )}
      <Field label="العقار *"><Select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setUnitId(""); }}>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      <Field label="الوحدة (اختياري)" hint="اتركها فارغة إذا كان الإيجار للعقار كاملاً">
        <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">— العقار كاملاً —</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </Field>
      <Field label="المستأجر *"><Select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="نوع الإيجار"><Select value={rentType} onChange={(e) => setRentType(e.target.value)}>{RENT_TYPES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></Field>
        <Field label="قيمة الإيجار / الفترة *"><TextInput value={amount} onChange={(e) => setAmount(e.target.value)} type="number" inputMode="decimal" placeholder="1000" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="تاريخ بداية العقد"><TextInput value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" /></Field>
        <Field label="تاريخ نهاية العقد" hint="اختياري"><TextInput value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date" /></Field>
      </div>
      <Field label="مبلغ التأمين / العربون" hint="اختياري"><TextInput value={deposit} onChange={(e) => setDeposit(e.target.value)} type="number" inputMode="decimal" /></Field>
      <Field label="ملاحظات"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="flex gap-2 mt-2">
        <Btn onClick={() => {
          if (!propertyId || !tenantId || !amount) return;
          onSave({ ...(initial || {}), id: initial?.id || uid(), propertyId, unitId: unitId || null, tenantId, rentType, amount: num(amount), startDate, endDate: endDate || null, deposit: num(deposit), note, status: initial?.status || "active" });
        }} className="flex-1" disabled={tenants.length === 0 || !!conflict}>حفظ العقد</Btn>
        <Btn kind="ghost" onClick={onClose}>إلغاء</Btn>
      </div>
    </Modal>
  );
}

function TransferForm({ contract, properties, contracts, tenantName, placeName, currency, onSave, onClose }) {
  const [propertyId, setPropertyId] = useState(contract.propertyId);
  const [unitId, setUnitId] = useState(contract.unitId || "");
  const [rentType, setRentType] = useState(contract.rentType);
  const [amount, setAmount] = useState(String(num(contract.amount)));
  const [transferDate, setTransferDate] = useState(todayISO());
  const [carry, setCarry] = useState(true);
  const [deposit, setDeposit] = useState(String(num(contract.deposit)));
  const prop = properties.find((p) => p.id === propertyId);
  const units = prop?.units || [];
  const conflict = occupancyConflict(contracts, { propertyId, unitId: unitId || null, tenantId: contract.tenantId, startDate: transferDate, endDate: null }, contract.id);
  const occName = conflict ? tenantName(conflict.tenantId) : "";
  const sameTarget = propertyId === contract.propertyId && (unitId || null) === (contract.unitId || null);
  return (
    <Modal title={`نقل مستأجر — ${tenantName(contract.tenantId)}`} onClose={onClose} wide>
      <div className="bg-stone-50 rounded-xl p-3 text-sm text-stone-600 mb-3">
        من: <span className="font-bold text-stone-800">{placeName(contract)}</span> · إيجار {rentLabel(contract.rentType)} · {fmt(contract.amount)} {currency}
      </div>
      <p className="text-xs text-stone-500 mb-3">سيُنهى العقد الحالي بتاريخ النقل (مع حفظ سجله بالكامل)، ويُفتح عقد جديد للمستأجر نفسه في الموقع الجديد.</p>
      <Field label="إلى عقار"><Select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setUnitId(""); }}>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      <Field label="إلى وحدة (اختياري)"><Select value={unitId} onChange={(e) => setUnitId(e.target.value)}><option value="">— العقار كاملاً —</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
      {sameTarget && <div className="bg-amber-50 text-amber-700 text-sm rounded-xl p-3 mb-3 font-bold">الموقع الجديد هو نفسه الحالي — اختر موقعاً مختلفاً للنقل.</div>}
      {conflict && !sameTarget && <div className="bg-rose-50 text-rose-700 text-sm rounded-xl p-3 mb-3 font-bold">⚠ الموقع الجديد مشغول بعقد نشط للمستأجر «{occName}».</div>}
      <div className="grid grid-cols-2 gap-2">
        <Field label="نوع الإيجار"><Select value={rentType} onChange={(e) => setRentType(e.target.value)}>{RENT_TYPES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></Field>
        <Field label={`قيمة الإيجار (${currency})`}><TextInput value={amount} onChange={(e) => setAmount(e.target.value)} type="number" inputMode="decimal" /></Field>
      </div>
      <Field label="تاريخ النقل" hint="يُنهي العقد القديم ويبدأ الجديد"><TextInput value={transferDate} onChange={(e) => setTransferDate(e.target.value)} type="date" /></Field>
      <label className="flex items-center gap-2 mb-2 text-sm font-semibold text-stone-700">
        <input type="checkbox" checked={carry} onChange={(e) => setCarry(e.target.checked)} className="w-4 h-4" />
        ترحيل مبلغ التأمين/العربون السابق ({fmt(contract.deposit)} {currency})
      </label>
      {!carry && <Field label={`مبلغ تأمين جديد (${currency})`}><TextInput value={deposit} onChange={(e) => setDeposit(e.target.value)} type="number" inputMode="decimal" /></Field>}
      <div className="flex gap-2 mt-2">
        <Btn onClick={() => { if (!amount || sameTarget) return; onSave({ propertyId, unitId: unitId || null, rentType, amount: num(amount), transferDate, deposit: carry ? num(contract.deposit) : num(deposit), note: `نُقل من ${placeName(contract)}` }); }} className="flex-1">تنفيذ النقل</Btn>
        <Btn kind="ghost" onClick={onClose}>إلغاء</Btn>
      </div>
    </Modal>
  );
}

function PaymentForm({ contract, ctx, suggestion, initial, onSave, onClose }) {
  const editing = !!initial;
  const suggestedAmount = suggestion.amount != null ? suggestion.amount : num(contract.amount);
  const [paymentDate, setPaymentDate] = useState(initial?.paymentDate || todayISO());
  const [periodLabel, setPeriodLabel] = useState(initial?.periodLabel ?? suggestion.label);
  const [dueDate, setDueDate] = useState(initial?.dueDate || suggestion.due);
  const [dueAmount, setDueAmount] = useState(String(initial?.dueAmount ?? suggestedAmount));
  const [discount, setDiscount] = useState(initial ? String(initial.discount || "") : "");
  const [discountReason, setDiscountReason] = useState(initial?.discountReason || "");
  const [fine, setFine] = useState(initial ? String(initial.fine || "") : "");
  const [fineReason, setFineReason] = useState(initial?.fineReason || "");
  const [received, setReceived] = useState(String(initial?.received ?? suggestion.defaultReceived ?? suggestedAmount));
  const [method, setMethod] = useState(initial?.method || "نقدي");
  const [note, setNote] = useState(initial?.note || "");

  const net = num(dueAmount) - num(discount) + num(fine);
  const diff = num(received) - net;
  const cur = ctx.settings.currency;

  const startIdx = suggestion.index || 0;
  const existingReceived = suggestion.existingReceived || 0;
  const periods = suggestion.periods || [];
  const monthAmt = (i) => num(periods[i]?.amount || 0);

  const alloc = useMemo(() => {
    const totalAfter = existingReceived + num(received);
    let rem = totalAfter, k = 0;
    for (let i = 0; i < periods.length; i++) { const amt = monthAmt(i); if (amt <= 0.005) { k++; continue; } if (rem + 0.005 >= amt) { rem -= amt; k++; } else break; }
    const newly = []; for (let i = startIdx; i < k; i++) newly.push(i);
    const dueTotal = round2(newly.reduce((s, i) => s + monthAmt(i), 0));
    return { newly, leftover: round2(rem), dueTotal };
  }, [received]);

  // مزامنة البيان/المستحق تلقائياً مع المبلغ المستلم
  useEffect(() => {
    if (!alloc) return;
    if (alloc.newly.length > 0) {
      setPeriodLabel(labelForPeriods(periods, alloc.newly));
      setDueAmount(String(alloc.dueTotal));
      setDueDate((periods[alloc.newly[0]] || {}).due || dueDate);
    } else {
      const ps = periods[startIdx] || {};
      setPeriodLabel(ps.label || periodLabel); setDueAmount(String(num(ps.amount))); setDueDate(ps.due || dueDate);
    }
  }, [received]);

  const creditApplied = alloc && alloc.newly.length > 0 ? Math.max(0, round2(alloc.dueTotal - num(received))) : 0;
  const statusKey = !alloc ? null : (alloc.newly.length > 0 ? "paid" : (num(received) > 0 ? "partial" : "unpaid"));

  let banner;
  if (num(received) <= 0) banner = <div className="rounded-xl bg-stone-100 text-stone-600 p-3 text-sm font-bold">لم يُستلم مبلغ بعد — ستُسجّل كغير مسدّدة.</div>;
  else if (alloc.newly.length > 0) {
    const months = labelForPeriods(periods, alloc.newly).replace(/^إيجار( شهر)?:?\s*/, "");
    const fromOld = [...new Set(alloc.newly.map((i) => periods[i]?.contractNo).filter((x) => x && x !== contract.contractNo))];
    banner = (
      <div className="rounded-xl bg-emerald-50 text-emerald-700 p-3 text-sm font-bold space-y-1">
        <div>✓ تُغطّي هذه الدفعة: {months} ({alloc.newly.length === 1 ? "شهر واحد" : monthWord(alloc.newly.length)}).</div>
        {fromOld.length > 0 && <div className="text-rose-600">تشمل تسوية متأخرات من عقد {fromOld.join("، ")} (الأقدم أولاً).</div>}
        {creditApplied > 0 && <div className="text-sky-700">منها {fmt(creditApplied)} {cur} خُصمت من رصيد سابق للمستأجر.</div>}
        {alloc.leftover > 0.005 && <div className="text-sky-700">يتبقّى رصيد {fmt(alloc.leftover)} {cur} (لكم) يُرحّل للفترة القادمة.</div>}
      </div>
    );
  } else {
    const ps = periods[startIdx] || {};
    banner = <div className="rounded-xl bg-amber-50 text-amber-700 p-3 text-sm font-bold">المبلغ لا يكمل {(ps.label || "").replace(/^إيجار /, "")}. سيُسجّل ويُرحّل النقص على المستأجر حتى استكمال السداد.</div>;
  }

  return (
    <Modal title={`${editing ? "تعديل إيصال " + (initial.receiptNo || "") : "تسجيل دفعة"} — ${ctx.tenantName(contract.tenantId)}`} onClose={onClose} wide>
      <div className="bg-teal-50 text-teal-800 rounded-xl p-3 text-sm mb-3">
        {ctx.placeName(contract)} · إيجار {rentLabel(contract.rentType)} · {fmt(contract.amount)} {cur}
      </div>
      {!editing && suggestion.prorated && (
        <div className="bg-amber-50 text-amber-800 rounded-xl p-3 text-sm mb-3 font-bold">
          فترة أولى متناسبة: {suggestion.days} يوم — المبلغ محسوب بالتناسب ({fmt(suggestedAmount)} {cur}). الفترات التالية ستكون كاملة.
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="تاريخ الاستلام"><TextInput value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} type="date" /></Field>
        <Field label="تاريخ الاستحقاق"><TextInput value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" /></Field>
      </div>
      <Field label="الفترة / البيان"><TextInput value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} /></Field>
      <Field label={`المبلغ المستحق (${cur})`}><TextInput value={dueAmount} onChange={(e) => setDueAmount(e.target.value)} type="number" inputMode="decimal" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={`خصم (${cur})`}><TextInput value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" inputMode="decimal" placeholder="0" /></Field>
        <Field label="سبب الخصم"><TextInput value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="..." /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={`غرامة (${cur})`}><TextInput value={fine} onChange={(e) => setFine(e.target.value)} type="number" inputMode="decimal" placeholder="0" /></Field>
        <Field label="سبب الغرامة"><TextInput value={fineReason} onChange={(e) => setFineReason(e.target.value)} placeholder="تأخر السداد..." /></Field>
      </div>
      <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 mb-3 text-sm flex justify-between font-bold text-stone-700">
        <span>صافي المستحق بعد الخصم/الغرامة</span><span>{fmt(net)} {cur}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={`المبلغ المستلم (${cur}) *`}><TextInput value={received} onChange={(e) => setReceived(e.target.value)} type="number" inputMode="decimal" /></Field>
        <Field label="طريقة الدفع"><Select value={method} onChange={(e) => setMethod(e.target.value)}><option>نقدي</option><option>تحويل مصرفي</option><option>شيك</option><option>أخرى</option></Select></Field>
      </div>
      <div className="mb-3">{banner}</div>
      <Field label="ملاحظات"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="flex gap-2 mt-2">
        <Btn onClick={() => onSave(editing ? {
          ...initial, paymentDate, dueDate, periodLabel,
          dueAmount: num(dueAmount), discount: num(discount), discountReason,
          fine: num(fine), fineReason, received: num(received), method, note, statusKey, creditApplied,
        } : {
          id: uid(), contractId: contract.id, paymentDate, dueDate, periodLabel,
          dueAmount: num(dueAmount), discount: num(discount), discountReason,
          fine: num(fine), fineReason, received: num(received), method, note,
          periodIndex: startIdx, statusKey, creditApplied,
        })} className="flex-1">{editing ? "حفظ التعديل" : "حفظ وإصدار الإيصال"}</Btn>
        <Btn kind="ghost" onClick={onClose}>إلغاء</Btn>
      </div>
    </Modal>
  );
}

function ExpenseForm({ properties, onSave, onClose, currency }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id || "");
  const [date, setDate] = useState(todayISO());
  const [cat, setCat] = useState(EXPENSE_CATS[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <Modal title="إضافة مصروف" onClose={onClose}>
      <Field label="العقار"><Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">— عام —</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="التاريخ"><TextInput value={date} onChange={(e) => setDate(e.target.value)} type="date" /></Field>
        <Field label="النوع"><Select value={cat} onChange={(e) => setCat(e.target.value)}>{EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      </div>
      <Field label={`المبلغ (${currency}) *`}><TextInput value={amount} onChange={(e) => setAmount(e.target.value)} type="number" inputMode="decimal" /></Field>
      <Field label="ملاحظات"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="flex gap-2 mt-2">
        <Btn onClick={() => { if (!amount) return; onSave({ id: uid(), propertyId, date, cat, amount: num(amount), note }); }} className="flex-1">حفظ</Btn>
        <Btn kind="ghost" onClick={onClose}>إلغاء</Btn>
      </div>
    </Modal>
  );
}

function SettingsForm({ settings, onSave, onClose }) {
  const [s, setS] = useState({ ...settings });
  const set = (k, v) => setS((o) => ({ ...o, [k]: v }));
  const handleLogo = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 320; const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        set("logo", cv.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };
  return (
    <Modal title="الإعدادات" onClose={onClose}>
      <Field label="اسم المالك / المؤسسة"><TextInput value={s.org} onChange={(e) => set("org", e.target.value)} /></Field>
      <Field label="هاتف المالك (يظهر بالإيصال)"><TextInput value={s.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} type="tel" /></Field>
      <Field label="شعار المؤسسة (يظهر في الإيصال)">
        {s.logo ? (
          <div className="flex items-center gap-3">
            <div className="bg-teal-800 rounded-xl p-2"><img src={s.logo} alt="شعار" className="w-14 h-14 object-contain" /></div>
            <button onClick={() => set("logo", "")} className="text-rose-500 text-sm font-bold">إزالة الشعار</button>
          </div>
        ) : (
          <input type="file" accept="image/*" onChange={(e) => handleLogo(e.target.files && e.target.files[0])} className="text-sm w-full" />
        )}
      </Field>
      <label className="flex items-center gap-2 mb-3 text-sm font-semibold text-stone-700">
        <input type="checkbox" checked={!!s.logoOnly} onChange={(e) => set("logoOnly", e.target.checked)} className="w-4 h-4" />
        إظهار الشعار فقط (بدون اسم المؤسسة)
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Field label="العملة"><TextInput value={s.currency} onChange={(e) => set("currency", e.target.value)} placeholder="د.ل" /></Field>
        <Field label="رمز الدولة (واتساب)" hint="ليبيا = 218"><TextInput value={s.countryCode} onChange={(e) => set("countryCode", e.target.value)} placeholder="218" /></Field>
      </div>
      <Field label="بادئة رقم الإيصال"><TextInput value={s.receiptPrefix} onChange={(e) => set("receiptPrefix", e.target.value)} placeholder="REC-" /></Field>
      <Field label="التنبيه قبل انتهاء العقد بـ (أيام)" hint="يظهر في لوحة الرئيسية"><TextInput value={s.expiryAlertDays} onChange={(e) => set("expiryAlertDays", e.target.value)} type="number" inputMode="numeric" placeholder="30" /></Field>
      <div className="mb-3">
        <span className="block text-sm font-semibold text-stone-600 mb-1">الشروط العامة للعقد</span>
        <textarea value={s.contractTerms ?? ""} onChange={(e) => set("contractTerms", e.target.value)} rows={6} placeholder={"اتركها فارغة لاستخدام الشروط الافتراضية. أو اكتب كل شرط في سطر مستقل."} className={inputCls} />
        <span className="block text-xs text-stone-400 mt-1">كل سطر = شرط. تُرقَّم تلقائياً وتُضاف لكل عقد يُرسل.</span>
      </div>
      <div className="flex gap-2 mt-2">
        <Btn onClick={() => onSave(s)} className="flex-1">حفظ</Btn>
        <Btn kind="ghost" onClick={onClose}>إلغاء</Btn>
      </div>
    </Modal>
  );
}

/* ===== أدوات توليد PDF/صورة للإيصال ومشاركته ===== */
function loadImage(src) { return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
function canvasToBlob(canvas, type, q) { return new Promise((res, rej) => { try { if (canvas.toBlob) canvas.toBlob((b) => b ? res(b) : rej(new Error("toBlob")), type, q); else { const u = canvas.toDataURL(type, q), bin = atob(u.split(",")[1]), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); res(new Blob([arr], { type })); } } catch (e) { rej(e); } }); }
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/* بناء ملف PDF بصفحة واحدة تحتوي صورة JPEG — بدون أي مكتبة خارجية */
function buildImagePdf(jpegB64, wpx, hpx) {
  const jpeg = atob(jpegB64);
  const pageW = 595.28, scale = pageW / wpx, imgW = pageW, imgH = hpx * scale, pageH = imgH;
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objs[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pageW.toFixed(2) + " " + pageH.toFixed(2) + "] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>";
  objs[4] = "<< /Type /XObject /Subtype /Image /Width " + wpx + " /Height " + hpx + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n" + jpeg + "\nendstream";
  const content = "q " + imgW.toFixed(2) + " 0 0 " + imgH.toFixed(2) + " 0 0 cm /Im0 Do Q";
  objs[5] = "<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream";
  let pdf = "%PDF-1.4\n"; const offsets = [];
  for (let i = 1; i < objs.length; i++) { offsets[i] = pdf.length; pdf += i + " 0 obj\n" + objs[i] + "\nendobj\n"; }
  const xrefStart = pdf.length;
  pdf += "xref\n0 " + objs.length + "\n0000000000 65535 f \n";
  for (let i = 1; i < objs.length; i++) pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf += "trailer\n<< /Size " + objs.length + " /Root 1 0 R >>\nstartxref\n" + xrefStart + "\n%%EOF";
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}

async function shareCanvasDoc(canvas, fileBase, caption, ctx, phones, cc) {
  let pdfBlob = null;
  try { const jpeg = canvas.toDataURL("image/jpeg", 0.92); pdfBlob = buildImagePdf(jpeg.split(",")[1], canvas.width, canvas.height); } catch (e) {}
  const pdfFile = pdfBlob ? new File([pdfBlob], fileBase + ".pdf", { type: "application/pdf" }) : null;
  // 1) مشاركة PDF مباشرة عبر لوحة المشاركة (واتساب…)
  if (pdfFile) {
    try { if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) { await navigator.share({ files: [pdfFile], title: fileBase, text: caption }); return; } }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  // 2) مشاركة كصورة (دعم أوسع)
  let imgBlob = null;
  try {
    imgBlob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    const imgFile = new File([imgBlob], fileBase + ".jpg", { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [imgFile] })) { await navigator.share({ files: [imgFile], title: fileBase, text: caption }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  // 3) بديل: تنزيل PDF + فتح محادثة واتساب بالنص ليُرفق الملف يدوياً
  const blob = pdfBlob || imgBlob || await canvasToBlob(canvas, "image/jpeg", 0.92);
  const ext = pdfBlob ? "pdf" : "jpg";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = fileBase + "." + ext; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  if (phones && phones.length) { try { window.open(waLink(phones[0], cc, caption), "_blank"); } catch (e) {} }
  ctx.toast && ctx.toast(`أُنشئ ${ext.toUpperCase()} وحُفظ — افتح واتساب وأرفقه في المحادثة`);
}

async function shareCanvasImage(canvas, fileBase, caption, ctx, phones, cc) {
  let imgBlob = null;
  try { imgBlob = await canvasToBlob(canvas, "image/jpeg", 0.92); } catch (e) {}
  if (imgBlob) {
    const imgFile = new File([imgBlob], fileBase + ".jpg", { type: "image/jpeg" });
    try { if (navigator.canShare && navigator.canShare({ files: [imgFile] })) { await navigator.share({ files: [imgFile], title: fileBase, text: caption }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    const url = URL.createObjectURL(imgBlob); const a = document.createElement("a"); a.href = url; a.download = fileBase + ".jpg"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  if (phones && phones.length) { try { window.open(waLink(phones[0], cc, caption), "_blank"); } catch (e) {} }
  ctx.toast && ctx.toast("أُنشئت الصورة وحُفظت — أرفقها في محادثة واتساب");
}

async function drawReceiptCanvas(payment, ctx) {
  try { await document.fonts.ready; } catch (e) {}
  const cur = ctx.settings.currency || "";
  const c = ctx.contractById(payment.contractId);
  const st = paymentStatus(payment);
  const rows = [];
  rows.push(["المستأجر", c ? ctx.tenantName(c.tenantId) : "—"]);
  rows.push(["الوحدة / العقار", c ? ctx.placeName(c) : "—"]);
  rows.push(["البيان", payment.periodLabel || "—"]);
  rows.push(["نوع الإيجار", c ? rentLabel(c.rentType) : "—"]);
  rows.push(["__sep__", ""]);
  rows.push(["المبلغ المستحق", fmt(payment.dueAmount) + " " + cur]);
  if (num(payment.discount) > 0) rows.push(["خصم" + (payment.discountReason ? " (" + payment.discountReason + ")" : ""), "- " + fmt(payment.discount) + " " + cur]);
  if (num(payment.fine) > 0) rows.push(["غرامة" + (payment.fineReason ? " (" + payment.fineReason + ")" : ""), "+ " + fmt(payment.fine) + " " + cur]);
  rows.push(["صافي المستحق", fmt(st.net) + " " + cur, true]);
  rows.push(["المبلغ المستلم", fmt(payment.received) + " " + cur, true]);
  if (num(payment.creditApplied) > 0.005) rows.push(["مخصوم من رصيد سابق", fmt(payment.creditApplied) + " " + cur]);
  if (st.key === "partial") rows.push(["المتبقي (نقص)", fmt(Math.abs(st.diff)) + " " + cur]);
  if (st.key === "surplus") rows.push(["الزيادة", fmt(st.diff) + " " + cur]);
  rows.push(["طريقة الدفع", payment.method || "—"]);
  if (c && ctx.contractLedger) { const L = ctx.contractLedger(c); rows.push(["الرصيد الحالي", L.owed > 0.005 ? fmt(L.owed) + " " + cur + " (عليكم)" : L.credit > 0.005 ? fmt(L.credit) + " " + cur + " (لكم)" : "0 " + cur + " (مسوّى)", true]); }

  const W = 760, pad = 40, rowH = 40;
  const headerH = ctx.settings.logo ? 168 : 132, metaH = 46, stampH = 96, footerH = ctx.settings.ownerPhone ? 34 : 14;
  const H = headerH + metaH + 12 + rows.length * rowH + stampH + footerH + 16;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale; canvas.height = Math.round(H) * scale;
  const g = canvas.getContext("2d");
  g.scale(scale, scale); g.textBaseline = "middle";
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#115e59"; g.fillRect(0, 0, W, headerH);
  let topY = 30;
  if (ctx.settings.logo) {
    try {
      const img = await loadImage(ctx.settings.logo);
      const lh = 56, lw = img.width * (lh / img.height);
      g.fillStyle = "#fff"; roundRect(g, W / 2 - lw / 2 - 8, topY - 8, lw + 16, lh + 16, 10); g.fill();
      g.drawImage(img, W / 2 - lw / 2, topY, lw, lh); topY += lh + 18;
    } catch (e) {}
  }
  g.textAlign = "center"; g.direction = "rtl";
  if (!ctx.settings.logoOnly) { g.fillStyle = "#ffffff"; g.font = "bold 30px Cairo, sans-serif"; g.fillText(ctx.settings.org || "إيصال قبض", W / 2, topY + 8); topY += 34; }
  g.fillStyle = "#99f6e4"; g.font = "16px Cairo, sans-serif"; g.fillText("إيصال قبض إيجار", W / 2, topY + 6);
  g.fillStyle = "#fbbf24"; roundRect(g, W / 2 - 34, headerH - 20, 68, 5, 3); g.fill();

  let y = headerH;
  g.fillStyle = "#f5f5f4"; g.fillRect(0, y, W, metaH);
  g.fillStyle = "#115e59"; g.font = "bold 18px Cairo, sans-serif"; g.textAlign = "right"; g.fillText(payment.receiptNo || "", W - pad, y + metaH / 2);
  g.fillStyle = "#78716c"; g.font = "15px Cairo, sans-serif"; g.textAlign = "left"; g.fillText(payment.paymentDate || "", pad, y + metaH / 2);
  y += metaH + 12;

  rows.forEach(([k, v, bold]) => {
    if (k === "__sep__") { g.strokeStyle = "#d6d3d1"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(pad, y + rowH / 2); g.lineTo(W - pad, y + rowH / 2); g.stroke(); g.setLineDash([]); y += rowH; return; }
    g.fillStyle = bold ? "#1c1917" : "#57534e"; g.font = (bold ? "bold " : "") + "17px Cairo, sans-serif"; g.textAlign = "right"; g.fillText(k, W - pad, y + rowH / 2);
    g.fillStyle = bold ? "#115e59" : "#44403c"; g.font = (bold ? "bold " : "") + "17px Cairo, sans-serif"; g.textAlign = "left"; g.fillText(v, pad, y + rowH / 2);
    y += rowH;
  });

  y += 10;
  const sc = { paid: ["#10b981", "#059669"], surplus: ["#0ea5e9", "#0284c7"], partial: ["#f59e0b", "#d97706"], unpaid: ["#f43f5e", "#e11d48"] }[st.key];
  g.save(); g.translate(W / 2, y + 26); g.rotate(-6 * Math.PI / 180);
  g.strokeStyle = sc[0]; g.lineWidth = 4; roundRect(g, -130, -26, 260, 52, 10); g.stroke();
  g.fillStyle = sc[1]; g.font = "bold 22px Cairo, sans-serif"; g.textAlign = "center"; g.direction = "rtl"; g.fillText(st.label, 0, 2);
  g.restore(); y += stampH;
  if (ctx.settings.ownerPhone) { g.fillStyle = "#a8a29e"; g.font = "13px Cairo, sans-serif"; g.textAlign = "center"; g.fillText("للتواصل: " + ctx.settings.ownerPhone, W / 2, y); }
  return canvas;
}

async function shareReceiptImage(payment, ctx) {
  try {
    ctx.toast && ctx.toast("جارٍ التحضير…");
    const canvas = await drawReceiptCanvas(payment, ctx);
    const c = ctx.contractById(payment.contractId);
    const phones = c ? ctx.tenantPhones(c.tenantId) : [];
    await shareCanvasImage(canvas, payment.receiptNo || "receipt", ctx.receiptText(payment), ctx, phones, ctx.settings.countryCode);
  } catch (e) { ctx.toast && ctx.toast("تعذّر إنشاء الصورة — استخدم زر الطباعة"); }
}

async function shareReceiptFile(payment, ctx) {
  try {
    ctx.toast && ctx.toast("جارٍ إنشاء PDF…");
    const canvas = await drawReceiptCanvas(payment, ctx);
    const c = ctx.contractById(payment.contractId);
    const phones = c ? ctx.tenantPhones(c.tenantId) : [];
    await shareCanvasDoc(canvas, payment.receiptNo || "receipt", ctx.receiptText(payment), ctx, phones, ctx.settings.countryCode);
  } catch (e) { ctx.toast && ctx.toast("تعذّر إنشاء الملف — استخدم زر الطباعة"); }
}

async function drawContractCanvas(c, ctx) {
  try { await document.fonts.ready; } catch (e) {}
  const cur = ctx.settings.currency || "";
  const rows = [];
  rows.push(["المؤجر", (ctx.settings.org || "—") + (ctx.settings.ownerPhone ? " — " + ctx.settings.ownerPhone : "")]);
  rows.push(["المستأجر", ctx.tenantName(c.tenantId)]);
  rows.push(["العين المؤجرة", ctx.placeName(c)]);
  if (c.contractNo) rows.push(["رقم العقد", c.contractNo]);
  rows.push(["__sep__", ""]);
  rows.push(["قيمة الإيجار", fmt(c.amount) + " " + cur + " / " + rentLabel(c.rentType), true]);
  rows.push(["تاريخ البداية", c.startDate || "—"]);
  if (c.endDate) rows.push(["تاريخ النهاية", c.endDate]);
  if (num(c.deposit) > 0) rows.push(["التأمين / العربون", fmt(c.deposit) + " " + cur]);
  if (c.note) rows.push(["ملاحظات", c.note]);

  const terms = (ctx.settings.contractTerms && ctx.settings.contractTerms.trim()) ? ctx.settings.contractTerms.split("\n").map((x) => x.trim()).filter(Boolean) : DEFAULT_TERMS;
  const W = 760, pad = 40, rowH = 40, termsW = W - pad * 2 - 18;
  // قياس مؤقت لِلَفّ نصوص الشروط
  const measureCanvas = document.createElement("canvas"); const mg = measureCanvas.getContext("2d");
  mg.font = "14px Cairo, sans-serif"; mg.direction = "rtl";
  const wrap = (text) => {
    const words = text.split(" "); const out = []; let line = "";
    for (const w of words) { const test = line ? line + " " + w : w; if (mg.measureText(test).width > termsW && line) { out.push(line); line = w; } else line = test; }
    if (line) out.push(line); return out;
  };
  const termLines = terms.map((t, i) => wrap(`${i + 1}. ${t}`));
  const totalTermLines = termLines.reduce((s, a) => s + a.length, 0);
  const termsBlockH = 30 + totalTermLines * 22 + 10;

  const headerH = ctx.settings.logo ? 168 : 132, footerH = 40;
  const H = headerH + 16 + rows.length * rowH + termsBlockH + footerH + 16;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale; canvas.height = Math.round(H) * scale;
  const g = canvas.getContext("2d");
  g.scale(scale, scale); g.textBaseline = "middle";
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#115e59"; g.fillRect(0, 0, W, headerH);
  let topY = 30;
  if (ctx.settings.logo) {
    try { const img = await loadImage(ctx.settings.logo); const lh = 56, lw = img.width * (lh / img.height); g.fillStyle = "#fff"; roundRect(g, W / 2 - lw / 2 - 8, topY - 8, lw + 16, lh + 16, 10); g.fill(); g.drawImage(img, W / 2 - lw / 2, topY, lw, lh); topY += lh + 18; } catch (e) {}
  }
  g.textAlign = "center"; g.direction = "rtl";
  if (!ctx.settings.logoOnly) { g.fillStyle = "#ffffff"; g.font = "bold 30px Cairo, sans-serif"; g.fillText(ctx.settings.org || "عقد إيجار", W / 2, topY + 8); topY += 34; }
  g.fillStyle = "#99f6e4"; g.font = "16px Cairo, sans-serif"; g.fillText("عقد إيجار · LEASE CONTRACT", W / 2, topY + 6);
  g.fillStyle = "#fbbf24"; roundRect(g, W / 2 - 34, headerH - 20, 68, 5, 3); g.fill();

  let y = headerH + 16;
  rows.forEach(([k, v, bold]) => {
    if (k === "__sep__") { g.strokeStyle = "#d6d3d1"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(pad, y + rowH / 2); g.lineTo(W - pad, y + rowH / 2); g.stroke(); g.setLineDash([]); y += rowH; return; }
    g.fillStyle = bold ? "#1c1917" : "#57534e"; g.font = (bold ? "bold " : "") + "17px Cairo, sans-serif"; g.textAlign = "right"; g.fillText(k, W - pad, y + rowH / 2);
    g.fillStyle = bold ? "#115e59" : "#44403c"; g.font = (bold ? "bold " : "") + "17px Cairo, sans-serif"; g.textAlign = "left"; g.fillText(v, pad, y + rowH / 2);
    y += rowH;
  });
  // الشروط العامة
  g.strokeStyle = "#d6d3d1"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke(); g.setLineDash([]);
  y += 18;
  g.fillStyle = "#115e59"; g.font = "bold 17px Cairo, sans-serif"; g.textAlign = "right"; g.direction = "rtl"; g.fillText("الشروط العامة:", W - pad, y);
  y += 22;
  g.fillStyle = "#44403c"; g.font = "14px Cairo, sans-serif";
  termLines.forEach((lns) => { lns.forEach((ln) => { g.textAlign = "right"; g.fillText(ln, W - pad, y); y += 22; }); });
  y += 12;
  g.fillStyle = "#a8a29e"; g.font = "13px Cairo, sans-serif"; g.textAlign = "center";
  g.fillText("حُرّر بتاريخ " + todayISO() + " ووقّع الطرفان على قبول ما ورد فيه.", W / 2, y);
  return canvas;
}
async function shareContractImage(c, ctx) {
  try {
    ctx.toast && ctx.toast("جارٍ التحضير…");
    const canvas = await drawContractCanvas(c, ctx);
    await shareCanvasImage(canvas, "contract-" + (c.contractNo || "عقد"), ctx.contractText(c), ctx, ctx.tenantPhones(c.tenantId), ctx.settings.countryCode);
  } catch (e) { ctx.toast && ctx.toast("تعذّر إنشاء الصورة — استخدم زر الطباعة"); }
}
async function shareContractFile(c, ctx) {
  try {
    ctx.toast && ctx.toast("جارٍ إنشاء PDF…");
    const canvas = await drawContractCanvas(c, ctx);
    await shareCanvasDoc(canvas, "contract-" + (c.contractNo || "عقد"), ctx.contractText(c), ctx, ctx.tenantPhones(c.tenantId), ctx.settings.countryCode);
  } catch (e) { ctx.toast && ctx.toast("تعذّر إنشاء الملف — استخدم زر الطباعة"); }
}
async function drawStatementCanvas(data, settings) {
  try { await document.fonts.ready; } catch (e) {}
  const cur = settings.currency || "";
  const W = 760, pad = 40;
  const lineH = { h2: 34, sub: 26, row: 30, total: 30, bal: 34, space: 14, grand: 30 };
  const headerH = settings.logo ? 168 : 132;
  let bodyH = 56;
  data.blocks.forEach((b) => { bodyH += (lineH[b.t] || 28); });
  if (data.grand) bodyH += 18 + lineH.grand * 3 + 16;
  const H = headerH + 12 + bodyH + 30;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale; canvas.height = Math.round(H) * scale;
  const g = canvas.getContext("2d"); g.scale(scale, scale); g.textBaseline = "middle";
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#115e59"; g.fillRect(0, 0, W, headerH);
  let topY = 30;
  if (settings.logo) { try { const img = await loadImage(settings.logo); const lh = 56, lw = img.width * (lh / img.height); g.fillStyle = "#fff"; roundRect(g, W / 2 - lw / 2 - 8, topY - 8, lw + 16, lh + 16, 10); g.fill(); g.drawImage(img, W / 2 - lw / 2, topY, lw, lh); topY += lh + 18; } catch (e) {} }
  g.textAlign = "center"; g.direction = "rtl";
  if (!settings.logoOnly) { g.fillStyle = "#fff"; g.font = "bold 30px Cairo, sans-serif"; g.fillText(settings.org || "كشف حساب", W / 2, topY + 8); topY += 34; }
  g.fillStyle = "#99f6e4"; g.font = "16px Cairo, sans-serif"; g.fillText("كشف حساب · STATEMENT", W / 2, topY + 6);
  g.fillStyle = "#fbbf24"; roundRect(g, W / 2 - 34, headerH - 20, 68, 5, 3); g.fill();
  let y = headerH + 8;
  g.fillStyle = "#f5f5f4"; g.fillRect(0, y, W, 46);
  g.fillStyle = "#115e59"; g.font = "bold 18px Cairo, sans-serif"; g.textAlign = "right"; g.direction = "rtl"; g.fillText(data.tenant, W - pad, y + 23);
  g.fillStyle = "#78716c"; g.font = "14px Cairo, sans-serif"; g.textAlign = "left"; g.fillText("حتى " + data.date, pad, y + 23);
  y += 56;
  const stClr = { paid: "#059669", partial: "#d97706", unpaid: "#e11d48" };
  const stTxt = { paid: "مسدّد", partial: "جزئي", unpaid: "غير مسدّد" };
  data.blocks.forEach((b) => {
    if (b.t === "space") { y += lineH.space; return; }
    if (b.t === "h2") { g.fillStyle = "#115e59"; g.font = "bold 16px Cairo, sans-serif"; g.textAlign = "right"; g.fillText(b.text, W - pad, y + 17); y += lineH.h2; return; }
    if (b.t === "sub") { g.fillStyle = "#a8a29e"; g.font = "13px Cairo, sans-serif"; g.textAlign = "right"; g.fillText(b.text, W - pad, y + 13); y += lineH.sub; return; }
    if (b.t === "row") { g.fillStyle = "#44403c"; g.font = "14px Cairo, sans-serif"; g.textAlign = "right"; g.fillText(b.text, W - pad, y + 15); g.fillStyle = stClr[b.status] || "#44403c"; g.font = "bold 13px Cairo, sans-serif"; g.textAlign = "left"; g.fillText(stTxt[b.status] || "", pad, y + 15); y += lineH.row; return; }
    if (b.t === "total") { g.fillStyle = "#57534e"; g.font = "14px Cairo, sans-serif"; g.textAlign = "right"; g.fillText(b.text + " " + cur, W - pad, y + 15); y += lineH.total; return; }
    if (b.t === "bal") { g.fillStyle = stClr[b.status] || "#115e59"; g.font = "bold 16px Cairo, sans-serif"; g.textAlign = "right"; g.fillText(b.text, W - pad, y + 16); y += lineH.bal; return; }
  });
  if (data.grand) {
    g.strokeStyle = "#d6d3d1"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke(); g.setLineDash([]); y += 18;
    g.fillStyle = "#1c1917"; g.font = "bold 17px Cairo, sans-serif"; g.textAlign = "right"; g.fillText("الإجمالي العام", W - pad, y + 16); y += lineH.grand;
    g.fillStyle = "#57534e"; g.font = "14px Cairo, sans-serif"; g.fillText(`المستحق ${fmt(data.grand.billed)} · المسدّد ${fmt(data.grand.received)} ${cur}`, W - pad, y + 14); y += lineH.grand;
    g.fillStyle = data.grand.color || "#115e59"; g.font = "bold 16px Cairo, sans-serif"; g.fillText(data.grand.balanceText, W - pad, y + 16); y += lineH.grand;
  }
  return canvas;
}
async function shareStatementImage(data, text, phones, cc, ctx) {
  try { ctx.toast && ctx.toast("جارٍ التحضير…"); const canvas = await drawStatementCanvas(data, ctx.settings); await shareCanvasDoc(canvas, "statement-" + data.tenant, text, ctx, phones, cc); }
  catch (e) { ctx.toast && ctx.toast("تعذّر إنشاء الكشف — استخدم زر الطباعة"); }
}

function ContractView({ contract, ctx, onClose }) {
  const cur = ctx.settings.currency; const c = contract; const text = ctx.contractText(c);
  return (
    <Modal title={`عقد إيجار — ${ctx.tenantName(c.tenantId)}`} onClose={onClose} wide>
      <div id="print-area" className="rounded-2xl overflow-hidden border border-stone-200 bg-white shadow-sm">
        <div className="bg-teal-800 text-white px-5 py-5 text-center">
          {ctx.settings.logo && <div className="inline-flex bg-white rounded-xl p-2 mb-2"><img src={ctx.settings.logo} alt="شعار" className="h-12 object-contain" /></div>}
          {!ctx.settings.logoOnly && <div className="font-amiri text-2xl font-bold leading-tight">{ctx.settings.org || "عقد إيجار"}</div>}
          <div className="text-teal-200 text-xs mt-1 tracking-widest">عقد إيجار · LEASE CONTRACT</div>
          <div className="h-1 w-16 bg-amber-400 rounded-full mx-auto mt-3"></div>
        </div>
        <div className="p-5 space-y-2.5 text-sm">
          <Row k="المؤجر" v={`${ctx.settings.org || "—"}${ctx.settings.ownerPhone ? " — " + ctx.settings.ownerPhone : ""}`} />
          <Row k="المستأجر" v={ctx.tenantName(c.tenantId)} />
          <Row k="العين المؤجرة" v={ctx.placeName(c)} />
          {c.contractNo && <Row k="رقم العقد" v={c.contractNo} />}
          <div className="border-t border-dashed border-stone-300 my-1"></div>
          <Row k="قيمة الإيجار" v={`${fmt(c.amount)} ${cur} / ${rentLabel(c.rentType)}`} bold accent />
          <Row k="تاريخ البداية" v={c.startDate || "—"} />
          {c.endDate && <Row k="تاريخ النهاية" v={c.endDate} />}
          {num(c.deposit) > 0 && <Row k="التأمين / العربون" v={`${fmt(c.deposit)} ${cur}`} />}
          {c.note && <Row k="ملاحظات" v={c.note} />}
          <div className="border-t border-dashed border-stone-300 my-1"></div>
          <div className="font-bold text-stone-800">الشروط العامة:</div>
          <ol className="list-decimal pr-5 space-y-1 text-stone-600 text-xs leading-relaxed">
            {((ctx.settings.contractTerms && ctx.settings.contractTerms.trim()) ? ctx.settings.contractTerms.split("\n").map((x) => x.trim()).filter(Boolean) : DEFAULT_TERMS).map((t, i) => <li key={i}>{t}</li>)}
          </ol>
        </div>
        <div className="pb-4 px-5 text-center text-xs text-stone-400">حُرّر بتاريخ {todayISO()} ووقّع الطرفان على قبول ما ورد فيه.</div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4 no-print">
        <WaButtons phones={ctx.tenantPhones(c.tenantId)} cc={ctx.settings.countryCode} text={text} label="واتساب (نص)" />
        <Btn kind="wa" onClick={() => shareContractImage(c, ctx)}>إرسال صورة عبر واتساب</Btn>
        <Btn kind="wa" onClick={() => shareContractFile(c, ctx)}>إرسال PDF عبر واتساب</Btn>
        <Btn kind="ghost" onClick={() => window.print()}>حفظ PDF / طباعة</Btn>
        <Btn kind="ghost" onClick={() => ctx.copy(text)}>نسخ النص</Btn>
        <Btn kind="ghost" onClick={onClose}>إغلاق</Btn>
      </div>
    </Modal>
  );
}

function StatementView({ data, text, phones, ctx, onClose }) {
  const stClr = { paid: "text-emerald-600", partial: "text-amber-600", unpaid: "text-rose-600" };
  const stTxt = { paid: "مسدّد", partial: "جزئي", unpaid: "غير مسدّد" };
  return (
    <Modal title={`كشف حساب — ${data.tenant}`} onClose={onClose} wide>
      <div id="print-area" className="receipt-print bg-white rounded-2xl border border-stone-200 overflow-hidden mb-1">
        <div className="bg-teal-800 text-white text-center py-4 px-3">
          {ctx.settings.logo && <img src={ctx.settings.logo} alt="" className="h-12 mx-auto mb-2 bg-white rounded-lg p-1" />}
          {!ctx.settings.logoOnly && <div className="font-extrabold text-xl">{ctx.settings.org || "كشف حساب"}</div>}
          <div className="text-teal-200 text-sm">كشف حساب · STATEMENT</div>
        </div>
        <div className="flex justify-between items-center bg-stone-100 px-5 py-2 text-sm">
          <span className="font-bold text-teal-800">{data.tenant}</span>
          <span className="text-stone-500">حتى {data.date}</span>
        </div>
        <div className="p-5 space-y-1 text-sm">
          {data.blocks.map((b, i) => {
            if (b.t === "space") return <div key={i} className="h-2"></div>;
            if (b.t === "h2") return <div key={i} className="font-bold text-teal-800 pt-1">{b.text}</div>;
            if (b.t === "sub") return <div key={i} className="text-xs text-stone-400">{b.text}</div>;
            if (b.t === "row") return <div key={i} className="flex items-center gap-2"><span className="flex-1 truncate text-stone-600">{b.text}</span><span className={`shrink-0 font-bold ${stClr[b.status]}`}>{stTxt[b.status]}</span></div>;
            if (b.t === "total") return <div key={i} className="text-stone-500 text-xs">{b.text} {ctx.settings.currency}</div>;
            if (b.t === "bal") return <div key={i} className={`font-extrabold ${b.status === "unpaid" ? "text-rose-600" : "text-emerald-600"}`}>{b.text}</div>;
            return null;
          })}
          {data.grand && (
            <div className="border-t border-dashed border-stone-300 mt-2 pt-2">
              <div className="font-extrabold text-stone-900">الإجمالي العام</div>
              <div className="text-stone-500 text-xs">المستحق {fmt(data.grand.billed)} · المسدّد {fmt(data.grand.received)} {ctx.settings.currency}</div>
              <div className="font-extrabold text-teal-800">{data.grand.balanceText}</div>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4 no-print">
        <WaButtons phones={phones} cc={ctx.settings.countryCode} text={text} label="واتساب (نص)" />
        <Btn kind="wa" onClick={() => shareStatementImage(data, text, phones, ctx.settings.countryCode, ctx)}>إرسال PDF عبر واتساب</Btn>
        <Btn kind="ghost" onClick={() => window.print()}>حفظ PDF / طباعة</Btn>
        <Btn kind="ghost" onClick={() => ctx.copy(text)}>نسخ النص</Btn>
        <Btn kind="ghost" onClick={onClose}>إغلاق</Btn>
      </div>
    </Modal>
  );
}

function RenewForm({ contract, tenantName, placeName, currency, onClose, onSave }) {
  const old = contract;
  const [rentType, setRentType] = useState(old.rentType);
  const [amount, setAmount] = useState(String(old.amount));
  const [startDate, setStartDate] = useState(old.endDate ? addDays(old.endDate, 1) : todayISO());
  const [endDate, setEndDate] = useState("");
  const [deposit, setDeposit] = useState(String(old.deposit || ""));
  const [note, setNote] = useState("");
  return (
    <Modal title={`تجديد / تمديد العقد — ${tenantName(old.tenantId)}`} onClose={onClose}>
      <div className="bg-teal-50 text-teal-800 rounded-xl p-3 text-sm mb-3">{placeName(old)} · العقد السابق {old.contractNo || ""}{old.endDate ? ` ينتهي ${old.endDate}` : ""}. سيُنشأ عقد جديد برقم جديد ويُنهى العقد السابق.</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="نوع الإيجار"><Select value={rentType} onChange={(e) => setRentType(e.target.value)}>{RENT_TYPES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></Field>
        <Field label={`قيمة الإيجار (${currency}) *`}><TextInput value={amount} onChange={(e) => setAmount(e.target.value)} type="number" inputMode="decimal" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="بداية العقد الجديد"><TextInput value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" /></Field>
        <Field label="نهاية العقد الجديد"><TextInput value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date" /></Field>
      </div>
      <Field label={`التأمين / العربون (${currency})`}><TextInput value={deposit} onChange={(e) => setDeposit(e.target.value)} type="number" inputMode="decimal" /></Field>
      <Field label="ملاحظات"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="flex gap-2 mt-2">
        <Btn onClick={() => { if (!amount || !startDate) return; onSave({ rentType, amount, startDate, endDate, deposit, note }); }} className="flex-1">تجديد وإصدار عقد جديد</Btn>
        <Btn kind="ghost" onClick={onClose}>إلغاء</Btn>
      </div>
    </Modal>
  );
}

function ExpiryActionModal({ contract, ctx, onClose, onRenew }) {
  const c = contract; const cur = ctx.settings.currency;
  const [opt, setOpt] = useState("reprice");
  const [price, setPrice] = useState(String(c.amount));
  const [notes, setNotes] = useState("");
  const msg = opt === "vacate" ? ctx.expiryMsgVacate(c) : opt === "notes" ? ctx.expiryMsgNotes(c, notes) : ctx.expiryMsgReprice(c, price);
  return (
    <Modal title={`تنبيه انتهاء العقد — ${ctx.tenantName(c.tenantId)}`} onClose={onClose}>
      <div className="bg-amber-50 text-amber-800 rounded-xl p-3 text-sm mb-3">{ctx.placeName(c)} · ينتهي {c.endDate}</div>
      <div className="flex gap-2 mb-3">
        {[["reprice", "تعديل السعر"], ["vacate", "إخلاء"], ["notes", "ملاحظات"]].map(([k, l]) => (
          <button key={k} onClick={() => setOpt(k)} className={`flex-1 py-2 rounded-xl text-sm font-bold ${opt === k ? "bg-teal-700 text-white" : "bg-stone-100 text-stone-600"}`}>{l}</button>
        ))}
      </div>
      {opt === "reprice" && <Field label={`السعر الجديد (${cur})`}><TextInput value={price} onChange={(e) => setPrice(e.target.value)} type="number" inputMode="decimal" /></Field>}
      {opt === "notes" && <div className="mb-3"><span className="block text-sm font-semibold text-stone-600 mb-1">الملاحظات</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} /></div>}
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-sm whitespace-pre-wrap mb-3">{msg}</div>
      <div className="flex flex-wrap gap-2">
        <WaButtons phones={ctx.tenantPhones(c.tenantId)} cc={ctx.settings.countryCode} text={msg} label="إرسال عبر واتساب" />
        <Btn kind="ghost" onClick={() => ctx.copy(msg)}>نسخ النص</Btn>
        <Btn kind="gold" onClick={onRenew}>تجديد العقد</Btn>
        <Btn kind="ghost" onClick={onClose}>إغلاق</Btn>
      </div>
    </Modal>
  );
}

/* إيصال للعرض/الطباعة */
function ReceiptView({ payment, ctx, onEdit, onClose }) {
  const st = paymentStatus(payment);
  const cur = ctx.settings.currency;
  const c = ctx.contractById(payment.contractId);
  const text = ctx.receiptText(payment);
  const stamp = { paid: "border-emerald-500 text-emerald-600", surplus: "border-sky-500 text-sky-600", partial: "border-amber-500 text-amber-600", unpaid: "border-rose-500 text-rose-600" }[st.key];
  return (
    <Modal title={`إيصال قبض — ${payment.receiptNo}`} onClose={onClose} wide>
      <div id="print-area" className="rounded-2xl overflow-hidden border border-stone-200 bg-white shadow-sm">
        <div className="bg-teal-800 text-white px-5 py-5 text-center">
          {ctx.settings.logo && <div className="inline-flex bg-white rounded-xl p-2 mb-2"><img src={ctx.settings.logo} alt="شعار" className="h-12 object-contain" /></div>}
          {!ctx.settings.logoOnly && <div className="font-amiri text-2xl font-bold leading-tight">{ctx.settings.org || "إيصال قبض"}</div>}
          <div className="text-teal-200 text-xs mt-1 tracking-widest">إيصال قبض إيجار · RENT RECEIPT</div>
          <div className="h-1 w-16 bg-amber-400 rounded-full mx-auto mt-3"></div>
        </div>
        <div className="flex justify-between items-center bg-stone-50 border-b border-stone-200 px-5 py-2.5 text-sm">
          <div className="font-extrabold text-teal-800">{payment.receiptNo}</div>
          <div className="text-stone-500">{payment.paymentDate}</div>
        </div>
        <div className="p-5 space-y-2.5 text-sm">
          <Row k="المستأجر" v={c ? ctx.tenantName(c.tenantId) : "—"} />
          <Row k="الوحدة / العقار" v={c ? ctx.placeName(c) : "—"} />
          <Row k="البيان" v={payment.periodLabel} />
          <Row k="نوع الإيجار" v={c ? rentLabel(c.rentType) : "—"} />
          <div className="border-t border-dashed border-stone-300 my-1"></div>
          <Row k="المبلغ المستحق" v={`${fmt(payment.dueAmount)} ${cur}`} />
          {num(payment.discount) > 0 && <Row k={`خصم (${payment.discountReason || "—"})`} v={`- ${fmt(payment.discount)} ${cur}`} />}
          {num(payment.fine) > 0 && <Row k={`غرامة (${payment.fineReason || "—"})`} v={`+ ${fmt(payment.fine)} ${cur}`} />}
          <Row k="صافي المستحق" v={`${fmt(st.net)} ${cur}`} bold />
          <Row k="المبلغ المستلم" v={`${fmt(payment.received)} ${cur}`} bold accent />
          {num(payment.creditApplied) > 0.005 && <Row k="مخصوم من رصيد سابق" v={`${fmt(payment.creditApplied)} ${cur}`} />}
          {st.key === "partial" && <Row k="المتبقي (نقص)" v={`${fmt(Math.abs(st.diff))} ${cur}`} />}
          {st.key === "surplus" && <Row k="الزيادة" v={`${fmt(st.diff)} ${cur}`} />}
          <Row k="طريقة الدفع" v={payment.method} />
          {c && ctx.contractLedger && (() => { const L = ctx.contractLedger(c); const txt = L.owed > 0.005 ? `${fmt(L.owed)} ${cur} (عليكم)` : L.credit > 0.005 ? `${fmt(L.credit)} ${cur} (لكم)` : `0 ${cur} (مسوّى)`; return <Row k="الرصيد الحالي" v={txt} bold />; })()}
        </div>
        <div className="flex justify-center pb-5">
          <div className={`-rotate-6 border-4 rounded-xl px-5 py-1.5 font-extrabold text-lg tracking-wider ${stamp}`}>{st.label}</div>
        </div>
        {ctx.settings.ownerPhone && <div className="pb-4 text-center text-xs text-stone-400">للتواصل: {ctx.settings.ownerPhone}</div>}
      </div>
      <div className="flex flex-wrap gap-2 mt-4 no-print">
        {c && <WaButtons phones={ctx.tenantPhones(c.tenantId)} cc={ctx.settings.countryCode} text={text} label="واتساب (نص)" />}
        <Btn kind="wa" onClick={() => shareReceiptImage(payment, ctx)}>إرسال صورة عبر واتساب</Btn>
        <Btn kind="wa" onClick={() => shareReceiptFile(payment, ctx)}>إرسال PDF عبر واتساب</Btn>
        <Btn kind="ghost" onClick={() => window.print()}>حفظ PDF / طباعة</Btn>
        {onEdit && <Btn kind="gold" onClick={onEdit}>تعديل الإيصال</Btn>}
        <Btn kind="ghost" onClick={() => ctx.copy(text)}>نسخ النص</Btn>
        <Btn kind="ghost" onClick={onClose}>إغلاق</Btn>
      </div>
    </Modal>
  );
}
function Row({ k, v, bold, accent }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`shrink-0 ${bold ? "font-bold text-stone-700" : "text-stone-500"}`}>{k}</span>
      <span className="flex-1 border-b border-dotted border-stone-300"></span>
      <span className={`shrink-0 ${accent ? "text-teal-800 font-extrabold" : bold ? "font-extrabold text-stone-900" : "font-semibold text-stone-700"}`}>{v}</span>
    </div>
  );
}

/* كشف حساب عقار أو وحدة (يشمل المستأجرين السابقين والحاليين) */
function PlaceStatementView({ title, stmt, currency, text, logo, onCopy, onClose }) {
  return (
    <Modal title={title} onClose={onClose} wide>
      <div id="print-area" className="space-y-3">
        <div className="bg-teal-800 text-white rounded-2xl px-4 py-4 text-center">
          {logo && <div className="inline-flex bg-white rounded-xl p-2 mb-2"><img src={logo} alt="شعار" className="h-10 object-contain" /></div>}
          <div className="font-amiri text-xl font-bold">{title}</div>
          <div className="text-teal-200 text-xs mt-0.5 tracking-widest">حتى {todayISO()}</div>
          <div className="h-1 w-12 bg-amber-400 rounded-full mx-auto mt-2"></div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="bg-stone-50 rounded-xl p-2"><div className="text-xs text-stone-500">مستحق</div><div className="font-bold">{fmt(stmt.totalCharged)}</div></div>
          <div className="bg-stone-50 rounded-xl p-2"><div className="text-xs text-stone-500">محصّل</div><div className="font-bold text-emerald-600">{fmt(stmt.totalReceived)}</div></div>
          <div className="bg-stone-50 rounded-xl p-2"><div className="text-xs text-stone-500">متبقٍ</div><div className="font-bold text-rose-600">{fmt(stmt.balance)}</div></div>
        </div>
        {stmt.contracts.length === 0 ? <p className="text-sm text-stone-400 text-center py-4">لا يوجد سجل لهذا العقار بعد.</p> :
          stmt.contracts.map((row, i) => (
            <div key={i} className="border border-stone-200 rounded-2xl p-3">
              <div className="flex justify-between items-center mb-1">
                <div className="font-bold text-stone-800">{row.tenantName}</div>
                <Pill className={row.status === "active" ? "bg-teal-100 text-teal-700" : "bg-stone-200 text-stone-600"}>{row.status === "active" ? "نشط" : "منتهٍ"}</Pill>
              </div>
              <div className="text-xs text-stone-500 mb-2">{row.periodText} · {fmt(row.amount)} {currency}/{row.rentTypeLabel}</div>
              {row.payments.length > 0 && (
                <div className="space-y-1">
                  {row.payments.map((p) => (
                    <div key={p.id} className="flex justify-between text-xs bg-stone-50 rounded-lg px-2 py-1">
                      <span>{p.paymentDate} · {p.receiptNo}</span><span className="font-bold">{fmt(p.received)} {currency}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between text-xs font-bold mt-2 pt-2 border-t border-stone-100 text-stone-600">
                <span>مستحق {fmt(row.charged)} · محصّل {fmt(row.received)}</span><span>متبقٍ {fmt(row.balance)}</span>
              </div>
            </div>
          ))}
      </div>
      <div className="flex gap-2 mt-4 no-print">
        <Btn kind="gold" onClick={() => onCopy(text)}>نسخ الكشف</Btn>
        <Btn kind="ghost" onClick={() => window.print()}>حفظ PDF / طباعة</Btn>
        <Btn kind="ghost" onClick={onClose}>إغلاق</Btn>
      </div>
    </Modal>
  );
}

/* ============================ التطبيق الرئيسي ============================ */
export default function App() {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("home");
  const [modal, setModal] = useState(null); // {type, payload}
  const [confirmBox, setConfirmBox] = useState(null);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const firstSave = useRef(false);
  const importRef = useRef(null);

  useEffect(() => {
    (async () => {
      const d = await loadData();
      setData(d || defaultData());
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (!firstSave.current) { firstSave.current = true; return; }
    saveData(data);
  }, [data, loaded]);

  useEffect(() => {
    if (!loaded || !data || !data.settings?.notify) return;
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const t = todayISO(); let count = 0, total = 0;
      data.contracts.filter((c) => c.status === "active").forEach((c) => {
        const ps = data.payments.filter((p) => p.contractId === c.id);
        let billed = 0, received = 0;
        ps.forEach((p) => { billed += num(p.dueAmount) - num(p.discount) + num(p.fine); received += num(p.received); });
        for (let i = ps.length; i < ps.length + 600; i++) { const per = periodSchedule(c, i); if (per.due <= t) { billed += num(per.amount); } else break; }
        const owed = billed - received;
        if (owed > 0.005) { count++; total += owed; }
      });
      if (count > 0) new Notification("متأخرات السداد", { body: `${count} مستأجر متأخر بإجمالي ${fmt(total)} ${data.settings.currency || ""}` });
    } catch (e) { /* التنبيهات غير متاحة في هذه البيئة */ }
  }, [loaded]);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };
  const update = (fn) => setData((d) => { const nd = JSON.parse(JSON.stringify(d)); fn(nd); return nd; });

  function copy(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
      showToast("تم نسخ النص");
    } catch (e) { showToast("تعذّر النسخ"); }
  }

  if (!loaded) return <div className="min-h-screen flex items-center justify-center text-stone-400">جارٍ التحميل…</div>;

  /* ----- مساعدات السياق ----- */
  const { properties, tenants, contracts, payments, expenses, settings } = data;
  const tenantById = (id) => tenants.find((t) => t.id === id);
  const tenantName = (id) => tenantById(id)?.name || "—";
  const tenantPhone = (id) => { const ph = tenantPhones(id); return ph[0] || ""; };
  const tenantPhones = (id) => { const t = tenantById(id); if (!t) return []; if (Array.isArray(t.phones) && t.phones.length) return t.phones.filter(Boolean); return t.phone ? [t.phone] : []; };
  const propertyById = (id) => properties.find((p) => p.id === id);
  const contractById = (id) => contracts.find((c) => c.id === id);
  const placeName = (c) => {
    const p = propertyById(c.propertyId); if (!p) return "—";
    const u = c.unitId ? (p.units || []).find((x) => x.id === c.unitId) : null;
    return u ? `${u.name} — ${p.name}` : p.name;
  };
  const paymentsOf = (cId) => payments.filter((p) => p.contractId === cId).sort((a, b) => a.paymentDate < b.paymentDate ? -1 : 1);
  // عدد الأشهر التي يغطّيها مبلغ بالكامل (حسب جدول الإيجار) + المتبقي كرصيد
  const coverInfo = (c, totalReceived) => {
    let rem = totalReceived, k = 0;
    for (let i = 0; i < 3000; i++) {
      const amt = num(periodSchedule(c, i).amount);
      if (amt <= 0.005) { k++; continue; }
      if (rem + 0.005 >= amt) { rem -= amt; k++; } else break;
    }
    return { count: k, leftover: round2(rem) };
  };
  const receivedOf = (c) => paymentsOf(c.id).reduce((s, p) => s + num(p.received), 0);
  // ===== سلسلة العقود (العقد السابق ← الحالي ← التالي) =====
  const fullChain = (c) => {
    let root = c; const seen = new Set();
    while (root && root.prevContractId && !seen.has(root.id)) { seen.add(root.id); const p = contractById(root.prevContractId); if (!p) break; root = p; }
    const chain = []; let cur = root; const seen2 = new Set();
    while (cur && !seen2.has(cur.id)) { seen2.add(cur.id); chain.push(cur); cur = contracts.find((x) => x.prevContractId === cur.id) || null; }
    return chain;
  };
  // كل فترات السلسلة مرتّبة زمنياً (الأقدم أولاً) مع ذكر العقد المصدر
  const chainPeriods = (c) => {
    const chain = fullChain(c); const t = todayISO(); const out = [];
    chain.forEach((ct) => {
      let future = 0;
      for (let i = 0; i < 3000; i++) {
        const per = periodSchedule(ct, i);
        if (ct.endDate && per.due > ct.endDate) break;
        out.push({ ...per, contractId: ct.id, contractNo: ct.contractNo });
        if (!ct.endDate) { if (per.due > t) { future++; if (future >= 36) break; } }
      }
    });
    return out;
  };
  const chainPaymentsRaw = (c) => {
    const chain = fullChain(c); let pays = [];
    chain.forEach((ct) => { paymentsOf(ct.id).forEach((p) => pays.push(p)); });
    return pays.sort((a, b) => ((a.paymentDate || "") < (b.paymentDate || "") ? -1 : (a.paymentDate || "") > (b.paymentDate || "") ? 1 : 0));
  };
  const chainCredit = (c) => Math.max(0, num(fullChain(c)[0]?.openingBalance));
  const chainOwedInit = (c) => Math.max(0, -num(fullChain(c)[0]?.openingBalance));
  const chainReceived = (c) => round2(chainPaymentsRaw(c).reduce((s, p) => s + num(p.received), 0));
  const chainEff = (c) => round2(chainReceived(c) + chainCredit(c));
  const coverChain = (periods, total) => {
    let rem = total, k = 0;
    for (let i = 0; i < periods.length; i++) { const amt = num(periods[i].amount); if (amt <= 0.005) { k++; continue; } if (rem + 0.005 >= amt) { rem = round2(rem - amt); k++; } else break; }
    return { count: k, leftover: round2(rem) };
  };
  const nextPeriodIndex = (c) => coverChain(chainPeriods(c), chainEff(c)).count;
  const nextDue = (c) => { const ps = chainPeriods(c); return (ps[nextPeriodIndex(c)] || ps[ps.length - 1] || { due: todayISO() }).due; };
  // الرصيد الجاري للسلسلة: balance<0 ⇒ عليكم ، balance>0 ⇒ لكم
  const contractLedger = (c) => {
    const t = todayISO();
    const periods = chainPeriods(c);
    const eff = chainEff(c);
    const received = chainReceived(c);
    let chargesDue = 0, dueCount = 0;
    periods.forEach((per) => { if (per.due <= t) { chargesDue += num(per.amount); dueCount++; } });
    chargesDue = round2(chargesDue);
    let fine = 0, discount = 0;
    chainPaymentsRaw(c).forEach((p) => { fine += num(p.fine); discount += num(p.discount); });
    const netAdj = round2(fine - discount);
    const cov = coverChain(periods, eff);
    const raw = (cov.count >= dueCount) ? cov.leftover : -round2(chargesDue - eff);
    const balance = round2(raw - netAdj - chainOwedInit(c));
    const billed = round2(chargesDue + netAdj);
    const unpaid = []; let lo = cov.leftover;
    for (let i = cov.count; i < dueCount; i++) { let amt = num(periods[i].amount); if (lo > 0.005) { amt = round2(amt - lo); lo = 0; } if (amt > 0.005) unpaid.push({ ...periods[i], amount: amt }); }
    return { balance, owed: Math.max(0, -balance), credit: Math.max(0, balance), unpaid, billed, received, carry: round2(num(fullChain(c)[0]?.openingBalance) || 0), coveredCount: cov.count, leftover: cov.leftover, dueCount };
  };
  // توزيع كل مدفوعات السلسلة على فتراتها (الأقدم فالأقدم) مع حالة كل فترة ورقم الإيصال والعقد
  const periodAllocation = (c) => {
    const periods = chainPeriods(c);
    const credit = chainCredit(c);
    const pays = [...(credit > 0.005 ? [{ receiptNo: "رصيد سابق", received: credit }] : []), ...chainPaymentsRaw(c)];
    const rows = [];
    let payIdx = 0, payRemain = pays.length ? num(pays[0].received) : 0;
    for (let k = 0; k < periods.length; k++) {
      const per = periods[k];
      let need = num(per.amount), paidAmt = 0; const receipts = [];
      while (need > 0.005 && payIdx < pays.length) {
        if (payRemain <= 0.005) { payIdx++; payRemain = payIdx < pays.length ? num(pays[payIdx].received) : 0; continue; }
        const take = Math.min(need, payRemain);
        need = round2(need - take); payRemain = round2(payRemain - take); paidAmt = round2(paidAmt + take);
        const rn = pays[payIdx].receiptNo || "—"; if (!receipts.includes(rn)) receipts.push(rn);
      }
      const status = need <= 0.005 ? "paid" : (paidAmt > 0 ? "partial" : "unpaid");
      rows.push({ index: k, label: per.label, amount: num(per.amount), due: per.due, contractNo: per.contractNo, contractId: per.contractId, paidAmt, status, receipts });
    }
    return rows;
  };

  function contractText(c) {
    const cur = settings.currency;
    const terms = (settings.contractTerms && settings.contractTerms.trim()) ? settings.contractTerms.split("\n").map((x) => x.trim()).filter(Boolean) : DEFAULT_TERMS;
    return [
      `عقد إيجار`,
      settings.org ? settings.org : null,
      `المؤجر: ${settings.org || "—"}${settings.ownerPhone ? " — " + settings.ownerPhone : ""}`,
      `المستأجر: ${tenantName(c.tenantId)}${tenantPhone(c.tenantId) ? " — " + tenantPhone(c.tenantId) : ""}`,
      `العين المؤجرة: ${placeName(c)}`,
      c.contractNo ? `رقم العقد: ${c.contractNo}` : null,
      `قيمة الإيجار: ${fmt(c.amount)} ${cur} / ${rentLabel(c.rentType)}`,
      `تاريخ بداية العقد: ${c.startDate}`,
      c.endDate ? `تاريخ نهاية العقد: ${c.endDate}` : null,
      num(c.deposit) > 0 ? `مبلغ التأمين/العربون: ${fmt(c.deposit)} ${cur}` : null,
      c.note ? `ملاحظات: ${c.note}` : null,
      ``,
      `الشروط العامة:`,
      ...terms.map((t, i) => `${i + 1}. ${t}`),
      ``,
      `حُرّر هذا العقد بتاريخ ${todayISO()}، ووقّع الطرفان على قبول ما ورد فيه.`,
    ].filter((x) => x != null).join("\n");
  }
  function renewalText(c, old, carriedArg) {
    const cur = settings.currency;
    const changes = [];
    if (old) {
      if (num(old.amount) !== num(c.amount)) changes.push(`قيمة الإيجار عُدّلت من ${fmt(old.amount)} إلى ${fmt(c.amount)} ${cur}`);
      if (old.rentType !== c.rentType) changes.push(`نوع الإيجار: ${rentLabel(c.rentType)}`);
    }
    const lines = [
      `الأخ / ${tenantName(c.tenantId)}`,
      `نفيدكم بتجديد/تمديد عقد إيجار ${placeName(c)}.`,
      ``,
      `تفاصيل العقد الجديد:`,
      `• رقم العقد: ${c.contractNo || "—"}`,
      `• قيمة الإيجار: ${fmt(c.amount)} ${cur} / ${rentLabel(c.rentType)}`,
      `• من ${c.startDate}${c.endDate ? ` إلى ${c.endDate}` : ""}`,
    ];
    if (changes.length) { lines.push(``, `التعديلات عن العقد السابق:`); changes.forEach((ch) => lines.push(`• ${ch}`)); }
    else lines.push(`(بنفس شروط العقد السابق)`);
    const carried = round2(carriedArg != null ? carriedArg : (num(c.openingBalance) || 0));
    if (Math.abs(carried) > 0.005) lines.push(``, `رصيد سابق غير مُسوّى: ${fmt(Math.abs(carried))} ${cur} ${carried > 0 ? "(لكم)" : "(عليكم — يُسوّى ضمن الفترات الأقدم)"}`);
    lines.push(``, `شاكرين لكم حسن تعاونكم.`);
    if (settings.org) lines.push(`\n${settings.org}`);
    return lines.join("\n");
  }

  function receiptText(p) {
    const c = contractById(p.contractId); const st = paymentStatus(p); const cur = settings.currency;
    const lines = [
      `*${settings.org || "إيصال قبض إيجار"}*`,
      `إيصال قبض إيجار`,
      `رقم الإيصال: ${p.receiptNo}`,
      `التاريخ: ${p.paymentDate}`,
      `المستأجر: ${c ? tenantName(c.tenantId) : "—"}`,
      `العقار: ${c ? placeName(c) : "—"}`,
      `البيان: ${p.periodLabel}`,
      `نوع الإيجار: ${c ? rentLabel(c.rentType) : "—"}`,
      `المبلغ المستحق: ${fmt(p.dueAmount)} ${cur}`,
    ];
    if (num(p.discount) > 0) lines.push(`خصم: ${fmt(p.discount)} ${cur}${p.discountReason ? " (" + p.discountReason + ")" : ""}`);
    if (num(p.fine) > 0) lines.push(`غرامة: ${fmt(p.fine)} ${cur}${p.fineReason ? " (" + p.fineReason + ")" : ""}`);
    lines.push(`صافي المستحق: ${fmt(st.net)} ${cur}`);
    lines.push(`المبلغ المستلم: ${fmt(p.received)} ${cur}`);
    if (num(p.creditApplied) > 0.005) lines.push(`مخصوم من رصيد سابق: ${fmt(p.creditApplied)} ${cur}`);
    if (st.key === "partial") lines.push(`المتبقي: ${fmt(Math.abs(st.diff))} ${cur}`);
    if (st.key === "surplus") lines.push(`زيادة: ${fmt(st.diff)} ${cur}`);
    lines.push(`الحالة: ${st.label}`);
    lines.push(`طريقة الدفع: ${p.method}`);
    if (c) { const L = contractLedger(c); if (L.owed > 0.005) lines.push(`الرصيد الحالي: ${fmt(L.owed)} ${cur} (عليكم)`); else if (L.credit > 0.005) lines.push(`الرصيد الحالي: ${fmt(L.credit)} ${cur} (لكم)`); else lines.push(`الرصيد الحالي: 0 ${cur} (الحساب مسوّى)`); }
    if (settings.ownerPhone) lines.push(`للتواصل: ${settings.ownerPhone}`);
    lines.push(`شكراً لكم.`);
    return lines.join("\n");
  }
  function reminderText(c) {
    const cur = settings.currency; const t = todayISO();
    const L = contractLedger(c);
    const name = tenantName(c.tenantId);
    const place = placeName(c);
    const extra = round2(L.owed - L.unpaid.reduce((s, p) => s + num(p.amount), 0)); // نقص مرحّل من دفعات سابقة
    if (L.owed <= 0.005) {
      const ps = periodSchedule(c, nextPeriodIndex(c));
      const lines = [`الأخ / ${name}`, `بخصوص إيجار ${place}`];
      if (L.credit > 0.005) lines.push(`رصيدكم الحالي: ${fmt(L.credit)} ${cur} (لكم).`);
      lines.push(`تذكير ودّي بقرب موعد السداد.`, `${ps.label}: ${fmt(ps.amount)} ${cur} — تاريخ الاستحقاق ${ps.due}.`, `نشكر لكم التزامكم.`);
      return lines.join("\n");
    }
    const lateCount = L.unpaid.filter((p) => p.end < t).length;
    const dueCount = paymentsOf(c.id).length + L.unpaid.length;
    if (lateCount >= 3) {
      const lines = [`الأخ / ${name}`, `بخصوص إيجار (${place})`, ``, `فيما يلي تفصيل المبالغ المستحقة:`];
      L.unpaid.forEach((p) => lines.push(`• ${p.label}: ${fmt(p.amount)} ${cur}`));
      if (extra > 0.005) lines.push(`• نقص من دفعات سابقة: ${fmt(extra)} ${cur}`);
      lines.push(``, `الإجمالي المستحق: ${fmt(L.billed)} ${cur} (${dueCount} فترة).`, `إجمالي المسدّد: ${fmt(L.received)} ${cur}`, `الرصيد المتبقي عليكم: ${fmt(L.owed)} ${cur}`, ``);
      lines.push(`نلفت كريم عنايتكم إلى أن المتأخرات تجاوزت ${monthWord(dueCount)}، ونأمل المبادرة بالسداد العاجل تفادياً للإحراج ومطالبتكم بإخلاء (${place}) واتخاذ الإجراءات النظامية والقانونية. نأمل حسن تعاونكم وحسن تفهّمكم والمبادرة بالسداد سريعاً.`);
      return lines.join("\n");
    }
    const lines = [`الأخ / ${name}`, `بخصوص إيجار ${place}`, `إليكم ملخّص الحساب حتى ${t}:`];
    L.unpaid.forEach((p) => lines.push(`• ${p.label}: ${fmt(p.amount)} ${cur}`));
    if (extra > 0.005) lines.push(`• نقص من دفعات سابقة: ${fmt(extra)} ${cur}`);
    lines.push(``, `إجمالي المستحق: ${fmt(L.billed)} ${cur}`, `إجمالي المسدّد: ${fmt(L.received)} ${cur}`, `الرصيد المتبقي عليكم: ${fmt(L.owed)} ${cur}`, ``, `نرجو منكم سداد المبلغ المستحق في أقرب وقت آملين حسن تعاونكم وحسن تفهّمكم والمبادرة بالسداد سريعاً.`);
    return lines.join("\n");
  }
  function expiryText(c) {
    return [
      `عزيزي/عزيزتي ${tenantName(c.tenantId)}،`,
      `نفيدكم بقرب انتهاء عقد إيجار ${placeName(c)} بتاريخ ${c.endDate}.`,
      `يرجى التواصل لتجديد العقد أو ترتيب الإخلاء. وشكراً.`,
      settings.org ? `\n${settings.org}` : "",
    ].filter(Boolean).join("\n");
  }
  function expiryMsgVacate(c) {
    return [
      `الأخ/ ${tenantName(c.tenantId)}`,
      `نفيدكم بقرب انتهاء عقد إيجار (${placeName(c)}) بتاريخ ${c.endDate}.`,
      `نرجو إخلاء (${placeName(c)}) قبل انتهاء مدة العقد، وفي حال تجاوز مدة انتهاء العقد دون إخلاء سيتم المطالبة بالإخلاء فوراً وستُحاسبون بغرامة خاصة عن كل يوم تأخير وسيتم اتخاذ كافة الإجراءات القانونية والتنظيمية ضدكم.`,
      `نرجو منكم حسن التعاون وعدم الإحراج وشكراً.`,
      settings.org ? `\n${settings.org}` : "",
    ].filter(Boolean).join("\n");
  }
  function expiryMsgReprice(c, newPrice) {
    const cur = settings.currency;
    return [
      `الأخ/ ${tenantName(c.tenantId)}`,
      `نفيدكم بقرب انتهاء عقد إيجار (${placeName(c)}) بتاريخ ${c.endDate}.`,
      `لتجديد العقد سيتم تعديل السعر إلى (${fmt(newPrice)} ${cur} / ${rentLabel(c.rentType)}).`,
      `في حال الموافقة على قبول التعديل نرجو إرسال رسالة تفيد بذلك لإصدار عقد جديد.`,
      `وفي حال عدم القبول نرجو منكم إخلاء (${placeName(c)}) قبل تاريخ انتهاء العقد، وفي حال تجاوز مدة انتهاء العقد دون إخلاء أو رد سيتم المطالبة بالإخلاء فوراً وستُحاسبون بغرامة خاصة عن كل يوم تأخير وسيتم اتخاذ كافة الإجراءات القانونية والتنظيمية ضدكم.`,
      ``,
      `نرجو منكم حسن التعاون وعدم الإحراج وشكراً.`,
      settings.org ? `\n${settings.org}` : "",
    ].filter(Boolean).join("\n");
  }
  function expiryMsgNotes(c, notes) {
    return [
      `الأخ/ ${tenantName(c.tenantId)}`,
      `نفيدكم بقرب انتهاء عقد إيجار (${placeName(c)}) بتاريخ ${c.endDate}.`,
      (notes || "").trim(),
      `نرجو منكم حسن التعاون وشكراً.`,
      settings.org ? `\n${settings.org}` : "",
    ].filter(Boolean).join("\n");
  }
  function statementFor(tenantId) {
    const cs = contracts.filter((c) => c.tenantId === tenantId);
    const tx = payments.filter((p) => cs.some((c) => c.id === p.contractId)).sort((a, b) => a.paymentDate < b.paymentDate ? -1 : 1);
    let charged = 0, disc = 0, fine = 0, received = 0;
    tx.forEach((p) => { charged += num(p.dueAmount) - num(p.discount) + num(p.fine); disc += num(p.discount); fine += num(p.fine); received += num(p.received); });
    return { tx, charged, disc, fine, received, balance: charged - received, contracts: cs };
  }
  function statementText(tenantId) {
    const cur = settings.currency;
    const cs = contracts.filter((c) => c.tenantId === tenantId);
    // تمثيل كل سلسلة بأحدث عقد فيها (لتفادي التكرار)
    const reps = []; const seenRoot = new Set();
    cs.forEach((c) => { const chain = fullChain(c); const root = chain[0]; if (!seenRoot.has(root.id)) { seenRoot.add(root.id); reps.push(chain[chain.length - 1]); } });
    reps.sort((a, b) => ((a.startDate || "") < (b.startDate || "") ? -1 : 1));
    const lines = [`*كشف حساب*`, `المستأجر: ${tenantName(tenantId)}`, `حتى تاريخ: ${todayISO()}`];
    const stW = { paid: "مسدّد", partial: "جزئي", unpaid: "غير مسدّد" };
    let gBilled = 0, gReceived = 0, gOwed = 0, gCredit = 0;
    reps.forEach((c) => {
      const chain = fullChain(c); const L = contractLedger(c); const alloc = periodAllocation(c);
      gBilled += L.billed; gReceived += L.received; gOwed += L.owed; gCredit += L.credit;
      const nums = chain.map((x) => x.contractNo || "—").join(" ← ");
      const root = chain[0]; const last = chain[chain.length - 1];
      lines.push(``, `▣ ${placeName(c)} — عقود ${nums}`);
      lines.push(`من ${root.startDate || "—"}${last.endDate ? " إلى " + last.endDate : ""}`);
      lines.push(`حالة السداد (الأقدم أولاً):`);
      alloc.forEach((r) => lines.push(`• ${r.label}${r.contractNo && r.contractNo !== last.contractNo ? ` [عقد ${r.contractNo}]` : ""}: ${stW[r.status]}${r.status === "partial" ? ` (سُدّد ${fmt(r.paidAmt)})` : ""}${r.receipts.length ? ` — ${r.receipts.join("، ")}` : ""}`));
      lines.push(`إجمالي المستحق حتى اليوم: ${fmt(L.billed)} ${cur}`);
      lines.push(`إجمالي المسدّد: ${fmt(L.received)} ${cur}`);
      lines.push(`الرصيد: ${L.owed > 0.005 ? fmt(L.owed) + " " + cur + " (عليكم)" : L.credit > 0.005 ? fmt(L.credit) + " " + cur + " (لكم)" : "0 " + cur + " (مسوّى)"}`);
    });
    if (reps.length === 0) lines.push(``, `لا توجد عقود.`);
    if (reps.length > 1) {
      const net = round2(gCredit - gOwed);
      lines.push(``, `════════════`, `*الإجمالي العام:*`);
      lines.push(`إجمالي المستحق: ${fmt(gBilled)} ${cur}`);
      lines.push(`إجمالي المسدّد: ${fmt(gReceived)} ${cur}`);
      lines.push(`الرصيد الكلي: ${net < -0.005 ? fmt(-net) + " " + cur + " (عليكم)" : net > 0.005 ? fmt(net) + " " + cur + " (لكم)" : "0 " + cur + " (مسوّى)"}`);
    }
    if (settings.org) lines.push(``, settings.org);
    return lines.join("\n");
  }
  function statementStruct(tenantId) {
    const cur = settings.currency;
    const cs = contracts.filter((c) => c.tenantId === tenantId);
    const reps = []; const seen = new Set();
    cs.forEach((c) => { const chain = fullChain(c); const root = chain[0]; if (!seen.has(root.id)) { seen.add(root.id); reps.push(chain[chain.length - 1]); } });
    reps.sort((a, b) => ((a.startDate || "") < (b.startDate || "") ? -1 : 1));
    const blocks = []; let gB = 0, gR = 0, gO = 0, gC = 0;
    reps.forEach((c) => {
      const chain = fullChain(c), L = contractLedger(c), alloc = periodAllocation(c);
      const root = chain[0], last = chain[chain.length - 1];
      gB += L.billed; gR += L.received; gO += L.owed; gC += L.credit;
      blocks.push({ t: "h2", text: `${placeName(c)} — ${chain.map((x) => x.contractNo || "—").join(" ← ")}` });
      blocks.push({ t: "sub", text: `من ${root.startDate || "—"}${last.endDate ? " إلى " + last.endDate : ""}` });
      alloc.forEach((r) => blocks.push({ t: "row", status: r.status, text: `${r.label}${r.contractNo && r.contractNo !== last.contractNo ? ` [${r.contractNo}]` : ""}` }));
      blocks.push({ t: "total", text: `المستحق ${fmt(L.billed)} · المسدّد ${fmt(L.received)}` });
      blocks.push({ t: "bal", status: L.owed > 0.005 ? "unpaid" : "paid", text: L.owed > 0.005 ? `الرصيد: ${fmt(L.owed)} ${cur} (عليكم)` : L.credit > 0.005 ? `الرصيد: ${fmt(L.credit)} ${cur} (لكم)` : `الرصيد: مسوّى` });
      blocks.push({ t: "space" });
    });
    let grand = null;
    if (reps.length > 1) { const net = round2(gC - gO); grand = { billed: gB, received: gR, balanceText: net < -0.005 ? `الرصيد الكلي: ${fmt(-net)} ${cur} (عليكم)` : net > 0.005 ? `الرصيد الكلي: ${fmt(net)} ${cur} (لكم)` : `الرصيد الكلي: مسوّى`, color: net < -0.005 ? "#e11d48" : net > 0.005 ? "#0284c7" : "#059669" }; }
    return { tenant: tenantName(tenantId), date: todayISO(), blocks, grand };
  }

  function statementForPlace(propertyId, unitId) {
    const cs = contracts
      .filter((c) => c.propertyId === propertyId && (unitId == null ? true : c.unitId === unitId))
      .sort((a, b) => ((a.startDate || "") < (b.startDate || "") ? 1 : -1)); // الأحدث أولاً
    let totalCharged = 0, totalReceived = 0;
    const rows = cs.map((c) => {
      const ps = payments.filter((p) => p.contractId === c.id).sort((a, b) => a.paymentDate < b.paymentDate ? -1 : 1);
      let charged = 0, received = 0;
      ps.forEach((p) => { charged += num(p.dueAmount) - num(p.discount) + num(p.fine); received += num(p.received); });
      totalCharged += charged; totalReceived += received;
      return {
        tenantName: tenantName(c.tenantId), status: c.status, amount: c.amount, rentTypeLabel: rentLabel(c.rentType),
        periodText: `من ${c.startDate || "—"} ${c.status === "active" ? "— الآن" : c.endDate ? "إلى " + c.endDate : "(منتهٍ)"}`,
        payments: ps, charged, received, balance: charged - received,
      };
    });
    return { contracts: rows, totalCharged, totalReceived, balance: totalCharged - totalReceived };
  }
  function placeStatementText(propertyId, unitId, title) {
    const s = statementForPlace(propertyId, unitId); const cur = settings.currency;
    const lines = [`*${title}*`, `حتى تاريخ: ${todayISO()}`, ``];
    s.contracts.forEach((r) => {
      lines.push(`■ ${r.tenantName} (${r.status === "active" ? "نشط" : "منتهٍ"}) — ${fmt(r.amount)} ${cur}/${r.rentTypeLabel}`);
      r.payments.forEach((p) => lines.push(`   ${p.paymentDate} | ${p.receiptNo} | ${fmt(p.received)} ${cur}`));
      lines.push(`   مستحق ${fmt(r.charged)} | محصّل ${fmt(r.received)} | متبقٍ ${fmt(r.balance)} ${cur}`, ``);
    });
    lines.push(`الإجمالي — مستحق ${fmt(s.totalCharged)} | محصّل ${fmt(s.totalReceived)} | متبقٍ ${fmt(s.balance)} ${cur}`);
    if (settings.org) lines.push(``, settings.org);
    return lines.join("\n");
  }

  const ctx = { settings, tenantName, tenantPhone, placeName, contractById, receiptText, reminderText, statementText, copy };

  /* ----- معالجات البيانات ----- */
  const saveProperty = (p) => update((d) => { if (p.id) { const i = d.properties.findIndex((x) => x.id === p.id); d.properties[i] = { ...d.properties[i], ...p }; } else d.properties.push({ ...p, id: uid(), units: [] }); });
  const saveUnit = (propId, u) => update((d) => { const pr = d.properties.find((x) => x.id === propId); pr.units = pr.units || []; const i = pr.units.findIndex((x) => x.id === u.id); if (i >= 0) pr.units[i] = u; else pr.units.push(u); });
  const delUnit = (propId, uId) => update((d) => { const pr = d.properties.find((x) => x.id === propId); pr.units = (pr.units || []).filter((x) => x.id !== uId); });
  const delProperty = (id) => update((d) => { d.properties = d.properties.filter((x) => x.id !== id); });
  const saveTenant = (t) => update((d) => { if (t.id) { const i = d.tenants.findIndex((x) => x.id === t.id); d.tenants[i] = { ...d.tenants[i], ...t }; } else d.tenants.push({ ...t, id: uid() }); });
  const delTenant = (id) => update((d) => { d.tenants = d.tenants.filter((x) => x.id !== id); });
  const saveContract = (c) => update((d) => {
    const i = d.contracts.findIndex((x) => x.id === c.id);
    if (i >= 0) { d.contracts[i] = c; return; }
    if (!c.contractNo) { c.contractNo = "C-" + String(d.counters.contract || 1).padStart(4, "0"); d.counters.contract = (d.counters.contract || 1) + 1; }
    d.contracts.push(c);
  });
  const handleSaveContract = (c) => {
    const conflict = occupancyConflict(contracts, c, c.id);
    if (conflict) {
      showToast(`يتعارض زمنياً مع عقد ${conflict.contractNo || ""} لـ«${tenantName(conflict.tenantId)}» على نفس الوحدة — غيّر التواريخ أو الوحدة.`);
      return;
    }
    saveContract(c); setModal(null);
  };
  const handleRenew = (old, nd) => {
    const carried = round2(contractLedger(old).balance);
    const nc = { id: uid(), propertyId: old.propertyId, unitId: old.unitId, tenantId: old.tenantId, rentType: nd.rentType, amount: num(nd.amount), startDate: nd.startDate, endDate: nd.endDate || null, deposit: num(nd.deposit), note: nd.note || "", status: "active", prevContractId: old.id };
    const doRenew = () => {
      update((d) => {
        const o = d.contracts.find((x) => x.id === old.id); if (o) o.status = "ended";
        nc.contractNo = "C-" + String(d.counters.contract || 1).padStart(4, "0"); d.counters.contract = (d.counters.contract || 1) + 1;
        d.contracts.push(nc);
      });
      setModal({ type: "renewal", payload: { c: nc, old, carried } });
    };
    const conflict = occupancyConflict(contracts.filter((x) => x.id !== old.id), nc, nc.id);
    if (conflict) askConfirm(`تنبيه: العقد الجديد يتداخل زمنياً مع عقد ${conflict.contractNo || ""} لـ«${tenantName(conflict.tenantId)}». الأفضل ضبط تاريخ البداية بعد نهاية العقد السابق. هل تريد المتابعة؟`, doRenew);
    else doRenew();
  };
  const restoreContract = (id) => {
    const c = contracts.find((x) => x.id === id);
    if (!c) return;
    if (c.endDate && c.endDate < todayISO()) { showToast("انتهت مدة العقد — استخدم التجديد بدل الاستعادة"); return; }
    const conflict = occupancyConflict(contracts, { ...c, status: "active" }, id);
    if (conflict) { showToast(`يتعارض مع عقد نشط ${conflict.contractNo || ""} لـ«${tenantName(conflict.tenantId)}»`); return; }
    update((d) => { const x = d.contracts.find((y) => y.id === id); if (x) x.status = "active"; });
    showToast("تمت استعادة العقد");
  };
  const deleteContract = (id) => {
    update((d) => {
      d.contracts = d.contracts.filter((x) => x.id !== id);
      d.payments = d.payments.filter((p) => p.contractId !== id);
      d.contracts.forEach((x) => { if (x.prevContractId === id) x.prevContractId = null; });
    });
    showToast("تم حذف العقد ومدفوعاته");
  };
  const endContract = (id) => update((d) => { const c = d.contracts.find((x) => x.id === id); if (c) c.status = "ended"; });
  const handleTransfer = (oldContract, payload) => {
    const doIt = () => update((d) => {
      const old = d.contracts.find((x) => x.id === oldContract.id);
      if (old) { old.status = "ended"; old.endDate = payload.transferDate; }
      const nc = { id: uid(), propertyId: payload.propertyId, unitId: payload.unitId, tenantId: oldContract.tenantId, rentType: payload.rentType, amount: payload.amount, startDate: payload.transferDate, endDate: null, deposit: payload.deposit, note: payload.note, status: "active" };
      nc.contractNo = "C-" + String(d.counters.contract || 1).padStart(4, "0"); d.counters.contract = (d.counters.contract || 1) + 1;
      d.contracts.push(nc);
    });
    const conflict = occupancyConflict(contracts, { propertyId: payload.propertyId, unitId: payload.unitId || null, tenantId: oldContract.tenantId, startDate: payload.transferDate, endDate: null }, oldContract.id);
    if (conflict) {
      askConfirm(`${placeName({ propertyId: payload.propertyId, unitId: payload.unitId })} مشغول بعقد نشط للمستأجر «${tenantName(conflict.tenantId)}». هل تريد المتابعة بالنقل؟`, () => { doIt(); setModal(null); });
    } else { doIt(); setModal(null); }
  };
  const delContract = (id) => update((d) => { d.contracts = d.contracts.filter((x) => x.id !== id); d.payments = d.payments.filter((x) => x.contractId !== id); });
  const savePayment = (p) => {
    if (p.receiptNo) { // تعديل دفعة قائمة
      update((d) => { const i = d.payments.findIndex((x) => x.id === p.id); if (i >= 0) d.payments[i] = p; });
      setTimeout(() => setModal({ type: "receipt", payload: p }), 0);
      return;
    }
    const no = settings.receiptPrefix + String(data.counters.receipt).padStart(4, "0");
    const created = { ...p, receiptNo: no };
    update((d) => { d.counters.receipt += 1; d.payments.push(created); });
    setTimeout(() => setModal({ type: "receipt", payload: created }), 0);
  };
  const delPayment = (id) => update((d) => { d.payments = d.payments.filter((x) => x.id !== id); });
  const saveExpense = (e) => update((d) => { d.expenses.push(e); });
  const delExpense = (id) => update((d) => { d.expenses = d.expenses.filter((x) => x.id !== id); });
  const saveSettings = (s) => update((d) => { d.settings = s; });

  const askConfirm = (message, onYes) => setConfirmBox({ message, onYes });

  /* ----- لوحة المؤشرات ----- */
  const active = contracts.filter((c) => c.status === "active");
  const rentableUnits = properties.reduce((s, p) => s + Math.max(1, (p.units || []).length), 0);
  const occupied = active.length;
  const expectedMonthly = active.reduce((s, c) => s + monthlyEquivalent(c), 0);
  const thisMonth = todayISO().slice(0, 7);
  const collectedThisMonth = payments.filter((p) => (p.paymentDate || "").slice(0, 7) === thisMonth).reduce((s, p) => s + num(p.received), 0);
  const overdueData = active.map((c) => ({ c, L: contractLedger(c) })).filter((x) => x.L.owed > 0.005)
    .sort((a, b) => b.L.owed - a.L.owed);
  const overdueTotal = overdueData.reduce((s, x) => s + x.L.owed, 0);
  const dueSoonList = active.filter((c) => { const n = nextDue(c); return n >= todayISO() && n <= addDays(todayISO(), 7); });
  const expiryWindow = num(settings.expiryAlertDays) || 30;
  const expiringList = active
    .filter((c) => c.endDate && daysBetween(todayISO(), c.endDate) <= expiryWindow)
    .sort((a, b) => (a.endDate < b.endDate ? -1 : 1));

  /* =========================== الشاشات =========================== */
  function Home() {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="العقارات" value={properties.length} sub={`${rentableUnits} وحدة قابلة للتأجير`} />
          <Stat label="نسبة الإشغال" value={`${rentableUnits ? Math.round((occupied / rentableUnits) * 100) : 0}%`} sub={`${occupied} مؤجّر`} color="text-teal-700" />
          <Stat label="الإيراد المتوقع/شهر" value={`${fmt(expectedMonthly)}`} sub={settings.currency} color="text-teal-700" />
          <Stat label="المُحصّل هذا الشهر" value={`${fmt(collectedThisMonth)}`} sub={settings.currency} color="text-emerald-600" />
        </div>

        {overdueData.length > 0 && (
          <div className="bg-rose-600 text-white rounded-2xl p-4 shadow-sm">
            <div className="text-sm font-bold opacity-90">تذكير المتأخرات</div>
            <div className="text-2xl font-extrabold mt-0.5">{fmt(overdueTotal)} {settings.currency}</div>
            <div className="text-sm opacity-90 mt-0.5">{overdueData.length} مستأجر متأخر عن السداد</div>
          </div>
        )}

        <SectionTitle title="متأخرات السداد" badge={overdueData.length} badgeColor="bg-rose-100 text-rose-700" />
        {overdueData.length === 0 ? <p className="text-sm text-stone-400 px-1">لا توجد متأخرات. 👍</p> : overdueData.map((x) => <OverdueCard key={x.c.id} c={x.c} L={x.L} />)}

        <SectionTitle title="تستحق خلال 7 أيام" badge={dueSoonList.length} badgeColor="bg-amber-100 text-amber-700" />
        {dueSoonList.length === 0 ? <p className="text-sm text-stone-400 px-1">لا شيء قريب.</p> : dueSoonList.map((c) => <DueCard key={c.id} c={c} />)}

        <SectionTitle title={`عقود تنتهي خلال ${expiryWindow} يوماً`} badge={expiringList.length} badgeColor="bg-orange-100 text-orange-700" />
        {expiringList.length === 0 ? <p className="text-sm text-stone-400 px-1">لا توجد عقود قاربت على الانتهاء.</p> : expiringList.map((c) => <ExpiryCard key={c.id} c={c} />)}
      </div>
    );
  }

  function OverdueCard({ c, L }) {
    const cur = settings.currency;
    const extra = round2(L.owed - L.unpaid.reduce((s, p) => s + num(p.amount), 0)); // نقص من دفعات سابقة
    return (
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold text-stone-800 truncate">{tenantName(c.tenantId)}</div>
            <div className="text-xs text-stone-500 truncate">{placeName(c)}</div>
          </div>
          <Pill className="bg-rose-100 text-rose-700">عليه {fmt(L.owed)} {cur}</Pill>
        </div>
        <div className="mt-2 text-xs text-stone-500 space-y-0.5">
          {L.unpaid.slice(0, 4).map((p, i) => <div key={i}>• {p.label} — {fmt(p.amount)} {cur}</div>)}
          {L.unpaid.length > 4 && <div>وغيرها…</div>}
          {extra > 0.005 && <div className="text-amber-700 font-bold">• نقص من دفعات سابقة — {fmt(extra)} {cur}</div>}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <WaButtons phones={tenantPhones(c.tenantId)} cc={settings.countryCode} text={reminderText(c)} label="تذكير المستأجر" />
          <Btn onClick={() => openPayment(c)} className="px-3 py-2">تسجيل دفعة</Btn>
        </div>
      </div>
    );
  }

  function ExpiryCard({ c }) {
    const left = daysBetween(todayISO(), c.endDate);
    const badge = left < 0
      ? { txt: `منتهٍ منذ ${Math.abs(left)} يوم`, cls: "bg-rose-100 text-rose-700" }
      : left === 0
        ? { txt: "ينتهي اليوم", cls: "bg-rose-100 text-rose-700" }
        : left <= 7
          ? { txt: `باقٍ ${left} يوم`, cls: "bg-rose-100 text-rose-700" }
          : { txt: `باقٍ ${left} يوم`, cls: "bg-amber-100 text-amber-700" };
    return (
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold text-stone-800 truncate">{tenantName(c.tenantId)}</div>
            <div className="text-xs text-stone-500 truncate">{placeName(c)} · ينتهي {c.endDate}</div>
          </div>
          <Pill className={badge.cls}>{badge.txt}</Pill>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Btn className="px-3 py-2" onClick={() => setModal({ type: "renew", payload: c })}>تجديد / تمديد</Btn>
          <Btn kind="gold" className="px-3 py-2" onClick={() => setModal({ type: "expiry-action", payload: c })}>تنبيه المستأجر</Btn>
          <Btn kind="ghost" className="px-3 py-2" onClick={() => setModal({ type: "transfer", payload: c })}>نقل</Btn>
        </div>
      </div>
    );
  }

  function DueCard({ c, late }) {
    return (
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-stone-800 truncate">{tenantName(c.tenantId)}</div>
          <div className="text-xs text-stone-500 truncate">{placeName(c)} · استحقاق {nextDue(c)}</div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <WaButtons phones={tenantPhones(c.tenantId)} cc={settings.countryCode} text={reminderText(c)} label="تذكير" />
          <Btn onClick={() => openPayment(c)} className="px-3 py-2">دفعة</Btn>
        </div>
      </div>
    );
  }

  function openPayment(c) {
    const periods = chainPeriods(c);
    const idx = nextPeriodIndex(c);
    const ps = periods[idx] || periods[periods.length - 1] || periodSchedule(c, 0);
    const L = contractLedger(c);
    const nextRent = num(ps.amount);
    const defReceived = L.balance > 0.005 ? round2(Math.max(0, nextRent - L.credit)) : L.balance < -0.005 ? L.owed : nextRent;
    setModal({ type: "payment", payload: { contract: c, suggestion: { index: idx, label: ps.label, due: ps.due, amount: ps.amount, prorated: ps.prorated, days: ps.days, priorBalance: L.balance, existingReceived: chainEff(c), defaultReceived: defReceived, periods } } });
  }
  function openEditPayment(p) {
    const c = contractById(p.contractId);
    if (!c) { showToast("العقد غير موجود"); return; }
    const periods = chainPeriods(c);
    const pays = chainPaymentsRaw(c);
    let existingReceived = chainCredit(c);
    for (const x of pays) { if (x.id === p.id) break; existingReceived += num(x.received); }
    const idx = coverChain(periods, existingReceived).count;
    const ps = periods[idx] || periods[periods.length - 1] || periodSchedule(c, 0);
    setModal({ type: "payment", payload: { contract: c, initial: p, suggestion: { index: idx, label: ps.label, due: ps.due, amount: ps.amount, prorated: ps.prorated, days: ps.days, existingReceived, periods } } });
  }

  function Properties() {
    const list = properties.filter((p) => !search || p.name.includes(search) || (p.location || "").includes(search));
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-extrabold text-stone-800 text-lg">العقارات</h2>
          <Btn onClick={() => setModal({ type: "property" })}>+ عقار</Btn>
        </div>
        {list.length === 0 ? <Empty icon="🏢" text="لا توجد عقارات بعد" action={<Btn onClick={() => setModal({ type: "property" })}>إضافة أول عقار</Btn>} /> :
          list.map((p) => <PropertyCard key={p.id} p={p} />)}
      </div>
    );
  }
  function PropertyCard({ p }) {
    const [open, setOpen] = useState(false);
    const cs = active.filter((c) => c.propertyId === p.id);
    const ended = contracts.filter((c) => c.propertyId === p.id && c.status === "ended");
    return (
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setOpen(!open)}>
          <div>
            <div className="font-bold text-stone-800">{p.name}</div>
            <div className="text-xs text-stone-500">{p.type}{p.location ? ` · ${p.location}` : ""} · {(p.units || []).length} وحدة · {cs.length} مؤجّر</div>
          </div>
          <span className="text-stone-400">{open ? "▲" : "▼"}</span>
        </div>
        {open && (
          <div className="border-t border-stone-100 p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Btn kind="ghost" className="px-3 py-2" onClick={() => setModal({ type: "unit", payload: { propId: p.id, propName: p.name } })}>+ وحدة</Btn>
              <Btn kind="ghost" className="px-3 py-2" onClick={() => setModal({ type: "contract", payload: { presetProperty: p.id } })}>+ عقد إيجار</Btn>
              <Btn kind="gold" className="px-3 py-2" onClick={() => setModal({ type: "placeStatement", payload: { propertyId: p.id, unitId: null, title: `كشف العقار — ${p.name}` } })}>كشف العقار</Btn>
              <Btn kind="ghost" className="px-3 py-2" onClick={() => setModal({ type: "property", payload: p })}>تعديل</Btn>
              <Btn kind="danger" className="px-3 py-2" onClick={() => askConfirm("حذف العقار؟ لن تُحذف العقود تلقائياً.", () => delProperty(p.id))}>حذف</Btn>
            </div>
            {(p.units || []).length > 0 && (
              <div>
                <div className="text-xs font-bold text-stone-500 mb-1">الوحدات</div>
                <div className="space-y-1.5">
                  {(p.units || []).map((u) => {
                    const occ = active.find((c) => c.unitId === u.id);
                    return (
                      <div key={u.id} className="bg-stone-50 rounded-xl px-3 py-2 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <span className="font-bold">{u.name}</span>{u.desc ? <span className="text-stone-400"> · {u.desc}</span> : ""}
                            {occ && <span className="text-teal-700"> · {tenantName(occ.tenantId)}</span>}
                          </div>
                          {occ ? <Pill className="bg-teal-100 text-teal-700">مؤجّر</Pill> : <Pill className="bg-stone-200 text-stone-600">شاغر</Pill>}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs">
                          <button className="text-teal-700 font-bold" onClick={() => setModal({ type: "placeStatement", payload: { propertyId: p.id, unitId: u.id, title: `كشف ${u.name} — ${p.name}` } })}>كشف</button>
                          {!occ && <button className="text-teal-700 font-bold" onClick={() => setModal({ type: "contract", payload: { presetProperty: p.id, presetUnit: u.id } })}>تأجير</button>}
                          <button className="text-stone-500" onClick={() => setModal({ type: "unit", payload: { propId: p.id, propName: p.name, unit: u } })}>تعديل</button>
                          <button className="text-rose-400" onClick={() => askConfirm("حذف الوحدة؟", () => delUnit(p.id, u.id))}>حذف</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {cs.length > 0 && (
              <div>
                <div className="text-xs font-bold text-stone-500 mb-1">العقود النشطة</div>
                {cs.map((c) => <ContractMini key={c.id} c={c} />)}
              </div>
            )}
            {ended.length > 0 && (
              <div className="text-xs text-stone-400">عقود سابقة محفوظة: {ended.length} — اطّلع عليها عبر «كشف العقار».</div>
            )}
          </div>
        )}
      </div>
    );
  }
  function ContractMini({ c }) {
    return (
      <div className="flex items-center justify-between bg-teal-50 rounded-xl px-3 py-2 text-sm mb-1.5">
        <div><span className="font-bold">{tenantName(c.tenantId)}</span><span className="text-stone-500"> · {fmt(c.amount)} {settings.currency}/{rentLabel(c.rentType)}</span></div>
        <Btn onClick={() => openPayment(c)} className="px-3 py-1.5">دفعة</Btn>
      </div>
    );
  }

  function Tenants() {
    const list = tenants.filter((t) => !search || t.name.includes(search) || tenantPhones(t.id).some((p) => p.includes(search)));
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-extrabold text-stone-800 text-lg">المستأجرون</h2>
          <Btn onClick={() => setModal({ type: "tenant" })}>+ مستأجر</Btn>
        </div>
        {list.length === 0 ? <Empty icon="👤" text="لا يوجد مستأجرون بعد" action={<Btn onClick={() => setModal({ type: "tenant" })}>إضافة مستأجر</Btn>} /> :
          list.map((t) => <TenantCard key={t.id} t={t} />)}
      </div>
    );
  }
  function TenantCard({ t }) {
    const [open, setOpen] = useState(false);
    const s = statementFor(t.id);
    return (
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setOpen(!open)}>
          <div>
            <div className="font-bold text-stone-800">{t.name}</div>
            <div className="text-xs text-stone-500">{(tenantPhones(t.id).join("، ")) || "بدون رقم"} · رصيد {fmt(s.balance)} {settings.currency}</div>
          </div>
          <span className="text-stone-400">{open ? "▲" : "▼"}</span>
        </div>
        {open && (
          <div className="border-t border-stone-100 p-4 space-y-2">
            <div className="flex flex-wrap gap-2">
              <Btn className="px-3 py-2" onClick={() => setModal({ type: "statement", payload: t.id })}>كشف الحساب (عرض / إرسال)</Btn>
              <Btn kind="ghost" className="px-3 py-2" onClick={() => setModal({ type: "tenant", payload: t })}>تعديل</Btn>
              <Btn kind="danger" className="px-3 py-2" onClick={() => askConfirm("حذف المستأجر؟", () => delTenant(t.id))}>حذف</Btn>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm pt-1">
              <div className="bg-stone-50 rounded-xl p-2"><div className="text-xs text-stone-500">مستحق</div><div className="font-bold">{fmt(s.charged)}</div></div>
              <div className="bg-stone-50 rounded-xl p-2"><div className="text-xs text-stone-500">مسدّد</div><div className="font-bold text-emerald-600">{fmt(s.received)}</div></div>
              <div className="bg-stone-50 rounded-xl p-2"><div className="text-xs text-stone-500">متبقٍ</div><div className="font-bold text-rose-600">{fmt(s.balance)}</div></div>
            </div>
            {s.contracts.length > 0 && <div className="text-xs text-stone-500 pt-1">العقود: {s.contracts.map((c) => placeName(c)).join("، ")}</div>}
          </div>
        )}
      </div>
    );
  }

  function Collection() {
    const list = active.filter((c) => !search || tenantName(c.tenantId).includes(search) || placeName(c).includes(search));
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-extrabold text-stone-800 text-lg">التحصيل والإيصالات</h2>
          {properties.length > 0 && tenants.length > 0 && <Btn onClick={() => setModal({ type: "contract" })}>+ عقد</Btn>}
        </div>
        {active.length === 0 ? <Empty icon="🧾" text="لا توجد عقود نشطة. أنشئ عقداً لبدء التحصيل." action={properties.length && tenants.length ? <Btn onClick={() => setModal({ type: "contract" })}>عقد جديد</Btn> : <span className="text-sm text-stone-400">أضف عقاراً ومستأجراً أولاً</span>} /> :
          list.map((c) => {
            const due = nextDue(c); const late = due < todayISO();
            const last = paymentsOf(c.id).slice(-1)[0];
            const L = contractLedger(c);
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-stone-800 truncate">{tenantName(c.tenantId)}</div>
                    <div className="text-xs text-stone-500 truncate">{placeName(c)} · {fmt(c.amount)} {settings.currency}/{rentLabel(c.rentType)}</div>
                    <div className="text-xs mt-1">
                      الاستحقاق التالي: <span className={late ? "text-rose-600 font-bold" : "text-stone-600"}>{due}</span> {late && <Pill className="bg-rose-100 text-rose-700">متأخر</Pill>}
                    </div>
                    <div className="text-xs mt-1">
                      {L.owed > 0.005
                        ? <span className="text-rose-700 font-bold">الرصيد: عليه {fmt(L.owed)} {settings.currency}</span>
                        : L.credit > 0.005
                          ? <span className="text-sky-700 font-bold">الرصيد: له {fmt(L.credit)} {settings.currency}</span>
                          : <span className="text-emerald-700 font-bold">الحساب مسوّى</span>}
                    </div>
                  </div>
                  <Btn onClick={() => openPayment(c)} className="shrink-0">+ دفعة</Btn>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <WaButtons phones={tenantPhones(c.tenantId)} cc={settings.countryCode} text={reminderText(c)} label="تذكير سداد" />
                  <Btn kind="gold" className="px-3 py-2" onClick={() => setModal({ type: "schedule", payload: c })}>جدول السداد</Btn>
                  <Btn kind="ghost" className="px-3 py-2" onClick={() => setModal({ type: "contract-view", payload: c })}>إرسال العقد</Btn>
                  {last && <Btn kind="ghost" className="px-3 py-2" onClick={() => setModal({ type: "receipt", payload: last })}>آخر إيصال ({last.receiptNo})</Btn>}
                  <Btn kind="ghost" className="px-3 py-2" onClick={() => setModal({ type: "contract", payload: c })}>تعديل العقد</Btn>
                  <Btn kind="ghost" className="px-3 py-2" onClick={() => setModal({ type: "renew", payload: c })}>تجديد / تمديد</Btn>
                  <Btn kind="ghost" className="px-3 py-2" onClick={() => setModal({ type: "transfer", payload: c })}>نقل</Btn>
                  <Btn kind="ghost" className="px-3 py-2" onClick={() => askConfirm("إنهاء العقد؟ يبقى السجل محفوظاً.", () => endContract(c.id))}>إنهاء</Btn>
                </div>
                {paymentsOf(c.id).length > 0 && (
                  <details className="mt-3">
                    <summary className="text-xs font-bold text-teal-700 cursor-pointer">سجل الإيصالات ({paymentsOf(c.id).length})</summary>
                    <div className="mt-2 space-y-1.5">
                      {paymentsOf(c.id).slice().reverse().map((p) => {
                        const st = paymentStatus(p);
                        return (
                          <div key={p.id} className="flex items-center justify-between bg-stone-50 rounded-xl px-3 py-2 text-sm">
                            <div className="min-w-0"><div className="font-bold truncate">{p.receiptNo} · {fmt(p.received)} {settings.currency}</div><div className="text-xs text-stone-400">{p.paymentDate}</div></div>
                            <div className="flex items-center gap-2"><Pill className={st.color}>{st.label}</Pill><button onClick={() => setModal({ type: "receipt", payload: p })} className="text-teal-700 text-xs font-bold">عرض</button><button onClick={() => openEditPayment(p)} className="text-stone-500 text-xs font-bold">تعديل</button><button onClick={() => askConfirm("حذف هذا الإيصال؟", () => delPayment(p.id))} className="text-rose-400 text-xs font-bold">حذف</button></div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
      </div>
    );
  }

  function More() {
    const totalIncome = payments.reduce((s, p) => s + num(p.received), 0);
    const totalExp = expenses.reduce((s, e) => s + num(e.amount), 0);
    return (
      <div className="space-y-3">
        <h2 className="font-extrabold text-stone-800 text-lg">المزيد</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="إجمالي التحصيل" value={fmt(totalIncome)} sub={settings.currency} color="text-emerald-600" />
          <Stat label="إجمالي المصاريف" value={fmt(totalExp)} sub={settings.currency} color="text-rose-600" />
        </div>
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-stone-800">المصاريف والصيانة</h3>
            {properties.length > 0 && <Btn className="px-3 py-2" onClick={() => setModal({ type: "expense" })}>+ مصروف</Btn>}
          </div>
          <div className="text-sm font-bold text-teal-700 mb-2">صافي الدخل: {fmt(totalIncome - totalExp)} {settings.currency}</div>
          {expenses.length === 0 ? <p className="text-sm text-stone-400">لا توجد مصاريف مسجّلة.</p> :
            <div className="space-y-1.5">
              {expenses.slice().reverse().map((e) => (
                <div key={e.id} className="flex items-center justify-between bg-stone-50 rounded-xl px-3 py-2 text-sm">
                  <div><span className="font-bold">{e.cat}</span> · {fmt(e.amount)} {settings.currency}<span className="text-stone-400"> · {propertyById(e.propertyId)?.name || "عام"} · {e.date}</span></div>
                  <button onClick={() => askConfirm("حذف المصروف؟", () => delExpense(e.id))} className="text-rose-400 text-xs">حذف</button>
                </div>
              ))}
            </div>}
        </div>

        <MenuRow icon="📄" label={`أرشيف العقود (${contracts.length})`} onClick={() => setModal({ type: "archive" })} />
        <MenuRow icon="⚙️" label="الإعدادات (العملة، رمز الدولة، الشعار)" onClick={() => setModal({ type: "settings" })} />
        <MenuRow icon="🔔" label={settings.notify ? "تنبيهات المتأخرات مفعّلة ✓" : "تفعيل تنبيهات المتأخرات"} onClick={enableNotifications} />
        <MenuRow icon="⬇️" label="تصدير نسخة احتياطية (JSON)" onClick={exportBackup} />
        <MenuRow icon="⬆️" label="استيراد نسخة احتياطية" onClick={() => importRef.current?.click()} />
        <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={importBackup} />
        <MenuRow icon="🗑️" label="مسح كل البيانات" danger onClick={() => askConfirm("سيتم حذف جميع البيانات نهائياً. متأكد؟", () => setData(defaultData()))} />
        <p className="text-center text-xs text-stone-300 pt-2">بياناتك محفوظة تلقائياً على هذا الجهاز.</p>
      </div>
    );
  }
  function MenuRow({ icon, label, onClick, danger }) {
    return (
      <button onClick={onClick} className={`w-full bg-white rounded-2xl border border-stone-100 shadow-sm p-4 flex items-center gap-3 text-right ${danger ? "text-rose-600" : "text-stone-700"}`}>
        <span className="text-xl">{icon}</span><span className="font-bold flex-1">{label}</span><span className="text-stone-300">‹</span>
      </button>
    );
  }

  function enableNotifications() {
    try {
      if (typeof Notification === "undefined") { showToast("التنبيهات غير مدعومة في هذه البيئة"); return; }
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") { update((d) => { d.settings.notify = true; }); showToast("تم تفعيل التنبيهات"); }
        else showToast("لم يتم منح إذن التنبيهات");
      }).catch(() => showToast("التنبيهات غير متاحة هنا"));
    } catch (e) { showToast("التنبيهات غير متاحة هنا"); }
  }
  function exportBackup() {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `عقارات-${todayISO()}.json`; a.click();
      URL.revokeObjectURL(url); showToast("تم التصدير");
    } catch (e) { showToast("تعذّر التصدير"); }
  }
  function importBackup(ev) {
    const f = ev.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { const d = JSON.parse(r.result); setData({ ...defaultData(), ...d }); showToast("تم الاستيراد"); } catch (e) { showToast("ملف غير صالح"); } };
    r.readAsText(f); ev.target.value = "";
  }

  /* ----- تبويب سفلي ----- */
  const tabs = [
    { id: "home", label: "الرئيسية", icon: "🏠" },
    { id: "properties", label: "العقارات", icon: "🏢" },
    { id: "collection", label: "التحصيل", icon: "🧾" },
    { id: "tenants", label: "المستأجرون", icon: "👤" },
    { id: "more", label: "المزيد", icon: "⋯" },
  ];
  const showSearch = ["properties", "tenants", "collection"].includes(tab);

  return (
    <div className="pm-root min-h-screen bg-stone-50" dir="rtl">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Amiri:wght@700&display=swap');
        .pm-root, .pm-root * { font-family: 'Cairo','Segoe UI',Tahoma,sans-serif; }
        .pm-root .font-amiri { font-family: 'Amiri','Cairo',serif; }
        .pm-root details summary{ list-style:none; } .pm-root details summary::-webkit-details-marker{ display:none; }
        @media print {
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { position: absolute; inset: 0; margin: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* الترويسة */}
      <header className="bg-teal-800 text-white sticky top-0 z-30 shadow-md border-b-2 border-amber-400">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-teal-900 flex items-center justify-center font-amiri text-xl font-bold shrink-0">ع</div>
            <div>
              <div className="font-extrabold text-lg leading-tight">إدارة العقارات</div>
              <div className="text-teal-200 text-xs">{settings.org || "إيجارات وإيصالات"}</div>
            </div>
          </div>
          <div className="text-teal-200 text-xs">{todayISO()}</div>
        </div>
        {showSearch && (
          <div className="max-w-2xl mx-auto px-4 pb-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث…" className="w-full rounded-xl px-3 py-2 text-stone-800 text-sm focus:outline-none" />
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 pb-28">
        {tab === "home" && <Home />}
        {tab === "properties" && <Properties />}
        {tab === "collection" && <Collection />}
        {tab === "tenants" && <Tenants />}
        {tab === "more" && <More />}
      </main>

      {/* تبويب سفلي */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-stone-200 z-30 shadow-lg">
        <div className="max-w-2xl mx-auto grid grid-cols-5">
          {tabs.map((t) => {
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => { setTab(t.id); setSearch(""); }} className="relative py-2.5 flex flex-col items-center gap-0.5">
                {on && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-amber-400"></span>}
                <span className={`text-lg ${on ? "" : "opacity-60"}`}>{t.icon}</span>
                <span className={`text-xs font-bold ${on ? "text-teal-800" : "text-stone-400"}`}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* النماذج */}
      {modal?.type === "property" && <PropertyForm initial={modal.payload} onClose={() => setModal(null)} onSave={(p) => { saveProperty(p); setModal(null); }} />}
      {modal?.type === "unit" && <UnitForm propertyName={modal.payload.propName} initial={modal.payload.unit} onClose={() => setModal(null)} onSave={(u) => { saveUnit(modal.payload.propId, u); setModal(null); }} />}
      {modal?.type === "tenant" && <TenantForm initial={modal.payload} defaultCC={settings.countryCode} onClose={() => setModal(null)} onSave={(t) => { saveTenant(t); setModal(null); }} />}
      {modal?.type === "contract" && <ContractForm initial={modal.payload?.id ? modal.payload : null} preset={modal.payload?.id ? null : modal.payload} properties={properties} tenants={tenants} contracts={contracts} onAddTenant={() => setModal({ type: "tenant" })} onClose={() => setModal(null)} onSave={handleSaveContract} />}
      {modal?.type === "payment" && <PaymentForm contract={modal.payload.contract} suggestion={modal.payload.suggestion} initial={modal.payload.initial} ctx={{ ...ctx, tenantName, placeName }} onClose={() => setModal(null)} onSave={(p) => savePayment(p)} />}
      {modal?.type === "receipt" && <ReceiptView payment={modal.payload} ctx={{ ...ctx, tenantName, placeName, contractById, tenantPhone, tenantPhones, contractLedger, toast: showToast }} onEdit={() => openEditPayment(modal.payload)} onClose={() => setModal(null)} />}
      {modal?.type === "statement" && <StatementView data={statementStruct(modal.payload)} text={statementText(modal.payload)} phones={tenantPhones(modal.payload)} ctx={{ settings, copy, toast: showToast }} onClose={() => setModal(null)} />}
      {modal?.type === "placeStatement" && <PlaceStatementView title={modal.payload.title} stmt={statementForPlace(modal.payload.propertyId, modal.payload.unitId)} text={placeStatementText(modal.payload.propertyId, modal.payload.unitId, modal.payload.title)} currency={settings.currency} logo={settings.logo} onCopy={copy} onClose={() => setModal(null)} />}
      {modal?.type === "transfer" && <TransferForm contract={modal.payload} properties={properties} contracts={contracts} tenantName={tenantName} placeName={placeName} currency={settings.currency} onClose={() => setModal(null)} onSave={(payload) => handleTransfer(modal.payload, payload)} />}
      {modal?.type === "expiry-action" && <ExpiryActionModal contract={modal.payload} ctx={{ settings, tenantName, placeName, tenantPhones, copy, expiryMsgVacate, expiryMsgReprice, expiryMsgNotes }} onClose={() => setModal(null)} onRenew={() => setModal({ type: "renew", payload: modal.payload })} />}
      {modal?.type === "archive" && (() => {
        const cur = settings.currency;
        const list = contracts.slice().sort((a, b) => ((a.startDate || "") < (b.startDate || "") ? 1 : -1));
        return (
          <Modal title={`أرشيف العقود (${list.length})`} onClose={() => setModal(null)} wide>
            {list.length === 0 ? <p className="text-sm text-stone-400">لا توجد عقود بعد.</p> : (
              <div className="space-y-2">
                {list.map((c) => {
                  const L = contractLedger(c);
                  return (
                    <div key={c.id} className="border border-stone-200 rounded-2xl p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-stone-800 truncate">{c.contractNo || "—"} · {tenantName(c.tenantId)}</div>
                          <div className="text-xs text-stone-500 truncate">{placeName(c)} · {fmt(c.amount)} {cur}/{rentLabel(c.rentType)}</div>
                          <div className="text-xs text-stone-400">من {c.startDate || "—"}{c.endDate ? ` إلى ${c.endDate}` : ""}</div>
                        </div>
                        <Pill className={c.status === "active" ? "bg-teal-100 text-teal-700" : "bg-stone-200 text-stone-600"}>{c.status === "active" ? "نشط" : "منتهٍ"}</Pill>
                      </div>
                      <div className="text-xs mt-1">{L.owed > 0.005 ? <span className="text-rose-700 font-bold">عليه {fmt(L.owed)} {cur}</span> : L.credit > 0.005 ? <span className="text-sky-700 font-bold">له {fmt(L.credit)} {cur}</span> : <span className="text-emerald-700 font-bold">مسوّى</span>}</div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Btn kind="ghost" className="px-3 py-1.5 text-sm" onClick={() => setModal({ type: "contract-view", payload: c })}>عرض / إرسال العقد</Btn>
                        <Btn kind="gold" className="px-3 py-1.5 text-sm" onClick={() => setModal({ type: "schedule", payload: c })}>جدول السداد</Btn>
                        {c.status === "ended" && (!c.endDate || c.endDate >= todayISO()) && <Btn className="px-3 py-1.5 text-sm" onClick={() => askConfirm("استعادة هذا العقد وجعله نشطاً؟", () => restoreContract(c.id))}>استعادة</Btn>}
                        <Btn kind="ghost" className="px-3 py-1.5 text-sm text-rose-600" onClick={() => askConfirm(`حذف العقد ${c.contractNo || ""} وكل مدفوعاته نهائياً؟`, () => deleteContract(c.id))}>حذف</Btn>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Modal>
        );
      })()}
      {modal?.type === "renew" && <RenewForm contract={modal.payload} tenantName={tenantName} placeName={placeName} currency={settings.currency} onClose={() => setModal(null)} onSave={(nd) => handleRenew(modal.payload, nd)} />}
      {modal?.type === "contract-view" && <ContractView contract={modal.payload} ctx={{ ...ctx, tenantName, placeName, tenantPhones, contractText, copy, toast: showToast }} onClose={() => setModal(null)} />}
      {modal?.type === "renewal" && (() => {
        const c = modal.payload.c; const text = renewalText(c, modal.payload.old, modal.payload.carried);
        return (
          <Modal title="إشعار تجديد/تمديد العقد" onClose={() => setModal(null)}>
            <div className="bg-teal-50 text-teal-800 rounded-xl p-3 text-sm mb-3">تم حفظ العقد. يمكنك إرسال إشعار للمستأجر «{tenantName(c.tenantId)}» بالتجديد/التمديد.</div>
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-sm whitespace-pre-wrap mb-3">{text}</div>
            <div className="flex flex-wrap gap-2">
              <WaButtons phones={tenantPhones(c.tenantId)} cc={settings.countryCode} text={text} label="إرسال عبر واتساب" />
              <Btn kind="ghost" onClick={() => copy(text)}>نسخ النص</Btn>
              <Btn kind="ghost" onClick={() => setModal(null)}>لاحقاً</Btn>
            </div>
          </Modal>
        );
      })()}
      {modal?.type === "schedule" && (() => {
        const c = modal.payload; const rows = periodAllocation(c); const cur = settings.currency;
        const stColor = { paid: "bg-emerald-100 text-emerald-700", partial: "bg-amber-100 text-amber-700", unpaid: "bg-rose-100 text-rose-700" };
        const stLabel = { paid: "مسدّد", partial: "جزئي", unpaid: "غير مسدّد" };
        return (
          <Modal title={`جدول السداد — ${tenantName(c.tenantId)}`} onClose={() => setModal(null)} wide>
            <div className="bg-teal-50 text-teal-800 rounded-xl p-3 text-sm mb-3">{placeName(c)} · عقد {c.contractNo || "—"} · الفترات مرتّبة من الأقدم، ويُسوّى الأقدم أولاً.</div>
            <div className="space-y-1.5">
              {rows.map((r) => {
                const isOther = r.contractNo && r.contractNo !== c.contractNo;
                return (
                  <div key={r.index} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm gap-2 ${r.status === "unpaid" ? "bg-rose-50" : "bg-stone-50"}`}>
                    <div className="min-w-0">
                      <div className="font-bold truncate">{r.label}</div>
                      <div className="text-xs text-stone-400">
                        {fmt(r.amount)} {cur}
                        {isOther && <span className="text-rose-600"> · من عقد {r.contractNo}</span>}
                        {r.status === "partial" && <span className="text-amber-600"> · سُدّد {fmt(r.paidAmt)}</span>}
                        {r.receipts.length > 0 && <span> · {r.receipts.join("، ")}</span>}
                      </div>
                    </div>
                    <Pill className={stColor[r.status]}>{stLabel[r.status]}</Pill>
                  </div>
                );
              })}
              {rows.length === 0 && <p className="text-sm text-stone-400">لا توجد فترات بعد.</p>}
            </div>
          </Modal>
        );
      })()}
      {modal?.type === "expense" && <ExpenseForm properties={properties} currency={settings.currency} onClose={() => setModal(null)} onSave={(e) => { saveExpense(e); setModal(null); }} />}
      {modal?.type === "settings" && <SettingsForm settings={settings} onClose={() => setModal(null)} onSave={(s) => { saveSettings(s); setModal(null); }} />}

      {/* تأكيد */}
      {confirmBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5">
            <p className="text-stone-700 font-bold mb-4">{confirmBox.message}</p>
            <div className="flex gap-2">
              <Btn kind="danger" className="flex-1" onClick={() => { confirmBox.onYes(); setConfirmBox(null); }}>نعم</Btn>
              <Btn kind="ghost" className="flex-1" onClick={() => setConfirmBox(null)}>إلغاء</Btn>
            </div>
          </div>
        </div>
      )}

      {/* إشعار */}
      {toast && <div className="fixed bottom-24 inset-x-0 flex justify-center z-50"><div className="bg-stone-800 text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg">{toast}</div></div>}
    </div>
  );
}

function defaultData() {
  return {
    properties: [],
    tenants: [],
    contracts: [],
    payments: [],
    expenses: [],
    counters: { receipt: 1, contract: 1 },
    settings: { org: "", ownerPhone: "", currency: "د.ل", countryCode: "218", receiptPrefix: "REC-", expiryAlertDays: 30, logo: "", logoOnly: false, notify: false, contractTerms: "" },
  };
}

import { useEffect, useState } from 'react';

const pad = (value: number) => String(value).padStart(2, '0');
const validIso = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
export const isoToDateDisplay = (iso: string) => validIso(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
export const currentLocalDate = () => { const date = new Date(); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; };
export const formatDateInput = (value: string) => { const digits = value.replace(/\D/g, '').slice(0, 8); return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/'); };
export const preserveDateEdit = (value: string) => /^\d{8}$/.test(value) ? formatDateInput(value) : value.slice(0, 10);
export const parseDateDisplay = (value: string) => { const match=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!match)return'';const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]),date=new Date(year,month-1,day);return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?`${year}-${pad(month)}-${pad(day)}`:''; };

export default function DateField({ label, name, defaultValue = '', value, required = false }: any) {
  const provided = String(value ?? defaultValue ?? '');
  const source = validIso(provided) ? provided : (required ? currentLocalDate() : '');
  const initial = source ? new Date(`${source}T00:00:00`) : new Date();
  const [iso, setIso] = useState(source);
  const [display, setDisplay] = useState(isoToDateDisplay(source));
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const years = Array.from({ length: 201 }, (_, index) => 1900 + index);

  useEffect(() => {
    setIso(source);
    setDisplay(isoToDateDisplay(source));
    if (source) { setViewYear(Number(source.slice(0, 4))); setViewMonth(Number(source.slice(5, 7)) - 1); }
  }, [source]);

  const moveMonth = (offset: number) => { const date = new Date(viewYear, viewMonth + offset, 1); setViewYear(date.getFullYear()); setViewMonth(date.getMonth()); };
  const updateText = (raw:string) => { const nextDisplay=preserveDateEdit(raw),nextIso=parseDateDisplay(nextDisplay);setDisplay(nextDisplay);setIso(nextIso);const parts=nextDisplay.split('/');if(parts[1]&&Number(parts[1])>=1&&Number(parts[1])<=12)setViewMonth(Number(parts[1])-1);if(parts[2]?.length===4&&Number(parts[2])>=1900&&Number(parts[2])<=2100)setViewYear(Number(parts[2])); };
  const choose = (date: Date) => { const next = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; setIso(next);setDisplay(isoToDateDisplay(next)); setViewYear(date.getFullYear()); setViewMonth(date.getMonth()); setOpen(false); };
  const first = new Date(viewYear, viewMonth, 1); const offset = (first.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, index) => new Date(viewYear, viewMonth, index - offset + 1));

  return <label>{label}<div className="date-field"><input className="input date-text-input" type="text" inputMode="numeric" maxLength={10} value={display} onChange={event=>updateText(event.target.value)} onFocus={()=>setOpen(true)} placeholder="DD/MM/YYYY" required={required} pattern={display?(iso?'\\d{1,2}/\\d{1,2}/\\d{4}':'(?!)'):(required?'(?!)':'.*')} aria-invalid={Boolean(display)&&!iso}/><input type="hidden" name={name} value={iso}/><button className="date-picker-button" type="button" aria-label={`Mở lịch ${label}`} aria-expanded={open} onClick={() => setOpen(current => !current)}>▣</button>{open && <div className="date-calendar" role="dialog" aria-label={`Lịch ${label}`}><div className="date-calendar-head"><button type="button" aria-label="Tháng trước" onClick={() => moveMonth(-1)}>‹</button><div className="date-calendar-period"><select aria-label="Chọn tháng" value={viewMonth} onChange={event => setViewMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, month) => <option value={month} key={month}>Tháng {month + 1}</option>)}</select><select aria-label="Chọn năm" value={viewYear} onChange={event => setViewYear(Number(event.target.value))}>{years.map(year => <option value={year} key={year}>{year}</option>)}</select></div><button type="button" aria-label="Tháng sau" onClick={() => moveMonth(1)}>›</button></div><div className="date-calendar-week"><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span></div><div className="date-calendar-grid">{days.map(date => { const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; return <button type="button" key={key} className={(date.getMonth() !== viewMonth ? 'outside ' : '') + (key === iso ? 'selected' : '')} onClick={() => choose(date)}>{date.getDate()}</button>; })}</div>{!required && iso && <button className="date-clear" type="button" onClick={() => { setIso('');setDisplay(''); setOpen(false); }}>Xóa ngày đã chọn</button>}</div>}</div></label>;
}

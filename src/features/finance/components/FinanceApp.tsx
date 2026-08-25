import React, { FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import './theme.css';
import { readAppState, writeAppState } from '../../../lib/database';
import type { Borrower, CategoryGroups, LanguageCode, LendingRate, Loan, Txn, User } from '../types';
import { selectFinanceData } from '../state';
import { parseAmountExpression } from '../amountExpression';
import { openingCarryover } from '../carryover';
import DateField from './DateField';
import { renameCategoryInTransactions } from '../categorySync';
import { loanSchedule, projectedLoanTotal, remainingLoanBalance } from '../loanInterest';
import { getServerSession, googleClientId, googleLoginEnabled, readServerState, serverApiEnabled, serverGoogleLogin, serverLogin, serverLogout, serverRegister, writeServerState } from '../../../lib/api';
type Tab = 'dashboard' | 'transactions' | 'borrowers' | 'rates' | 'loans' | 'calculator' | 'compound' | 'split' | 'categories' | 'language' | 'admin';
const adminEmail = 'adminJilly@gmail.com';
const legacyAdminEmail = 'admin@example.com';
const sameEmail = (left:string,right:string) => left.toLocaleLowerCase()===right.toLocaleLowerCase();
const passwordIterations = 210000;
const defaultAdmin:User = {name:'Admin',email:adminEmail,passwordSalt:'WqR51YKpjX1hDwJ9VERgEw==',passwordHash:'BWsnTbgNkvi4SqEiGK2ZGmJcpTU+MSuQym/ww2u5rRs='};
const bytesToBase64 = (bytes:Uint8Array) => btoa(String.fromCharCode(...Array.from(bytes)));
const base64ToBytes = (value:string) => Uint8Array.from(atob(value),character=>character.charCodeAt(0));
async function derivePasswordHash(password:string,salt:string) {
  const passwordKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:base64ToBytes(salt),iterations:passwordIterations},passwordKey,256);
  return bytesToBase64(new Uint8Array(bits));
}
async function createPasswordCredential(password:string) {
  const salt=bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  return {passwordSalt:salt,passwordHash:await derivePasswordHash(password,salt)};
}
async function verifyPassword(account:User,password:string) {
  if(account.passwordHash&&account.passwordSalt)return (await derivePasswordHash(password,account.passwordSalt))===account.passwordHash;
  return account.password===password;
}
async function upgradeUserCredential(account:User):Promise<User> {
  if(!account.password||account.passwordHash)return account;
  const credential=await createPasswordCredential(account.password);const safeAccount={...account};delete safeAccount.password;
  return {...safeAccount,...credential};
}

const key = 'so_tai_chinh_v2';
const initialTxns: Txn[] = [
  { id:'t1', type:'income', category:'Lương tháng', amount:18000000, date:'2026-07-05', note:'Lương tháng 7' },
  { id:'t2', type:'expense', category:'Ăn uống', amount:250000, date:'2026-07-06', note:'Cơm nhóm' },
  { id:'t3', type:'expense', category:'Mua sắm', amount:1200000, date:'2026-07-07', note:'Quần áo' },
  { id:'t4', type:'saving', category:'Quỹ khẩn cấp', amount:3000000, date:'2026-07-07', note:'' },
  { id:'t5', type:'expense', category:'Đi lại', amount:180000, date:'2026-07-08', note:'Di chuyển' },
  { id:'t6', type:'income', category:'Freelance', amount:5000000, date:'2026-07-14', note:'Dự án web' },
];
const defaultCategories: CategoryGroups = { income:['Lương tháng','Freelance','Thưởng','Đầu tư'], expense:['Ăn uống','Mua sắm','Đi lại','Giải trí','Hóa đơn','Sức khỏe'], saving:['Quỹ khẩn cấp','Tiết kiệm nhà','Quỹ du lịch'] };
const hasFinanceState=(value:any)=>Boolean(value&&(value.txns||value.borrowers||value.rates||value.loans||value.categories));
const money = (n:number) => new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(n);
const id = () => Math.random().toString(36).slice(2,10);
const displayMonth = (key:string) => { const [year,month]=key.split('-'); return `Th.${Number(month)}/${year}`; };
export const currentDayInMonth = (key:string,base=new Date()) => { const [year,month]=key.split('-').map(Number),lastDay=new Date(year,month,0).getDate(),day=Math.min(base.getDate(),lastDay);return /^\d{4}-\d{2}$/.test(key)?`${key}-${String(day).padStart(2,'0')}`:''; };
export const borrowerDefaultRate = (borrowers:Borrower[],borrowerId:string) => borrowers.find(borrower=>borrower.id===borrowerId)?.rate ?? '';
const editEvent = 'finance-edit-record';
const openEditEvent = 'finance-open-edit';
const requestEdit = (kind:string, item:unknown) => window.dispatchEvent(new CustomEvent(editEvent,{detail:{kind,item}}));
const openEditor = (kind:string, item:unknown, borrowers:Borrower[] = []) => window.dispatchEvent(new CustomEvent(openEditEvent,{detail:{kind,item,borrowers}}));

function migrateAdminAccount(data:any) {
  if(!data)return data;
  const migrateUser=(account:User|null|undefined)=>account&&sameEmail(account.email,legacyAdminEmail)?{...account,email:adminEmail}:account;
  const dataByUser={...(data.dataByUser||{})};
  if(dataByUser[legacyAdminEmail]&&!dataByUser[adminEmail])dataByUser[adminEmail]=dataByUser[legacyAdminEmail];
  delete dataByUser[legacyAdminEmail];
  return {...data,user:migrateUser(data.user),users:data.users?.map(migrateUser),dataByUser};
}
function load() { try { return migrateAdminAccount(JSON.parse(localStorage.getItem(key) || 'null')); } catch { return null; } }
function save(data: unknown) {
  localStorage.setItem(key, JSON.stringify(data));
  void writeAppState(data as Record<string, unknown>).catch(() => {
    // localStorage remains a compatibility backup if IndexedDB is unavailable.
  });
  if(serverApiEnabled){
    const snapshot=data as any;const owner=snapshot.user?.email;const finance=owner?snapshot.dataByUser?.[owner]:null;
    if(finance)void writeServerState({...finance,theme:snapshot.theme||'light',language:snapshot.language||'vi'}).catch(()=>undefined);
  }
}
const english: Record<string, string> = {
  'Sổ Tài Chính':'Personal Finance','CHI TIÊU & CHO VAY':'EXPENSES & LENDING','QUẢN LÝ':'MANAGE','TÀI CHÍNH':'FINANCIALS',
  'Bảng điều khiển':'Dashboard','Cài đặt':'Settings','Danh mục':'Categories','Người vay':'Borrowers','Mức lãi suất':'Lending rates',
  'Quản lý ngôn ngữ':'Language','Giao dịch':'Transactions','Sổ vay nợ':'Loan Book','Công cụ tính lãi':'Interest calculator',
  'Lãi kép':'Compound interest','Lãi đơn':'Simple interest','Xin chào,':'Hello,','Giao diện tối':'Dark theme','Giao diện sáng':'Light theme',
  'Đăng xuất':'Log out','Thêm giao dịch':'Add transaction','Thêm khoản vay':'Add loan','Loại giao dịch':'Transaction type',
  'Chi tiêu':'Expense','Thu nhập':'Income','Tiết kiệm':'Savings','Số tiền (VNĐ)':'Amount (VND)','Ngày':'Date','Ghi chú':'Note',
  'Lưu giao dịch':'Save transaction','Chọn người vay':'Select a borrower','Tiền gốc (VNĐ)':'Principal (VND)',
  'Lãi suất / tháng (%)':'Monthly interest rate (%)','Ngày cho vay':'Loan date','Số tháng':'Months','Lưu khoản vay':'Save loan',
  'Danh mục giao dịch':'Transaction categories','Loại':'Type','Tên danh mục':'Category name','Thêm danh mục':'Add category',
  'Ngôn ngữ hiển thị':'Display language','Chọn ngôn ngữ bạn muốn sử dụng. Lựa chọn được lưu tự động trên trình duyệt này.':'Choose your preferred language. Your selection is saved automatically in this browser.',
  'Đang mở dữ liệu cá nhân của bạn…':'Loading your personal data…','Đăng nhập':'Log in','Đăng ký':'Register','Chào mừng trở lại':'Welcome back',
  'Tạo tài khoản mới':'Create a new account','Đăng nhập để tiếp tục quản lý tài chính.':'Log in to continue managing your finances.',
  'Thông tin được lưu an toàn trên trình duyệt này.':'Your information is stored in this browser.','Họ và tên':'Full name','Mật khẩu':'Password',
  'Tạo tài khoản':'Create account',
  'Quản lý chi tiêu, khoản cho vay và tiến độ trả nợ trong một nơi rõ ràng.':'Manage expenses, lending, and repayment progress in one clear place.',
  'GHI SỔ RÕ RÀNG':'CLEAR FINANCIAL RECORDS','Dư nợ cho vay':'Outstanding loans','Chi tiêu theo danh mục':'Spending by category',
  'Phân tích danh mục':'Category breakdown','Chưa có chi tiêu':'No expenses yet','Giao dịch gần đây':'Recent transactions','Số dư':'Balance',
  'Tất cả giao dịch':'All transactions','Xóa':'Delete','Chưa có giao dịch nào.':'No transactions yet.','Thêm người vay':'Add borrower',
  'Số điện thoại':'Phone number','Danh sách người vay':'Borrower list','Chưa có số':'No phone number','Chưa có người vay nào.':'No borrowers yet.',
  'Thêm mức lãi suất':'Add lending rate','Tên mức lãi suất':'Rate name','Ví dụ: Lãi chuẩn':'Example: Standard rate','Lãi suất (% / tháng)':'Interest (% / month)',
  'Tùy chọn':'Optional','Lưu mức lãi suất':'Save lending rate','Các mức lãi suất':'Lending rates','Chưa có mức lãi suất nào.':'No lending rates yet.',
  'Người vay đã xóa':'Deleted borrower','Gốc':'Principal','tháng':'months','Ngày vay':'Loan date','Cần thu':'Due','Đã trả':'Paid',
  'Ghi nhận trả nợ':'Record payment','Số tiền đã thu:':'Amount received:','Chưa có khoản vay nào. Hãy tạo người vay trước.':'No loans yet. Create a borrower first.',
  'Tính lãi đơn':'Simple interest calculator','Tiền gốc':'Principal','Kỳ hạn (tháng)':'Term (months)','Kết quả dự kiến':'Estimated result',
  'Tiền lãi':'Interest','Tổng cần thu':'Total due','Trung bình / tháng':'Monthly average','Kế hoạch tăng trưởng cá nhân':'Personal growth plan',
  'Dự tính giá trị tài sản khi lãi được tái đầu tư hàng tháng.':'Estimate asset value when interest is reinvested monthly.','Số tiền ban đầu':'Starting amount',
  'Lãi suất năm (%)':'Annual interest rate (%)','Thời gian (tháng)':'Duration (months)','Đóng thêm mỗi tháng':'Monthly contribution',
  'Dự kiến của bạn':'Your projection','Tổng đóng góp':'Total contributions','Giá trị tương lai':'Future value','Lợi nhuận tích lũy':'Accumulated return',
  'Ví dụ: Giáo dục':'Example: Education'
};
Object.assign(english, {
  'Breakdown danh mục':'Category breakdown','Thêm loaner':'Add borrower','Danh sách loaner':'Borrower list',
  'Chưa có loaner nào.':'No borrowers yet.','Thêm lending rate':'Add lending rate',
  'Lưu lending rate':'Save lending rate','Chưa có lending rate nào.':'No lending rates yet.',
  'Compound interest calculator':'Compound interest calculator','Simple interest calculator':'Simple interest calculator',
  'Sửa':'Edit','Chỉnh sửa thông tin':'Edit information','Đóng':'Close','Hủy':'Cancel','Lưu thay đổi':'Save changes',
  'Lãi suất mặc định (% / tháng)':'Default interest rate (% / month)','Đã trả (VNĐ)':'Paid (VND)',
  'Mức lãi suất đã thiết lập':'Saved interest rate','Chọn mức lãi suất':'Select a saved rate',
  'Nhập trực tiếp hoặc chọn một mức lãi suất đã thiết lập.':'Enter a custom value or select a saved interest rate.',
  'Chưa có mức lãi suất thiết lập sẵn. Bạn vẫn có thể nhập trực tiếp.':'No saved interest rates yet. You can still enter a custom rate.',
  'Chọn tất cả':'Select all','mục đã chọn':'selected','Đổi loại':'Change type','Áp dụng':'Apply',
  'Sửa đồng thời':'Bulk edit','Giữ nguyên':'Keep unchanged','Để trống trường không muốn thay đổi.':'Leave fields blank to keep their current values.',
  'Bạn muốn chỉnh sửa các mục đã chọn như thế nào?':'How would you like to edit the selected records?',
  'Sửa từng mục':'Edit one by one','Sửa nhiều mục':'Edit multiple records',
  'Mỗi mục sẽ mở lần lượt với đầy đủ thông tin riêng.':'Each record will open in sequence with all of its own information.',
  'Áp dụng cùng thay đổi cho tất cả mục đã chọn.':'Apply the same changes to every selected record.',
  'Đang sửa mục':'Editing record','trên':'of',
  'Xem chi tiết':'View details','Ẩn chi tiết':'Hide details','Bảng lãi và thanh toán theo tháng':'Monthly interest and payment schedule',
  'Thời gian':'Period','Gốc đầu kỳ':'Opening principal','Gốc kỳ này':'Principal this period','Lãi kỳ này':'Interest this period','Nợ kỳ trước':'Previous arrears','Tổng cần thanh toán':'Total payment due','Đã trả tháng này':'Paid this month','Trạng thái':'Status',
  'Chưa trả':'Unpaid','Trả một phần':'Partially paid','Đã trả':'Paid','Chưa nhập':'Not entered','Đóng chi tiết':'Close details',
  'Lãi chưa trả được cộng vào gốc kỳ sau. Khoản trả vượt tiền lãi sẽ tự động giảm gốc.':'Unpaid interest is added to the next period principal. Payments above interest automatically reduce principal.',
  'Cách tính lãi':'Interest method','Lãi đơn — không nhập lãi vào gốc':'Simple interest — interest is not added to principal','Lãi kép — lãi chưa trả nhập vào gốc':'Compound interest — unpaid interest is added to principal',
  'Lãi được tính cố định trên gốc ban đầu. Lãi chưa trả được theo dõi riêng và không cộng vào gốc.':'Interest is fixed on the original principal. Unpaid interest is tracked separately and is not added to principal.',
  'Xóa mục đã chọn':'Delete selected','Bạn có chắc muốn xóa các mục đã chọn?':'Are you sure you want to delete the selected items?',
  'Kỳ báo cáo':'Reporting period','Theo tháng':'Monthly','Theo năm':'Yearly','Chọn tháng':'Select month','Chọn năm':'Select year',
  'Giao dịch trong kỳ':'Transactions in period','Không có giao dịch trong kỳ này.':'No transactions in this period.',
  'Dư đầu kỳ':'Opening carryover','Số dư cuối kỳ':'Closing balance',
  'Phân loại giao dịch':'Organize transactions',
  'Tỷ trọng chi tiêu theo danh mục':'Expense share by category','So sánh chi tiêu theo danh mục':'Expense comparison by category'
  ,'Chia chi phí':'Split expenses','Người tham gia':'Participants','Các khoản đã thanh toán':'Payments made',
  'Cách chia chi phí':'How to split','Chia đều':'Split equally','Chia theo số tiền cụ thể':'Use custom amounts',
  'Thêm người':'Add person','Thêm khoản chi':'Add expense','Nội dung khoản chi':'Expense description','Người thanh toán':'Paid by',
  'Số tiền phải chịu':'Amount owed','Kết quả đối soát':'Settlement results','Phải chịu':'Owes','Nhận lại':'Gets back',
  'Cần trả':'Needs to pay','Chuyển tiền tới':'Who pays whom','Tổng chi phí':'Total expenses','người đã thanh toán':'people paid',
  'Nhập đầy đủ tên người tham gia và ít nhất một khoản chi hợp lệ.':'Enter every participant name and at least one valid expense.',
  'Tổng số tiền phân bổ phải bằng tổng chi phí.':'Allocated amounts must equal total expenses.',
  'Mọi khoản đã cân bằng.':'Everything is settled.','chuyển cho':'pays','Xóa người':'Remove person','Xóa khoản chi':'Remove expense',
  'Ghi lại ai đã thanh toán, chọn cách chia và xem chính xác ai cần chuyển tiền cho ai.':'Record who paid, choose a split method, and see exactly who should pay whom.',
  'Tối thiểu 2 người trong một lần chia.':'Add at least two people.','Tên người':'Name',
  'Thêm từng giao dịch và chọn người đã ứng tiền; một hoặc nhiều người đều được.':'Add each transaction and select who paid; one or multiple payers are supported.',
  'Ví dụ: Tiền đồ ăn':'Example: Food order','Chưa đặt tên':'Unnamed',
  'Chọn chia đều hoặc nhập chính xác phần chi phí của từng người.':'Split equally or enter the exact amount owed by each person.',
  'Mỗi người chịu phần bằng nhau.':'Everyone owes an equal share.','Phù hợp khi mỗi người dùng khác nhau.':'Best when people used different amounts.',
  'Các giao dịch được gộp theo số dư cuối để tránh hoàn tiền riêng cho từng khoản.':'Transactions are netted by final balance instead of reimbursing every expense separately.',
  'Tên người tham gia phải đầy đủ và không trùng nhau.':'Participant names are required and must be unique.',
  'Nhập đầy đủ nội dung, số tiền và người thanh toán cho từng khoản chi.':'Enter a description, amount, and payer for every expense.',
  'Quản lý người dùng':'User management','Tạo tài khoản người dùng':'Create user account','Danh sách tài khoản':'User accounts',
  'Tên hiển thị':'Display name','Mật khẩu mới':'New password','Để trống để giữ nguyên mật khẩu.':'Leave blank to keep the current password.',
  'Tạo người dùng':'Create user','Cập nhật tài khoản':'Update account','Tài khoản quản trị':'Administrator account',
  'Tài khoản thường':'Standard account','Lưu tài khoản':'Save account','Xóa tài khoản':'Delete account',
  'Quản lý này chỉ áp dụng cho dữ liệu tài khoản được lưu trên trình duyệt hiện tại.':'This management applies only to accounts stored in the current browser.',
  'Email này đã được sử dụng.':'This email is already in use.','Mật khẩu phải có ít nhất 6 ký tự.':'Password must contain at least 6 characters.',
  'Không thể xóa tài khoản quản trị.':'The administrator account cannot be deleted.','Đã cập nhật tài khoản.':'Account updated.',
  'Đã tạo tài khoản.':'Account created.','Đã xóa tài khoản.':'Account deleted.'
  ,'Không thể thay đổi email tài khoản quản trị.':'The administrator email cannot be changed.',
  'Vui lòng nhập đầy đủ tên và email.':'Enter both a name and email.','tài khoản trên trình duyệt này':'accounts in this browser',
  'Có thể nhập phép tính: +, -, *, / và dấu ngoặc.':'You can enter calculations using +, -, *, /, and parentheses.',
  'Kết quả':'Result','Biểu thức chưa hợp lệ hoặc kết quả phải lớn hơn 0.':'The expression is invalid or its result is not greater than zero.',
  'Chưa có danh mục cho loại giao dịch này.':'No categories exist for this transaction type.'
});
const translate = (language: LanguageCode, text: string) => language === 'en' ? (english[text] || text) : text;
const vietnamese = Object.fromEntries(Object.entries(english).map(([vi, en]) => [en, vi]));
Object.assign(vietnamese, {
  Dashboard:'Bảng điều khiển', Setting:'Cài đặt', Category:'Danh mục', Loaner:'Người vay',
  'Lending rate':'Mức lãi suất', 'Manage language':'Quản lý ngôn ngữ', FINANCIALS:'TÀI CHÍNH',
  MANAGE:'QUẢN LÝ', Transactions:'Giao dịch', 'Loan Book':'Sổ vay nợ',
  'Interest calculator':'Công cụ tính lãi', 'Compound Interest':'Lãi kép', 'Simple interest':'Lãi đơn',
  'Dark theme':'Giao diện tối', 'Light theme':'Giao diện sáng',
  'Choose the preferred language for this browser. The selection is saved automatically.':'Chọn ngôn ngữ bạn muốn sử dụng. Lựa chọn được lưu tự động trên trình duyệt này.',
  'Display language':'Ngôn ngữ hiển thị','Category breakdown':'Phân tích danh mục',
  'Add borrower':'Thêm người vay','Borrower list':'Danh sách người vay','No borrowers yet.':'Chưa có người vay nào.',
  'Add lending rate':'Thêm mức lãi suất','Save lending rate':'Lưu mức lãi suất','No lending rates yet.':'Chưa có mức lãi suất nào.'
});
function localizeUi(language: LanguageCode) {
  const translations = language === 'en' ? english : vietnamese;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const phrases = Object.keys(translations).sort((a, b) => b.length - a.length);
  nodes.forEach(node => {
    const element=node.parentElement;
    if(element?.matches('.transaction b,.transaction small,.item b,.item small,.loan b,.loan small,.category span,.legend span,.bar span')) return;
    const original = node.nodeValue || '';
    const localized = phrases.reduce((value, phrase) => value.split(phrase).join(translations[phrase]), original);
    if (localized !== original) node.nodeValue = localized;
  });
}

export default function FinanceApp() {
  const stored = load();
  const storedOwner=stored?.user?.email;
  const storedFinance=stored?.dataByUser?.[storedOwner]||stored;
  const [user, setUser] = useState<User | null>(stored?.user || null);
  const [users, setUsers] = useState<User[]>(stored?.users || [defaultAdmin]);
  const [txns, setTxns] = useState<Txn[]>(storedFinance?.txns || initialTxns);
  const [transactionViewMonth,setTransactionViewMonth]=useState(()=>{const records:Txn[]=storedFinance?.txns||initialTxns;const latest=records.reduce((value,txn)=>/^\d{4}-\d{2}-\d{2}$/.test(txn.date)&&txn.date>value?txn.date:value,'');return (latest||new Date().toISOString().slice(0,10)).slice(0,7);});
  const [borrowers, setBorrowers] = useState<Borrower[]>(storedFinance?.borrowers || []);
  const [rates, setRates] = useState<LendingRate[]>(storedFinance?.rates || []);
  const [loans, setLoans] = useState<Loan[]>(storedFinance?.loans || []);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [auth, setAuth] = useState<'login'|'register'>('login');
  const [notice, setNotice] = useState('');
  const [showTxn, setShowTxn] = useState(false);
  const [showLoan, setShowLoan] = useState(false);
  const [theme, setTheme] = useState<'light'|'dark'>(stored?.theme || 'light');
  const [language, setLanguage] = useState<LanguageCode>(stored?.language === 'en' ? 'en' : 'vi');
  const t = (text:string) => translate(language, text);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [serverReady,setServerReady]=useState(!serverApiEnabled);
  const googleButtonRef=useRef<HTMLDivElement>(null);
  const persist = (next: Partial<{user:User|null;users:User[];txns:Txn[];borrowers:Borrower[];rates:LendingRate[];loans:Loan[];theme:'light'|'dark';language:string;categories:CategoryGroups}>) => {
    const current=load()||{};const categories=next.categories||current.categories||defaultCategories;
    const owner=user?.email||next.user?.email;
    const finance={txns:next.txns||txns,borrowers:next.borrowers||borrowers,rates:next.rates||rates,loans:next.loans||loans,categories};
    const dataByUser=owner?{...(current.dataByUser||{}),[owner]:finance}:(current.dataByUser||{});
    save({user,users,txns,borrowers,rates,loans,theme,language,categories,...next,dataByUser});
  };
  const updateTxns = (v:Txn[]) => { setTxns(v); persist({txns:v}); };
  const updateBorrowers = (v:Borrower[]) => { setBorrowers(v); persist({borrowers:v}); };
  const updateRates = (v:LendingRate[]) => { setRates(v); persist({rates:v}); };
  const updateLoans = (v:Loan[]) => { setLoans(v); persist({loans:v}); };
  const createManagedUser = async (nextUser:User) => {
    if(users.some(existing=>sameEmail(existing.email,nextUser.email)))return 'Email này đã được sử dụng.';
    const credential=await createPasswordCredential(nextUser.password||'');const safeUser:User={name:nextUser.name,email:nextUser.email,...credential};
    const nextUsers=[...users,safeUser];setUsers(nextUsers);const current=load()||{};
    const emptyFinance={txns:[],borrowers:[],rates:[],loans:[],categories:defaultCategories};
    save({...current,users:nextUsers,dataByUser:{...(current.dataByUser||{}),[safeUser.email]:emptyFinance}});return '';
  };
  const updateManagedUser = async (originalEmail:string,nextUser:User) => {
    if(sameEmail(originalEmail,adminEmail)&&!sameEmail(nextUser.email,adminEmail))return 'Không thể thay đổi email tài khoản quản trị.';
    if(users.some(existing=>!sameEmail(existing.email,originalEmail)&&sameEmail(existing.email,nextUser.email)))return 'Email này đã được sử dụng.';
    const original=users.find(existing=>sameEmail(existing.email,originalEmail));if(!original)return 'Không tìm thấy tài khoản.';
    const credential=nextUser.password?await createPasswordCredential(nextUser.password):{passwordHash:original.passwordHash,passwordSalt:original.passwordSalt};
    const safeUser:User={name:nextUser.name,email:nextUser.email,...credential};
    const nextUsers=users.map(existing=>sameEmail(existing.email,originalEmail)?safeUser:existing);setUsers(nextUsers);
    const current=load()||{};const dataByUser={...(current.dataByUser||{})};
    if(originalEmail!==safeUser.email&&dataByUser[originalEmail]){dataByUser[safeUser.email]=dataByUser[originalEmail];delete dataByUser[originalEmail];}
    const activeUser=user&&sameEmail(user.email,originalEmail)?safeUser:user;if(activeUser!==user)setUser(safeUser);
    save({...current,user:activeUser,users:nextUsers,dataByUser});return '';
  };
  const deleteManagedUser = (email:string) => {
    if(sameEmail(email,adminEmail))return 'Không thể xóa tài khoản quản trị.';
    const nextUsers=users.filter(existing=>existing.email!==email);setUsers(nextUsers);
    const current=load()||{};const dataByUser={...(current.dataByUser||{})};delete dataByUser[email];save({...current,users:nextUsers,dataByUser});return '';
  };
  const total = useMemo(() => ({ income:txns.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0), expense:txns.filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0), saving:txns.filter(x=>x.type==='saving').reduce((s,x)=>s+x.amount,0) }),[txns]);
  const balance = total.income-total.expense-total.saving;
  const expenseGroups = useMemo(() => Object.entries(txns.filter(x=>x.type==='expense').reduce<Record<string,number>>((a,x)=>{a[x.category]=(a[x.category]||0)+x.amount;return a;},{})) as [string, number][],[txns]);
  const outstanding = loans.reduce((sum,loan)=>sum+remainingLoanBalance(loan),0);

  useEffect(() => {
    document.documentElement.lang=language;
    document.title=t('Sổ Tài Chính');
    localizeUi(language);
  });
  useEffect(() => {
    const editRecord = (event:Event) => {
      const {kind,item}=(event as CustomEvent).detail;
      if(kind==='transaction') updateTxns(txns.map(record=>record.id===item.id?item:record));
      if(kind==='borrower') updateBorrowers(borrowers.map(record=>record.id===item.id?item:record));
      if(kind==='rate') updateRates(rates.map(record=>record.id===item.id?item:record));
      if(kind==='loan') updateLoans(loans.map(record=>record.id===item.id?item:record));
      if(kind==='category') updateTxns(renameCategoryInTransactions(txns,item.kind,item.value,item.nextKind,item.nextValue));
      if(kind==='bulkTransaction') updateTxns(txns.map(record=>item.ids.includes(record.id)?{...record,...item.patch}:record));
      if(kind==='bulkBorrower') updateBorrowers(borrowers.map(record=>item.ids.includes(record.id)?{...record,...item.patch}:record));
      if(kind==='bulkRate') updateRates(rates.map(record=>item.ids.includes(record.id)?{...record,...item.patch}:record));
      if(kind==='bulkLoan') updateLoans(loans.map(record=>item.ids.includes(record.id)?{...record,...item.patch}:record));
      if(kind==='deleteTransactions') updateTxns(txns.filter(record=>!item.ids.includes(record.id)));
      if(kind==='deleteBorrowers') updateBorrowers(borrowers.filter(record=>!item.ids.includes(record.id)));
      if(kind==='deleteRates') updateRates(rates.filter(record=>!item.ids.includes(record.id)));
      if(kind==='deleteLoans') updateLoans(loans.filter(record=>!item.ids.includes(record.id)));
    };
    window.addEventListener(editEvent,editRecord);
    return ()=>window.removeEventListener(editEvent,editRecord);
  },[txns,borrowers,rates,loans]);
  useEffect(() => {
    let active = true;
    readAppState().then(async (databaseState:any) => {
      if (!active) return;
      if (!databaseState) {
        const legacyState=load();
        if (legacyState) {
          const upgradedUsers=await Promise.all((legacyState.users||[defaultAdmin]).map(upgradeUserCredential));
          const safeState={...legacyState,user:legacyState.user?await upgradeUserCredential(legacyState.user):null,users:upgradedUsers};
          localStorage.setItem(key,JSON.stringify(safeState));await writeAppState(safeState);
          if(active){setUser(safeState.user);setUsers(upgradedUsers);}
        }
        return;
      }
      databaseState=migrateAdminAccount(databaseState);
      setUser(databaseState.user || null);
      const upgradedUsers=await Promise.all((databaseState.users||[defaultAdmin]).map(upgradeUserCredential));
      databaseState={...databaseState,user:databaseState.user?await upgradeUserCredential(databaseState.user):null,users:upgradedUsers};
      setUsers(upgradedUsers);
      setTxns(databaseState.txns || initialTxns);
      setBorrowers(databaseState.borrowers || []);
      setRates(databaseState.rates || []);
      setLoans(databaseState.loans || []);
      setTheme(databaseState.theme || 'light');
      setLanguage(databaseState.language || 'vi');
      localStorage.setItem(key,JSON.stringify(databaseState));
      void writeAppState(databaseState);
    }).catch(() => undefined).finally(() => {
      if (active) setDatabaseReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(()=>{
    if(!serverApiEnabled||!databaseReady)return;
    let active=true;
    getServerSession().then(async result=>{
      if(!active||!result.user)return;
      const response=await readServerState();if(!active)return;
      const remote=response.state;const current=load()||{};const cached=current.dataByUser?.[result.user.email];const source=hasFinanceState(remote)?remote:(cached||{});const finance={txns:source.txns||[],borrowers:source.borrowers||[],rates:source.rates||[],loans:source.loans||[],categories:source.categories||defaultCategories};
      setUser(result.user);setTxns(finance.txns);setBorrowers(finance.borrowers);setRates(finance.rates);setLoans(finance.loans);
      if(remote.theme)setTheme(remote.theme);if(remote.language)setLanguage(remote.language);
      save({...current,user:result.user,...finance,theme:remote.theme||theme,language:remote.language||language,dataByUser:{...(current.dataByUser||{}),[result.user.email]:finance}});
    }).catch(()=>undefined).finally(()=>{if(active)setServerReady(true);});
    return()=>{active=false;};
  },[databaseReady]);

  function activateUser(nextUser:User,nextUsers=users,isNew=false){
    const current=load()||{};
    const finance=selectFinanceData(current,nextUser.email,initialTxns,defaultCategories,isNew);
    setUser(nextUser);setUsers(nextUsers);setTxns(finance.txns);setBorrowers(finance.borrowers);setRates(finance.rates);setLoans(finance.loans);
    save({...current,user:nextUser,users:nextUsers,...finance,dataByUser:{...(current.dataByUser||{}),[nextUser.email]:finance}});
  }
  async function authenticate(e:FormEvent<HTMLFormElement>) { e.preventDefault(); const f=new FormData(e.currentTarget); const email=String(f.get('email')).trim().toLowerCase(), password=String(f.get('password')), name=String(f.get('name')).trim();
    if(serverApiEnabled){try{if(auth==='register'&&(!name||password.length<8))return setNotice('Vui lòng nhập họ tên và mật khẩu ít nhất 8 ký tự.');const result=auth==='register'?await serverRegister(name,email,password):await serverLogin(email,password);const response=await readServerState();const remote=response.state;const current=load()||{};const cached=current.dataByUser?.[result.user.email];const source=hasFinanceState(remote)?remote:(auth==='login'?cached:null)||{};const finance={txns:source.txns||[],borrowers:source.borrowers||[],rates:source.rates||[],loans:source.loans||[],categories:source.categories||defaultCategories};const localUsers=users.some(item=>sameEmail(item.email,result.user.email))?users:[...users,result.user];setUser(result.user);setUsers(localUsers);setTxns(finance.txns);setBorrowers(finance.borrowers);setRates(finance.rates);setLoans(finance.loans);if(remote.theme)setTheme(remote.theme);if(remote.language)setLanguage(remote.language);save({...current,user:result.user,users:localUsers,...finance,theme:remote.theme||theme,language:remote.language||language,dataByUser:{...(current.dataByUser||{}),[result.user.email]:finance}});setNotice('');return;}catch(error){return setNotice(error instanceof Error?error.message:'Không thể kết nối máy chủ.');}}
    if(auth==='register'){ if(!name || password.length<6) return setNotice('Vui lòng nhập họ tên và mật khẩu ít nhất 6 ký tự.'); if(users.some(x=>sameEmail(x.email,email))) return setNotice('Email này đã được đăng ký.'); const credential=await createPasswordCredential(password),u:User={name,email,...credential},nextUsers=[...users,u];activateUser(u,nextUsers,true); } else { const found=users.find(x=>sameEmail(x.email,email));if(!found||!(await verifyPassword(found,password)))return setNotice('Email hoặc mật khẩu chưa đúng.');const safeUser=await upgradeUserCredential(found),nextUsers=users.map(account=>sameEmail(account.email,safeUser.email)?safeUser:account);activateUser(safeUser,nextUsers); } setNotice(''); }
  async function authenticateWithGoogle(credential:string) {
    try {
      const result=await serverGoogleLogin(credential);const response=await readServerState();const remote=response.state;const current=load()||{};const cached=current.dataByUser?.[result.user.email];const source=hasFinanceState(remote)?remote:cached||{};const finance={txns:source.txns||[],borrowers:source.borrowers||[],rates:source.rates||[],loans:source.loans||[],categories:source.categories||defaultCategories};const localUsers=users.some(item=>sameEmail(item.email,result.user.email))?users:[...users,result.user];setUser(result.user);setUsers(localUsers);setTxns(finance.txns);setBorrowers(finance.borrowers);setRates(finance.rates);setLoans(finance.loans);if(remote.theme)setTheme(remote.theme);if(remote.language)setLanguage(remote.language);save({...current,user:result.user,users:localUsers,...finance,theme:remote.theme||theme,language:remote.language||language,dataByUser:{...(current.dataByUser||{}),[result.user.email]:finance}});setNotice('');
    } catch(error) { setNotice(error instanceof Error?error.message:'Không thể đăng nhập bằng Google.'); }
  }
  useEffect(() => {
    if(user || !googleLoginEnabled || !googleButtonRef.current)return;
    const render=()=>{const google=(window as any).google;if(!google||!googleButtonRef.current)return;google.accounts.id.initialize({client_id:googleClientId,callback:(response:{credential?:string})=>{if(response.credential)void authenticateWithGoogle(response.credential);else setNotice('Google không trả về thông tin đăng nhập.');}});google.accounts.id.renderButton(googleButtonRef.current,{theme:'outline',size:'large',text:'continue_with',width:360,locale:language==='vi'?'vi':'en'});};
    const existing=document.querySelector<HTMLScriptElement>('script[data-google-identity]');if(existing){if((window as any).google)render();else existing.addEventListener('load',render,{once:true});return;}
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;script.dataset.googleIdentity='true';script.addEventListener('load',render,{once:true});document.head.appendChild(script);
  },[user,language]);
  function logout(){ if(serverApiEnabled)void serverLogout().catch(()=>undefined);setUser(null);persist({user:null});setTab('dashboard'); }
  function addTxn(e:FormEvent<HTMLFormElement>){ e.preventDefault(); const f=new FormData(e.currentTarget); const type=f.get('type') as Txn['type']; const t:Txn={id:id(),type,category:String(f.get('category')),amount:Number(f.get('amount')),date:String(f.get('date')),note:String(f.get('note'))}; if(!t.amount||!t.date) return; updateTxns([t,...txns]); setShowTxn(false); }
  function addBorrower(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget); const b={id:id(),name:String(f.get('name')),phone:String(f.get('phone')),rate:Number(f.get('rate')||0)}; if(!b.name)return;updateBorrowers([...borrowers,b]);e.currentTarget.reset();}
  function addRate(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const rate={id:id(),name:String(f.get('name')),percent:Number(f.get('percent')),note:String(f.get('note'))};if(!rate.name||rate.percent<0)return;updateRates([...rates,rate]);e.currentTarget.reset();}
  function addLoan(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const l:Loan={id:id(),borrowerId:String(f.get('borrower')),principal:Number(f.get('principal')),rate:Number(f.get('rate')),interestMethod:String(f.get('interestMethod'))==='compound'?'compound':'simple',startDate:String(f.get('date')),months:Number(f.get('months')),paid:0,note:String(f.get('note'))};if(!l.borrowerId||!l.principal)return;updateLoans([l,...loans]);setShowLoan(false);}

  if(!databaseReady||!serverReady) return <><style>{css}</style><div className="database-loading">{t('Đang mở dữ liệu cá nhân của bạn…')}</div></>;
  if(!user) return <><style>{css}</style><div className={'theme-'+theme}><div className="auth-wrap"><div className="auth-shell"><aside className="auth-side"><div><div className="seal">ST</div><h1>Sổ Tài Chính</h1><p>Quản lý chi tiêu, khoản cho vay và tiến độ trả nợ trong một nơi rõ ràng.</p></div><span>GHI SỔ RÕ RÀNG</span></aside><main className="auth-main"><div className="auth-tabs"><button className={auth==='login'?'active':''} onClick={()=>setAuth('login')}>Đăng nhập</button><button className={auth==='register'?'active':''} onClick={()=>setAuth('register')}>Đăng ký</button></div><h2>{auth==='login'?'Chào mừng trở lại':'Tạo tài khoản mới'}</h2><p className="muted">{auth==='login'?'Đăng nhập để tiếp tục quản lý tài chính.':'Thông tin được lưu an toàn trên trình duyệt này.'}</p><form onSubmit={authenticate}>{auth==='register'&&<Field label="Họ và tên" name="name" required/>}<Field label="Email" name="email" type="email" required/><Field label="Mật khẩu" name="password" type="password" required/><button className="btn primary wide">{auth==='login'?'Đăng nhập':'Tạo tài khoản'}</button></form>{auth==='login'&&googleLoginEnabled&&<><div style={{margin:'18px 0 12px',textAlign:'center',color:'var(--muted)',fontSize:12}}>hoặc</div><div ref={googleButtonRef}/></>}{notice&&<div className="alert">{notice}</div>}</main></div></div></div></>;
  const titles:Record<Tab,string>={dashboard:t('Bảng điều khiển'),transactions:t('Giao dịch'),borrowers:t('Người vay'),rates:t('Mức lãi suất'),loans:t('Sổ vay nợ'),calculator:t('Tính lãi đơn'),compound:t('Lãi kép'),split:t('Chia chi phí'),categories:t('Danh mục'),language:t('Quản lý ngôn ngữ'),admin:t('Quản lý người dùng')};
  const toggleTheme=()=>{const next=theme==='light'?'dark':'light';setTheme(next);persist({theme:next});};
  return <><style>{css}</style><div className={'theme-'+theme}><div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">ST</div><div><b>Sổ Tài Chính</b><small>CHI TIÊU & CHO VAY</small></div></div><div className="nav-label">MANAGE</div><button className={'nav '+(tab==='dashboard'?'active':'')} onClick={()=>setTab('dashboard')}><i>▦</i>Dashboard</button><div className="nav-parent">⚙ Setting</div><button className={'nav subnav '+(tab==='categories'?'active':'')} onClick={()=>setTab('categories')}><i>◇</i>Category</button><button className={'nav subnav '+(tab==='borrowers'?'active':'')} onClick={()=>setTab('borrowers')}><i>♙</i>Loaner</button><button className={'nav subnav '+(tab==='rates'?'active':'')} onClick={()=>setTab('rates')}><i>%</i>Lending rate</button><button className={'nav subnav '+(tab==='language'?'active':'')} onClick={()=>setTab('language')}><i>◎</i>Manage language</button>{sameEmail(user.email,adminEmail)&&<button className={'nav subnav admin-nav '+(tab==='admin'?'active':'')} onClick={()=>setTab('admin')}><i>♙</i>Quản lý người dùng</button>}<div className="nav-label financial-label">FINANCIALS</div><button className={'nav '+(tab==='transactions'?'active':'')} onClick={()=>setTab('transactions')}><i>≡</i>Transactions</button><button className={'nav '+(tab==='loans'?'active':'')} onClick={()=>setTab('loans')}><i>▤</i>Loan Book</button><div className="nav-parent">⌗ Interest calculator</div><button className={'nav subnav '+(tab==='compound'?'active':'')} onClick={()=>setTab('compound')}><i>↗</i>Compound Interest</button><button className={'nav subnav '+(tab==='calculator'?'active':'')} onClick={()=>setTab('calculator')}><i>⌗</i>Simple interest</button><button className={'nav subnav '+(tab==='split'?'active':'')} onClick={()=>setTab('split')}><i>÷</i>Chia chi phí</button><div className="sidebar-foot"><div>Xin chào,<br/><b>{user.name}</b></div><button className="nav theme-toggle" onClick={toggleTheme}><i>{theme==='light'?'☾':'☀'}</i>{theme==='light'?'Dark theme':'Light theme'}</button><button className="nav logout" onClick={logout}><i>↩</i>Đăng xuất</button></div></aside><main className="main"><header className="topbar"><h2>{titles[tab]}</h2><div className="topbar-actions"><button className="btn theme-button" onClick={toggleTheme}>{theme==='light'?'☾ Dark':'☀ Light'}</button>{(tab==='dashboard'||tab==='transactions')&&<button className="btn primary" onClick={()=>setShowTxn(true)}>＋ Thêm giao dịch</button>}{tab==='loans'&&<button className="btn primary" onClick={()=>setShowLoan(true)}>＋ Thêm khoản vay</button>}</div></header><section className="content">{tab==='dashboard'&&<Dashboard total={total} balance={balance} groups={expenseGroups} txns={txns} outstanding={outstanding}/>} {tab==='transactions'&&<Transactions txns={txns} remove={(x)=>updateTxns(txns.filter(t=>t.id!==x))} selectedMonth={transactionViewMonth} setSelectedMonth={setTransactionViewMonth}/>} {tab==='borrowers'&&<Borrowers borrowers={borrowers} onAdd={addBorrower} onRemove={(x)=>updateBorrowers(borrowers.filter(b=>b.id!==x))}/>} {tab==='rates'&&<LendingRates rates={rates} onAdd={addRate} onRemove={(id:string)=>updateRates(rates.filter(rate=>rate.id!==id))}/>} {tab==='loans'&&<Loans loans={loans} borrowers={borrowers} onPayment={(id,p)=>updateLoans(loans.map(l=>l.id===id?{...l,paid:l.paid+p}:l))}/>} {tab==='calculator'&&<Calculator/>} {tab==='compound'&&<CompoundCalculator/>} {tab==='split'&&<ExpenseSplitter/>} {tab==='categories'&&<Categories/>} {tab==='language'&&<Language value={language} onChange={(value:string)=>{setLanguage(value);persist({language:value});}}/>} {tab==='admin'&&sameEmail(user.email,adminEmail)&&<AdminUsers users={users} onCreate={createManagedUser} onUpdate={updateManagedUser} onDelete={deleteManagedUser}/>} </section></main></div>{showTxn&&<Modal title="Thêm giao dịch" close={()=>setShowTxn(false)}><AddTransactionForm onSubmit={addTxn} defaultDate={tab==='transactions'?currentDayInMonth(transactionViewMonth):undefined}/></Modal>}{showLoan&&<Modal title="Thêm khoản vay" close={()=>setShowLoan(false)}><AddLoanForm borrowers={borrowers} onSubmit={addLoan}/></Modal>}</div></>;
}

function AddTransactionForm({onSubmit,defaultDate}:any){
  const groups:CategoryGroups=load()?.categories||defaultCategories;const [type,setType]=useState<Txn['type']>('expense');
  const [category,setCategory]=useState(groups.expense[0]||'');const [expression,setExpression]=useState('');
  const amount=useMemo(()=>parseAmountExpression(expression),[expression]);const amountValid=amount!==null&&amount>0;const options=groups[type]||[];
  const changeType=(next:Txn['type'])=>{setType(next);setCategory(groups[next]?.[0]||'');};
  return <form onSubmit={onSubmit}><label>Loại giao dịch<select name="type" value={type} onChange={event=>changeType(event.target.value as Txn['type'])}><option value="expense">Chi tiêu</option><option value="income">Thu nhập</option><option value="saving">Tiết kiệm</option></select></label><label>Danh mục<select name="category" value={category} onChange={event=>setCategory(event.target.value)} required disabled={!options.length}>{options.length?options.map(option=><option value={option} key={option}>{option}</option>):<option value="">Chưa có danh mục cho loại giao dịch này.</option>}</select></label><label>Số tiền (VNĐ)<input className="input amount-expression-input" inputMode="decimal" value={expression} onChange={event=>setExpression(event.target.value)} placeholder="Ví dụ: 100000 + 25000 * 2" aria-invalid={Boolean(expression)&&!amountValid} aria-describedby="transaction-amount-help"/><input type="hidden" name="amount" value={amountValid?amount:''}/></label><p className={'amount-expression-help '+(expression&&!amountValid?'is-error':'')} id="transaction-amount-help">{expression?(amountValid?`Kết quả: ${money(amount)}`:'Biểu thức chưa hợp lệ hoặc kết quả phải lớn hơn 0.'):'Có thể nhập phép tính: +, -, *, / và dấu ngoặc.'}</p><Field label="Ngày" name="date" type="date" defaultValue={defaultDate} required/><Field label="Ghi chú" name="note"/><button className="btn primary" disabled={!amountValid||!category}>Lưu giao dịch</button></form>;
}
function Field(p:any){if(p.type==='date')return <DateField {...p}/>;const options=p.name==='category'?Object.values(load()?.categories || defaultCategories).flat():[];return <label>{p.label}<input className="input" {...p} list={options.length?'category-options':undefined}/>{options.length>0&&<datalist id="category-options">{options.map((option:string)=><option value={option} key={option}/>)}</datalist>}</label>}
function RatePicker({defaultValue='',label='Lãi suất mặc định (% / tháng)',required=false}:any){
  const [value,setValue]=useState(defaultValue===''?'':String(Number(defaultValue)));
  const rates:LendingRate[]=load()?.rates||[];
  const fieldId=`saved-rates-${useId().replace(/:/g,'')}`;const matched=rates.find(rate=>Number(rate.percent)===Number(value));const [selected,setSelected]=useState(matched?.id||'');
  useEffect(()=>{const next=defaultValue===''?'':String(Number(defaultValue));setValue(next);setSelected(rates.find(rate=>next!==''&&Number(rate.percent)===Number(next))?.id||'');},[defaultValue]);
  const choose=(rateId:string)=>{setSelected(rateId);const rate=rates.find(item=>item.id===rateId);if(rate)setValue(String(rate.percent));};
  return <div className="rate-picker"><label>{label}<div className="rate-picker-grid"><select value={selected} onChange={event=>choose(event.target.value)} aria-label="Chọn mức lãi suất đã thiết lập"><option value="">Lãi suất tùy chỉnh</option>{rates.map(rate=><option key={rate.id} value={rate.id}>{rate.name} — {rate.percent}% / tháng</option>)}</select><input className="input rate-combobox" name="rate" type="number" min="0" step="0.1" value={value} required={required} onChange={event=>{setValue(event.target.value);setSelected('');}} aria-label="Giá trị lãi suất phần trăm mỗi tháng" aria-describedby={`${fieldId}-help`}/></div></label><p className="field-help" id={`${fieldId}-help`}>{rates.length?'Chọn mức đã thiết lập hoặc nhập một giá trị tùy chỉnh.':'Chưa có mức lãi suất thiết lập sẵn. Bạn vẫn có thể nhập trực tiếp.'}</p></div>;
}
function InterestMethodField({defaultValue='simple',allowBlank=false}:any){return <label>Cách tính lãi<select name="interestMethod" defaultValue={defaultValue} required={!allowBlank}>{allowBlank&&<option value="">Giữ nguyên</option>}<option value="simple">Lãi đơn — không nhập lãi vào gốc</option><option value="compound">Lãi kép — lãi chưa trả nhập vào gốc</option></select></label>}
function AddLoanForm({borrowers,onSubmit}:any){const [borrowerId,setBorrowerId]=useState(borrowers[0]?.id||'');return <form onSubmit={onSubmit}><label>Người vay<select name="borrower" value={borrowerId} onChange={event=>setBorrowerId(event.target.value)}><option value="">Chọn người vay</option>{borrowers.map((item:Borrower)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><Field label="Tiền gốc (VNĐ)" name="principal" type="number" required/><RatePicker label="Lãi suất / tháng (%)" defaultValue={borrowerDefaultRate(borrowers,borrowerId)} required/><InterestMethodField/><Field label="Ngày cho vay" name="date" type="date" required/><Field label="Số tháng" name="months" type="number" defaultValue="1" required/><Field label="Ghi chú" name="note"/><button className="btn primary">Lưu khoản vay</button></form>}
function Modal({title,close,children}:any){return <div className="overlay"><div className="modal"><button className="close" onClick={close}>×</button><h3>{title}</h3>{children}</div></div>}
function editTransaction(record:Txn){openEditor('transaction',record);}
function editBorrower(record:Borrower){openEditor('borrower',record);}
function editRate(record:LendingRate){openEditor('rate',record);}
function editLoan(record:Loan,borrowers:Borrower[]){openEditor('loan',record,borrowers);}
type EditableCategory={kind:Txn['type'];value:string};
type EditSequence={kind:string;items:any[];index:number;borrowers:Borrower[]};
type EditTarget={kind:string;item:any;borrowers:Borrower[];bulkMode?:'choice'|'multiple';sequence?:EditSequence};
export function EditRecordModal(){
  const [target,setTarget]=useState<EditTarget|null>(null);
  useEffect(()=>{const open=(event:Event)=>setTarget((event as CustomEvent).detail);window.addEventListener(openEditEvent,open);return()=>window.removeEventListener(openEditEvent,open);},[]);
  const preferences=load();
  const modalLanguage:LanguageCode=preferences?.language==='en'?'en':'vi';
  useEffect(()=>{if(target)localizeUi(modalLanguage);},[target,modalLanguage]);
  if(!target)return null;
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const form=new FormData(event.currentTarget);const original=target.item;
    if(target.kind==='transaction')requestEdit('transaction',{...original,type:String(form.get('type')) as Txn['type'],category:String(form.get('category')).trim(),amount:Number(form.get('amount')),date:String(form.get('date')),note:String(form.get('note'))});
    if(target.kind==='borrower')requestEdit('borrower',{...original,name:String(form.get('name')).trim(),phone:String(form.get('phone')).trim(),rate:Number(form.get('rate'))});
    if(target.kind==='rate')requestEdit('rate',{...original,name:String(form.get('name')).trim(),percent:Number(form.get('percent')),note:String(form.get('note'))});
    if(target.kind==='loan')requestEdit('loan',{...original,borrowerId:String(form.get('borrowerId')),principal:Number(form.get('principal')),rate:Number(form.get('rate')),interestMethod:String(form.get('interestMethod'))==='compound'?'compound':'simple',startDate:String(form.get('startDate')),months:Number(form.get('months')),paid:Number(form.get('paid')),note:String(form.get('note'))});
    if(target.kind==='category')requestEdit('category',{...original,nextKind:String(form.get('kind')),nextValue:String(form.get('value')).trim()});
    if(target.kind==='bulkTransaction'){const patch:any={};if(form.get('type'))patch.type=String(form.get('type'));if(form.get('category'))patch.category=String(form.get('category')).trim();if(form.get('date'))patch.date=String(form.get('date'));requestEdit('bulkTransaction',{ids:original.ids,patch});}
    if(target.kind==='bulkBorrower'){const patch:any={};if(form.get('rate')!=='')patch.rate=Number(form.get('rate'));requestEdit('bulkBorrower',{ids:original.ids,patch});}
    if(target.kind==='bulkRate'){const patch:any={};if(form.get('percent')!=='')patch.percent=Number(form.get('percent'));if(form.get('note'))patch.note=String(form.get('note'));requestEdit('bulkRate',{ids:original.ids,patch});}
    if(target.kind==='bulkLoan'){const patch:any={};if(form.get('borrowerId'))patch.borrowerId=String(form.get('borrowerId'));if(form.get('rate')!=='')patch.rate=Number(form.get('rate'));if(form.get('interestMethod'))patch.interestMethod=String(form.get('interestMethod'));if(form.get('months')!=='')patch.months=Number(form.get('months'));requestEdit('bulkLoan',{ids:original.ids,patch});}
    if(target.sequence&&target.sequence.index<target.sequence.items.length-1){
      const nextIndex=target.sequence.index+1;
      setTarget({...target,kind:target.sequence.kind,item:target.sequence.items[nextIndex],sequence:{...target.sequence,index:nextIndex}});
    }else setTarget(null);
  };
  const item:any=target.item;
  const isBulkChoice=target.kind.startsWith('bulk')&&target.bulkMode!=='multiple';
  const editIndividually=()=>{
    const kind=target.kind.replace(/^bulk/,'');
    const individualKind=kind.charAt(0).toLowerCase()+kind.slice(1);
    const items=item.records||[];
    if(!items.length)return setTarget(null);
    setTarget({kind:individualKind,item:items[0],borrowers:target.borrowers,sequence:{kind:individualKind,items,index:0,borrowers:target.borrowers}});
  };
  const formKey=`${target.kind}-${item.id||'bulk'}-${target.sequence?.index??target.bulkMode??'single'}`;
  return <div className={`overlay edit-overlay theme-${preferences?.theme==='dark'?'dark':'light'}`} role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setTarget(null);}}><div className="modal edit-record-modal" role="dialog" aria-modal="true" aria-labelledby="edit-record-title"><button className="close" aria-label="Đóng" onClick={()=>setTarget(null)}>×</button><h3 id="edit-record-title">Chỉnh sửa thông tin</h3><form key={formKey} onSubmit={submit}>
    {target.sequence&&<p className="edit-progress">Đang sửa mục {target.sequence.index+1} trên {target.sequence.items.length}</p>}
    {isBulkChoice&&<div className="bulk-edit-choice"><p>{item.ids.length} mục đã chọn. Bạn muốn chỉnh sửa các mục đã chọn như thế nào?</p><button type="button" className="bulk-edit-option" onClick={editIndividually}><strong>Sửa từng mục</strong><span>Mỗi mục sẽ mở lần lượt với đầy đủ thông tin riêng.</span></button><button type="button" className="bulk-edit-option" onClick={()=>setTarget({...target,bulkMode:'multiple'})}><strong>Sửa nhiều mục</strong><span>Áp dụng cùng thay đổi cho tất cả mục đã chọn.</span></button></div>}
    {target.kind==='transaction'&&<><label>Loại giao dịch<select name="type" defaultValue={item.type} required><option value="expense">Chi tiêu</option><option value="income">Thu nhập</option><option value="saving">Tiết kiệm</option></select></label><Field label="Danh mục" name="category" defaultValue={item.category} required/><Field label="Số tiền (VNĐ)" name="amount" type="number" min="1" defaultValue={item.amount} required/><Field label="Ngày" name="date" type="date" defaultValue={item.date} required/><Field label="Ghi chú" name="note" defaultValue={item.note}/></>}
    {target.kind==='borrower'&&<><Field label="Họ và tên" name="name" defaultValue={item.name} required/><Field label="Số điện thoại" name="phone" defaultValue={item.phone}/><RatePicker defaultValue={item.rate}/></>}
    {target.kind==='rate'&&<><Field label="Tên mức lãi suất" name="name" defaultValue={item.name} required/><Field label="Lãi suất (% / tháng)" name="percent" type="number" min="0" step="0.1" defaultValue={item.percent} required/><Field label="Ghi chú" name="note" defaultValue={item.note}/></>}
    {target.kind==='loan'&&<><label>Người vay<select name="borrowerId" defaultValue={item.borrowerId} required>{target.borrowers.map(borrower=><option value={borrower.id} key={borrower.id}>{borrower.name}</option>)}</select></label><Field label="Tiền gốc (VNĐ)" name="principal" type="number" min="1" defaultValue={item.principal} required/><RatePicker label="Lãi suất / tháng (%)" defaultValue={item.rate} required/><InterestMethodField defaultValue={item.interestMethod||'simple'}/><Field label="Ngày cho vay" name="startDate" type="date" defaultValue={item.startDate} required/><Field label="Số tháng" name="months" type="number" min="1" defaultValue={item.months} required/><Field label="Đã trả (VNĐ)" name="paid" type="number" min="0" defaultValue={item.paid} required/><Field label="Ghi chú" name="note" defaultValue={item.note}/></>}
    {target.kind==='category'&&<><label>Loại<select name="kind" defaultValue={item.kind} required><option value="expense">Chi tiêu</option><option value="income">Thu nhập</option><option value="saving">Tiết kiệm</option></select></label><Field label="Tên danh mục" name="value" defaultValue={item.value} required/></>}
    {target.kind==='bulkTransaction'&&target.bulkMode==='multiple'&&<><p className="field-help">{item.ids.length} mục đã chọn. Để trống trường không muốn thay đổi.</p><label>Loại giao dịch<select name="type" defaultValue=""><option value="">Giữ nguyên</option><option value="expense">Chi tiêu</option><option value="income">Thu nhập</option><option value="saving">Tiết kiệm</option></select></label><Field label="Danh mục" name="category"/><Field label="Ngày" name="date" type="date"/></>}
    {target.kind==='bulkBorrower'&&target.bulkMode==='multiple'&&<><p className="field-help">{item.ids.length} mục đã chọn. Để trống trường không muốn thay đổi.</p><Field label="Lãi suất mặc định (% / tháng)" name="rate" type="number" min="0" step="0.1"/></>}
    {target.kind==='bulkRate'&&target.bulkMode==='multiple'&&<><p className="field-help">{item.ids.length} mục đã chọn. Để trống trường không muốn thay đổi.</p><Field label="Lãi suất (% / tháng)" name="percent" type="number" min="0" step="0.1"/><Field label="Ghi chú" name="note"/></>}
    {target.kind==='bulkLoan'&&target.bulkMode==='multiple'&&<><p className="field-help">{item.ids.length} mục đã chọn. Để trống trường không muốn thay đổi.</p><label>Người vay<select name="borrowerId" defaultValue=""><option value="">Giữ nguyên</option>{target.borrowers.map(borrower=><option value={borrower.id} key={borrower.id}>{borrower.name}</option>)}</select></label><RatePicker label="Lãi suất / tháng (%)"/><InterestMethodField allowBlank/><Field label="Số tháng" name="months" type="number" min="1"/></>}
    {!isBulkChoice&&<div className="edit-form-actions"><button type="button" className="btn" onClick={()=>setTarget(null)}>Hủy</button><button className="btn primary">Lưu thay đổi</button></div>}
  </form></div></div>;
}
function Dashboard({txns,outstanding}:any){
  const dated=(txns as Txn[]).filter(txn=>/^\d{4}-\d{2}-\d{2}$/.test(txn.date));
  const latest=dated.reduce((value,txn)=>txn.date>value?txn.date:value,'')||new Date().toISOString().slice(0,10);
  const years=Array.from(new Set(dated.map(txn=>txn.date.slice(0,4)))).sort().reverse();
  const [periodType,setPeriodType]=useState<'month'|'year'>('month');
  const [selectedMonth,setSelectedMonth]=useState(latest.slice(0,7));
  const [selectedYear,setSelectedYear]=useState(latest.slice(0,4));
  const months=Array.from({length:12},(_,index)=>String(index+1).padStart(2,'0'));
  const period=periodType==='month'?selectedMonth:selectedYear;
  const periodTxns=(txns as Txn[]).filter(txn=>txn.date.startsWith(period));
  const total={income:periodTxns.filter(x=>x.type==='income').reduce((sum,x)=>sum+x.amount,0),expense:periodTxns.filter(x=>x.type==='expense').reduce((sum,x)=>sum+x.amount,0),saving:periodTxns.filter(x=>x.type==='saving').reduce((sum,x)=>sum+x.amount,0)};
  const carryover=openingCarryover(txns as Txn[],periodType==='month'?selectedMonth:`${selectedYear}-01`);
  const balance=periodType==='month'?carryover+total.income-total.expense-total.saving:openingCarryover(txns as Txn[],`${Number(selectedYear)+1}-01`);
  const groups=Object.entries(periodTxns.filter(x=>x.type==='expense').reduce<Record<string,number>>((result,txn)=>{result[txn.category]=(result[txn.category]||0)+txn.amount;return result;},{})) as [string,number][];
  const max=Math.max(1,...groups.map(([,amount])=>amount));
  const colors=['var(--gold)','var(--forest2)','var(--red)','var(--muted)'];let angle=0;
  const segments=groups.map(([,amount],index)=>{const start=angle;angle+=total.expense?amount/total.expense*360:0;return `${colors[index%colors.length]} ${start}deg ${angle}deg`;});
  const donutBackground=segments.length?`conic-gradient(${segments.join(',')})`:'var(--paper2)';
  return <><div className="dashboard-period card"><div><span className="period-label">Kỳ báo cáo</span><div className="period-switch" role="group" aria-label="Kỳ báo cáo"><button className={'btn '+(periodType==='month'?'is-active':'')} onClick={()=>setPeriodType('month')}>Theo tháng</button><button className={'btn '+(periodType==='year'?'is-active':'')} onClick={()=>setPeriodType('year')}>Theo năm</button></div></div>{periodType==='month'?<div className="period-fields"><label>Chọn tháng<select value={selectedMonth.slice(5,7)} onChange={event=>setSelectedMonth(`${selectedMonth.slice(0,4)}-${event.target.value}`)}>{months.map(month=><option value={month} key={month}>Tháng {Number(month)}</option>)}</select></label><label>Chọn năm<select value={selectedMonth.slice(0,4)} onChange={event=>setSelectedMonth(`${event.target.value}-${selectedMonth.slice(5,7)}`)}>{years.length?years.map(year=><option key={year}>{year}</option>):<option>{selectedMonth.slice(0,4)}</option>}</select></label></div>:<label>Chọn năm<select value={selectedYear} onChange={event=>setSelectedYear(event.target.value)}>{years.length?years.map(year=><option key={year}>{year}</option>):<option>{selectedYear}</option>}</select></label>}</div><div className="budget-kpis"><Kpi icon="↗" label="Thu nhập" value={money(total.income)} tone="green"/><Kpi icon="↘" label="Chi tiêu" value={money(total.expense)} tone="red"/><Kpi icon="♧" label="Tiết kiệm" value={money(total.saving)} tone="gold"/><Kpi icon="⌁" label="Dư nợ cho vay" value={money(outstanding)} /></div><div className="dashboard-grid"><div className="card"><h3>Tỷ trọng chi tiêu theo danh mục</h3><div className="donut" style={{background:donutBackground}}><div><b>{money(total.expense)}</b><small>Chi tiêu</small></div></div><div className="legend">{groups.map(([name,amount],index)=><span key={name}><i style={{background:colors[index%colors.length]}}/>{name}: {money(amount)}</span>)}</div></div><div className="card"><h3>So sánh chi tiêu theo danh mục</h3>{groups.length?groups.map(([name,amount],index)=><div className="bar" key={name}><span>{name}</span><div><i style={{width:`${amount/max*100}%`,background:colors[index%colors.length]}}/></div><b>{money(amount)}</b></div>):<Empty text="Chưa có chi tiêu"/>}</div></div><div className="card recent"><h3>Giao dịch trong kỳ <span>Dư đầu kỳ: {money(carryover)} · Số dư cuối kỳ: {money(balance)}</span></h3>{periodTxns.length?periodTxns.map(txn=><div className="transaction" key={txn.id}><i className={txn.type}>{txn.type==='income'?'↗':txn.type==='saving'?'♧':'↘'}</i><div><b>{txn.category}</b><small>{txn.date}{txn.note?' · '+txn.note:''}</small></div><strong className={txn.type}>{txn.type==='income'?'+':'-'}{money(txn.amount)}</strong><button className="text-btn edit-btn" onClick={()=>editTransaction(txn)}>Sửa</button></div>):<Empty text="Không có giao dịch trong kỳ này."/>}</div></>;
}
function Kpi({icon,label,value,tone}:any){return <div className="budget-kpi"><i>{icon}</i><small>{label}</small><b className={tone}>{value}</b></div>}
function useBulkSelection(ids:string[]){const [selected,setSelected]=useState<Set<string>>(()=>new Set());const idsKey=ids.join('\u0000');useEffect(()=>{const visibleIds=new Set(idsKey?idsKey.split('\u0000'):[]);setSelected(current=>new Set([...current].filter(id=>visibleIds.has(id))));},[idsKey]);const allSelected=ids.length>0&&selected.size===ids.length;const toggle=(id:string)=>setSelected(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;});const toggleAll=()=>setSelected(allSelected?new Set():new Set(ids));const clear=()=>setSelected(new Set());return{selected,allSelected,toggle,toggleAll,clear};}
function BulkToolbar({records,selection,kind,borrowers=[]}:any){
  const deleteKinds:Record<string,string>={bulkTransaction:'deleteTransactions',bulkBorrower:'deleteBorrowers',bulkRate:'deleteRates',bulkLoan:'deleteLoans'};
  const removeSelected=()=>{if(!selection.selected.size||!window.confirm('Bạn có chắc muốn xóa các mục đã chọn?'))return;requestEdit(deleteKinds[kind],{ids:Array.from(selection.selected)});selection.clear();};
  const editSelected=()=>{const selectedRecords=records.filter((record:any)=>selection.selected.has(record.id));openEditor(kind,{ids:selectedRecords.map((record:any)=>record.id),records:selectedRecords},borrowers);};
  return <div className="list-bulk-toolbar"><label className="bulk-check"><input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll}/> Chọn tất cả</label><span>{selection.selected.size} mục đã chọn</span><button className="btn" disabled={!selection.selected.size} onClick={editSelected}>Sửa đồng thời</button><button className="btn bulk-delete" disabled={!selection.selected.size} onClick={removeSelected}>Xóa mục đã chọn</button></div>;
}
function Transactions({txns,remove,selectedMonth,setSelectedMonth}:any){
  const dated=(txns as Txn[]).filter(txn=>/^\d{4}-\d{2}-\d{2}$/.test(txn.date));
  const latest=dated.reduce((value,txn)=>txn.date>value?txn.date:value,'')||new Date().toISOString().slice(0,10);
  const years=Array.from(new Set(dated.map(txn=>txn.date.slice(0,4)))).sort().reverse();
  const months=Array.from({length:12},(_,index)=>String(index+1).padStart(2,'0'));
  const [periodType,setPeriodType]=useState<'month'|'year'>('month');
  const [selectedYear,setSelectedYear]=useState(latest.slice(0,4));
  const period=periodType==='month'?selectedMonth:selectedYear;
  const visible=(txns as Txn[]).filter(txn=>txn.date.startsWith(period)).sort((a,b)=>b.date.localeCompare(a.date));
  const grouped=visible.reduce<Record<string,Txn[]>>((result,txn)=>{const key=txn.date.slice(0,7);(result[key]||=[]).push(txn);return result;},{});
  const groups=Object.entries(grouped).sort(([left],[right])=>right.localeCompare(left));
  const selection=useBulkSelection(visible.map(item=>item.id));
  return <><div className="dashboard-period card transaction-period-filter"><div><span className="period-label">Phân loại giao dịch</span><div className="period-switch" role="group" aria-label="Phân loại giao dịch"><button className={'btn '+(periodType==='month'?'is-active':'')} onClick={()=>setPeriodType('month')}>Theo tháng</button><button className={'btn '+(periodType==='year'?'is-active':'')} onClick={()=>setPeriodType('year')}>Theo năm</button></div></div>{periodType==='month'?<div className="period-fields"><label>Chọn tháng<select value={selectedMonth.slice(5,7)} onChange={event=>setSelectedMonth(`${selectedMonth.slice(0,4)}-${event.target.value}`)}>{months.map(month=><option value={month} key={month}>Tháng {Number(month)}</option>)}</select></label><label>Chọn năm<select value={selectedMonth.slice(0,4)} onChange={event=>setSelectedMonth(`${event.target.value}-${selectedMonth.slice(5,7)}`)}>{years.length?years.map(year=><option key={year}>{year}</option>):<option>{selectedMonth.slice(0,4)}</option>}</select></label></div>:<label>Chọn năm<select value={selectedYear} onChange={event=>setSelectedYear(event.target.value)}>{years.length?years.map(year=><option key={year}>{year}</option>):<option>{selectedYear}</option>}</select></label>}</div><div className="card"><div className="section-head"><h3>Giao dịch trong kỳ</h3><span>{visible.length} giao dịch</span></div><BulkToolbar records={visible} selection={selection} kind="bulkTransaction"/>{groups.length?groups.map(([month,items])=><section className="transaction-period-group" key={month}><h4><span>{displayMonth(month)}</span><small>{items.length} giao dịch</small></h4>{items.map(t=><div className="transaction" key={t.id}><input className="row-check" type="checkbox" checked={selection.selected.has(t.id)} onChange={()=>selection.toggle(t.id)} aria-label={'Chọn '+t.category}/><i className={t.type}>{t.type==='income'?'↗':t.type==='saving'?'♧':'↘'}</i><div><b>{t.category}</b><small>{t.date}{t.note?' · '+t.note:''}</small></div><strong className={t.type}>{t.type==='income'?'+':'-'}{money(t.amount)}</strong><div className="record-actions"><button className="text-btn edit-btn" onClick={()=>editTransaction(t)}>Sửa</button><button className="text-btn" onClick={()=>remove(t.id)}>Xóa</button></div></div>)}</section>):<Empty text="Không có giao dịch trong kỳ này."/>}</div></>;
}
function Borrowers({borrowers,onAdd,onRemove}:any){const selection=useBulkSelection(borrowers.map((item:Borrower)=>item.id));return <div className="two-col" style={{alignItems:'start'}}><div className="card"><h3>Thêm loaner</h3><form onSubmit={onAdd}><Field label="Họ và tên" name="name" required/><Field label="Số điện thoại" name="phone"/><RatePicker/><button className="btn primary">Thêm loaner</button></form></div><div className="card" style={{alignSelf:'start',height:'fit-content'}}><h3>Danh sách loaner</h3><BulkToolbar records={borrowers} selection={selection} kind="bulkBorrower"/>{borrowers.length?borrowers.map((b:Borrower)=><div className="item item-record" key={b.id}><input className="row-check" type="checkbox" checked={selection.selected.has(b.id)} onChange={()=>selection.toggle(b.id)} aria-label={'Chọn '+b.name}/><div className="item-record-info"><b>{b.name}</b><small>☎ {b.phone||'Chưa có số'} · {b.rate||0}% / tháng</small></div><div className="record-actions"><button className="text-btn edit-btn" onClick={()=>editBorrower(b)}>Sửa</button><button className="text-btn" onClick={()=>onRemove(b.id)}>Xóa</button></div></div>):<Empty text="Chưa có loaner nào."/>}</div></div>}
function LendingRates({rates,onAdd,onRemove}:any){const selection=useBulkSelection(rates.map((item:LendingRate)=>item.id));return <div className="two-col"><div className="card"><h3>Thêm lending rate</h3><form onSubmit={onAdd}><Field label="Tên mức lãi suất" name="name" placeholder="Ví dụ: Lãi chuẩn" required/><Field label="Lãi suất (% / tháng)" name="percent" type="number" step="0.1" required/><Field label="Ghi chú" name="note" placeholder="Tùy chọn"/><button className="btn primary">Lưu lending rate</button></form></div><div className="card"><h3>Các mức lãi suất</h3><BulkToolbar records={rates} selection={selection} kind="bulkRate"/>{rates.length?rates.map((rate:LendingRate)=><div className="item item-record" key={rate.id}><input className="row-check" type="checkbox" checked={selection.selected.has(rate.id)} onChange={()=>selection.toggle(rate.id)} aria-label={'Chọn '+rate.name}/><div className="item-record-info"><b>{rate.name}</b><small>{rate.percent}% / tháng{rate.note?' · '+rate.note:''}</small></div><div className="record-actions"><button className="text-btn edit-btn" onClick={()=>editRate(rate)}>Sửa</button><button className="text-btn" onClick={()=>onRemove(rate.id)}>Xóa</button></div></div>):<Empty text="Chưa có lending rate nào."/>}</div></div>}
function Loans({loans,borrowers}:any){
  const selection=useBulkSelection(loans.map((item:Loan)=>item.id));
  const [expanded,setExpanded]=useState<string|null>(null);
  const recordPayment=(loan:Loan,key:string,value:string)=>{const payments={...(loan.payments||{})};if(value==='')delete payments[key];else payments[key]=Math.max(0,Number(value)||0);const paid=Object.values(payments).reduce((sum,amount)=>sum+Number(amount),0);requestEdit('loan',{...loan,payments,paid});};
  return <div className="card"><h3>Sổ vay nợ</h3><BulkToolbar records={loans} selection={selection} kind="bulkLoan" borrowers={borrowers}/>{loans.length?loans.map((l:Loan)=>{
    const b=borrowers.find((x:Borrower)=>x.id===l.borrowerId);const due=projectedLoanTotal(l),remain=remainingLoanBalance(l),isExpanded=expanded===l.id,schedule=loanSchedule(l),method=l.interestMethod==='compound'?'Lãi kép':'Lãi đơn';
    return <div className={'loan-record-wrap '+(isExpanded?'is-expanded':'')} key={l.id}><div className="loan loan-record"><input className="row-check" type="checkbox" checked={selection.selected.has(l.id)} onChange={()=>selection.toggle(l.id)} aria-label={'Chọn '+(b?.name||'khoản vay')}/><div className="loan-person"><b>{b?.name||'Người vay đã xóa'}</b><small>Gốc {money(l.principal)} · {l.rate}% / tháng · {method} · {l.months} tháng<br/>Ngày vay: {l.startDate}{l.note?' · '+l.note:''}</small></div><div className="loan-summary"><b className={remain?'red':'green'}>{money(remain)}</b><small>Cần thu: {money(due)} · Đã trả: {money(l.paid)}</small><div className="record-actions loan-actions"><button className="btn small-btn" onClick={()=>editLoan(l,borrowers)}>Sửa</button><button className="btn small-btn detail-toggle" aria-expanded={isExpanded} onClick={()=>setExpanded(isExpanded?null:l.id)}>{isExpanded?'Ẩn chi tiết':'Xem chi tiết'}</button></div></div></div>{isExpanded&&<div className="loan-detail"><div className="loan-detail-head"><h4>Bảng lãi và thanh toán theo tháng</h4><button className="text-btn" onClick={()=>setExpanded(null)}>Đóng chi tiết</button></div><div className="loan-table-wrap"><table className="loan-ledger"><thead><tr><th>Thời gian</th><th>Gốc đầu kỳ</th><th>Gốc kỳ này</th><th>Lãi kỳ này</th><th>Nợ kỳ trước</th><th>Tổng cần thanh toán</th><th>Đã trả tháng này</th><th>Trạng thái</th></tr></thead><tbody>{schedule.map(row=><tr key={row.key}><td>{displayMonth(row.key)}</td><td>{money(row.principalStart)}</td><td>{money(row.principalInstallment)}</td><td className="red">+ {money(row.interest)}</td><td>{money(row.overdue)}</td><td><strong>{money(row.due)}</strong></td><td><input className="input payment-input" type="number" min="0" step="1000" aria-label={`Đã trả ${displayMonth(row.key)}`} placeholder="Chưa nhập" value={row.paid??''} onChange={event=>recordPayment(l,row.key,event.target.value)}/></td><td><span className={'payment-status status-'+(row.status==='Đã trả'?'paid':row.status==='Trả một phần'?'partial':'unpaid')}>{row.status}</span></td></tr>)}</tbody></table></div><p className="field-help">Tổng cần thanh toán = nợ kỳ trước + gốc kỳ này + lãi kỳ này. Tiền gốc được chia đều theo {l.months} tháng. {l.interestMethod==='compound'?'Lãi chưa trả được cộng vào gốc kỳ sau; khoản trả vượt kỳ sẽ giảm gốc.':'Lãi được tính cố định trên gốc ban đầu; khoản thiếu hoặc trả dư được chuyển sang kỳ sau.'}</p></div>}</div>;
  }):<Empty text="Chưa có khoản vay nào. Hãy tạo người vay trước."/>}</div>;
}
function Calculator(){const [v,setV]=useState({principal:10000000,rate:3,months:6});const interest=v.principal*v.rate/100*v.months;return <div className="two-col"><div className="card"><h3>Tính lãi đơn</h3><Field label="Tiền gốc" name="principal" type="number" value={v.principal} onChange={(e:any)=>setV({...v,principal:Number(e.target.value)})}/><Field label="Lãi suất (% / tháng)" name="rate" type="number" value={v.rate} onChange={(e:any)=>setV({...v,rate:Number(e.target.value)})}/><Field label="Kỳ hạn (tháng)" name="months" type="number" value={v.months} onChange={(e:any)=>setV({...v,months:Number(e.target.value)})}/></div><div className="card calc-result"><h3>Kết quả dự kiến</h3><p>Tiền lãi <b>{money(interest)}</b></p><p>Tổng cần thu <b>{money(v.principal+interest)}</b></p><p>Trung bình / tháng <b>{money((v.principal+interest)/v.months)}</b></p></div></div>}
function CompoundCalculator(){const [v,setV]=useState({principal:10000000,rate:8,months:60,contribution:1000000});const periods=Math.max(1,v.months);const monthlyRate=v.rate/100/12;const growth=Math.pow(1+monthlyRate,periods);const future=v.principal*growth+(monthlyRate?v.contribution*((growth-1)/monthlyRate):v.contribution*periods);const invested=v.principal+v.contribution*periods;return <div className="two-col"><div className="card"><h3>Kế hoạch tăng trưởng cá nhân</h3><p className="muted">Dự tính giá trị tài sản khi lãi được tái đầu tư hàng tháng.</p><Field label="Số tiền ban đầu" name="principal" type="number" value={v.principal} onChange={(e:any)=>setV({...v,principal:Number(e.target.value)})}/><Field label="Lãi suất năm (%)" name="rate" type="number" step="0.1" value={v.rate} onChange={(e:any)=>setV({...v,rate:Number(e.target.value)})}/><Field label="Thời gian (tháng)" name="months" type="number" value={v.months} onChange={(e:any)=>setV({...v,months:Number(e.target.value)})}/><Field label="Đóng thêm mỗi tháng" name="contribution" type="number" value={v.contribution} onChange={(e:any)=>setV({...v,contribution:Number(e.target.value)})}/></div><div className="card calc-result"><h3>Dự kiến của bạn</h3><p>Tổng đóng góp <b>{money(invested)}</b></p><p>Giá trị tương lai <b>{money(future)}</b></p><p>Lợi nhuận tích lũy <b>{money(future-invested)}</b></p></div></div>}
type SplitPerson={id:string;name:string;customShare:number};
type SplitExpense={id:string;description:string;amount:number;payerId:string};
type SplitTransfer={from:SplitPerson;to:SplitPerson;amount:number};
function ExpenseSplitter(){
  const firstId=useMemo(()=>id(),[]);const secondId=useMemo(()=>id(),[]);
  const [people,setPeople]=useState<SplitPerson[]>([{id:firstId,name:'Người 1',customShare:0},{id:secondId,name:'Người 2',customShare:0}]);
  const [expenses,setExpenses]=useState<SplitExpense[]>([{id:id(),description:'',amount:0,payerId:firstId}]);
  const [splitMode,setSplitMode]=useState<'equal'|'custom'>('equal');
  const total=Math.round(expenses.reduce((sum,expense)=>sum+(Number(expense.amount)||0),0));
  const paidByPerson=useMemo(()=>Object.fromEntries(people.map(person=>[
    person.id,
    Math.round(expenses.filter(expense=>expense.payerId===person.id).reduce((sum,expense)=>sum+(Number(expense.amount)||0),0))
  ])),[people,expenses]);
  const owedByPerson=useMemo(()=>{if(splitMode==='custom')return Object.fromEntries(people.map(person=>[person.id,Math.round(Number(person.customShare)||0)]));const base=people.length?Math.floor(total/people.length):0;const remainder=people.length?total-base*people.length:0;return Object.fromEntries(people.map((person,index)=>[person.id,base+(index<remainder?1:0)]));},[people,splitMode,total]);
  const customTotal=people.reduce((sum,person)=>sum+Math.round(Number(person.customShare)||0),0);
  const normalizedNames=people.map(person=>person.name.trim().toLocaleLowerCase());
  const namesValid=people.length>=2&&normalizedNames.every(Boolean)&&new Set(normalizedNames).size===people.length;
  const expensesValid=expenses.length>0&&expenses.every(expense=>expense.description.trim()&&expense.amount>0&&people.some(person=>person.id===expense.payerId));
  const allocationValid=splitMode==='equal'||customTotal===total;const valid=namesValid&&expensesValid&&allocationValid;
  const transfers=useMemo<SplitTransfer[]>(()=>{if(!valid)return[];const creditors=people.map(person=>({person,balance:(paidByPerson[person.id]||0)-(owedByPerson[person.id]||0)})).filter(item=>item.balance>0);const debtors=people.map(person=>({person,balance:(paidByPerson[person.id]||0)-(owedByPerson[person.id]||0)})).filter(item=>item.balance<0).map(item=>({...item,balance:-item.balance}));const result:SplitTransfer[]=[];let creditorIndex=0,debtorIndex=0;while(creditorIndex<creditors.length&&debtorIndex<debtors.length){const creditor=creditors[creditorIndex],debtor=debtors[debtorIndex],amount=Math.min(creditor.balance,debtor.balance);if(amount>0)result.push({from:debtor.person,to:creditor.person,amount});creditor.balance-=amount;debtor.balance-=amount;if(creditor.balance===0)creditorIndex+=1;if(debtor.balance===0)debtorIndex+=1;}return result;},[people,paidByPerson,owedByPerson,valid]);
  const updatePerson=(personId:string,patch:Partial<SplitPerson>)=>setPeople(current=>current.map(person=>person.id===personId?{...person,...patch}:person));
  const addPerson=()=>setPeople(current=>[...current,{id:id(),name:`Người ${current.length+1}`,customShare:0}]);
  const removePerson=(personId:string)=>setPeople(current=>{if(current.length<=2)return current;const next=current.filter(person=>person.id!==personId);setExpenses(items=>items.map(expense=>expense.payerId===personId?{...expense,payerId:next[0].id}:expense));return next;});
  const updateExpense=(expenseId:string,patch:Partial<SplitExpense>)=>setExpenses(current=>current.map(expense=>expense.id===expenseId?{...expense,...patch}:expense));
  const addExpense=()=>setExpenses(current=>[...current,{id:id(),description:'',amount:0,payerId:people[0]?.id||''}]);
  const payerCount=new Set(expenses.filter(expense=>expense.amount>0).map(expense=>expense.payerId)).size;
  return <div className="split-workbench">
    <section className="card split-intro"><div><h3>Chia chi phí</h3><p>Ghi lại ai đã thanh toán, chọn cách chia và xem chính xác ai cần chuyển tiền cho ai.</p></div><div className="split-total"><span>Tổng chi phí</span><strong>{money(total)}</strong><small>{payerCount} người đã thanh toán</small></div></section>
    <section className="card split-method"><div><h3>Cách chia chi phí</h3><p>Chọn chia đều hoặc nhập chính xác phần chi phí của từng người.</p></div><div className="split-mode-options"><label className={splitMode==='equal'?'is-selected':''}><input type="radio" name="splitMode" checked={splitMode==='equal'} onChange={()=>setSplitMode('equal')}/><span><b>Chia đều</b><small>Mỗi người chịu phần bằng nhau.</small></span></label><label className={splitMode==='custom'?'is-selected':''}><input type="radio" name="splitMode" checked={splitMode==='custom'} onChange={()=>setSplitMode('custom')}/><span><b>Chia theo số tiền cụ thể</b><small>Phù hợp khi mỗi người dùng khác nhau.</small></span></label></div>{splitMode==='custom'&&<p className={allocationValid?'split-allocation is-valid':'split-allocation is-error'}>Đã phân bổ {money(customTotal)} / {money(total)}{!allocationValid&&' — Tổng số tiền phân bổ phải bằng tổng chi phí.'}</p>}</section>
    <div className="split-input-grid">
      <section className="card split-panel"><div className="split-section-head"><div><h3>Người tham gia</h3><p>Tối thiểu 2 người trong một lần chia.</p></div><button type="button" className="btn" onClick={addPerson}>＋ Thêm người</button></div><div className="split-list">{people.map((person,index)=><div className="split-person-row" key={person.id}><span className="split-index">{index+1}</span><label>Tên người<input className="input" value={person.name} onChange={event=>updatePerson(person.id,{name:event.target.value})}/></label>{splitMode==='custom'&&<label>Số tiền phải chịu<input className="input" type="number" min="0" step="1000" value={person.customShare||''} onChange={event=>updatePerson(person.id,{customShare:Number(event.target.value)})}/></label>}<button type="button" className="split-remove" disabled={people.length<=2} aria-label={`Xóa người ${person.name}`} onClick={()=>removePerson(person.id)}>×</button></div>)}</div></section>
      <section className="card split-panel"><div className="split-section-head"><div><h3>Các khoản đã thanh toán</h3><p>Thêm từng giao dịch và chọn người đã ứng tiền; một hoặc nhiều người đều được.</p></div><button type="button" className="btn" onClick={addExpense}>＋ Thêm khoản chi</button></div><div className="split-list">{expenses.map((expense,index)=><div className="split-expense-row" key={expense.id}><span className="split-index">{index+1}</span><label>Nội dung khoản chi<input className="input" placeholder="Ví dụ: Tiền đồ ăn" required value={expense.description} onChange={event=>updateExpense(expense.id,{description:event.target.value})}/></label><label>Số tiền (VNĐ)<input className="input" type="number" min="1" step="1000" required value={expense.amount||''} onChange={event=>updateExpense(expense.id,{amount:Number(event.target.value)})}/></label><label>Người thanh toán<select value={expense.payerId} onChange={event=>updateExpense(expense.id,{payerId:event.target.value})}>{people.map(person=><option key={person.id} value={person.id}>{person.name||'Chưa đặt tên'}</option>)}</select></label><button type="button" className="split-remove" disabled={expenses.length<=1} aria-label="Xóa khoản chi" onClick={()=>setExpenses(current=>current.filter(item=>item.id!==expense.id))}>×</button></div>)}</div></section>
    </div>
    <section className="card split-results"><div className="split-section-head"><div><h3>Kết quả đối soát</h3><p>Các giao dịch được gộp theo số dư cuối để tránh hoàn tiền riêng cho từng khoản.</p></div><strong className="split-result-total">{money(total)}</strong></div>{!valid?<div className="split-warning" role="status">{!namesValid?'Tên người tham gia phải đầy đủ và không trùng nhau.':!expensesValid?'Nhập đầy đủ nội dung, số tiền và người thanh toán cho từng khoản chi.':'Tổng số tiền phân bổ phải bằng tổng chi phí.'}</div>:<><div className="split-summary-grid">{people.map(person=>{const paid=paidByPerson[person.id]||0,owed=owedByPerson[person.id]||0,balance=paid-owed;return <article key={person.id}><b>{person.name}</b><dl><div><dt>Đã trả</dt><dd>{money(paid)}</dd></div><div><dt>Phải chịu</dt><dd>{money(owed)}</dd></div><div className={balance>=0?'positive':'negative'}><dt>{balance>=0?'Nhận lại':'Cần trả'}</dt><dd>{money(Math.abs(balance))}</dd></div></dl></article>})}</div><div className="split-transfers"><h4>Chuyển tiền tới</h4>{transfers.length?transfers.map((transfer,index)=><div className="split-transfer" key={`${transfer.from.id}-${transfer.to.id}-${index}`}><span><b>{transfer.from.name}</b> chuyển cho <b>{transfer.to.name}</b></span><strong>{money(transfer.amount)}</strong></div>):<p className="split-settled">Mọi khoản đã cân bằng.</p>}</div></>}</section>
  </div>;
}
function Categories(){
  const stored=load();const [groups,setGroups]=useState<CategoryGroups>(stored?.categories||defaultCategories);const [name,setName]=useState('');const [type,setType]=useState<Txn['type']>('expense');
  const persist=(next:CategoryGroups)=>{setGroups(next);const current=load()||{};const owner=current.user?.email;const dataByUser=owner?{...(current.dataByUser||{}),[owner]:{...(current.dataByUser?.[owner]||{}),categories:next}}:(current.dataByUser||{});save({...current,categories:next,dataByUser});};
  const add=()=>{const value=name.trim();if(!value||groups[type].includes(value))return;persist({...groups,[type]:[...groups[type],value]});setName('');};
  const remove=(kind:Txn['type'],value:string)=>persist({...groups,[kind]:groups[kind].filter(item=>item!==value)});
  useEffect(()=>{const apply=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail.kind!=='category')return;const {kind,value,nextKind,nextValue}=detail.item as EditableCategory&{nextKind:Txn['type'];nextValue:string};if(!nextValue||groups[nextKind].some(item=>item!==value&&item===nextValue))return;const withoutOld={...groups,[kind]:groups[kind].filter(item=>item!==value)};persist({...withoutOld,[nextKind]:[...withoutOld[nextKind],nextValue]});};window.addEventListener(editEvent,apply);return()=>window.removeEventListener(editEvent,apply);},[groups]);
  return <div className="card"><h3>Danh mục giao dịch</h3><form className="category-editor" onSubmit={event=>{event.preventDefault();add();}}><label>Loại<select value={type} onChange={e=>setType(e.target.value as Txn['type'])}><option value="expense">Chi tiêu</option><option value="income">Thu nhập</option><option value="saving">Tiết kiệm</option></select></label><label className="category-name-field">Tên danh mục<input className="input category-name-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Ví dụ: Giáo dục"/></label><button className="btn primary" type="submit">＋ Thêm danh mục</button></form>{(Object.entries(groups) as [string,string[]][]).map(([kind,items])=><div className="category" key={kind}><b>{kind==='income'?'Thu nhập':kind==='expense'?'Chi tiêu':'Tiết kiệm'}</b><div>{items.map(item=><span key={item} className={kind}>{item}<button aria-label={'Sửa '+item} onClick={()=>openEditor('category',{kind,value:item})}>✎</button><button aria-label={'Xóa '+item} onClick={()=>remove(kind as Txn['type'],item)}>×</button></span>)}</div></div>)}</div>;
}
function AdminUsers({users,onCreate,onUpdate,onDelete}:any){
  const [editingEmail,setEditingEmail]=useState<string|null>(null);const [notice,setNotice]=useState('');
  const validate=(name:string,email:string,password:string,requiresPassword:boolean)=>{if(!name||!email)return 'Vui lòng nhập đầy đủ tên và email.';if((requiresPassword||password)&&password.length<6)return 'Mật khẩu phải có ít nhất 6 ký tự.';return '';};
  const create=async (event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const currentForm=event.currentTarget,form=new FormData(currentForm),name=String(form.get('name')).trim(),email=String(form.get('email')).trim().toLowerCase(),password=String(form.get('password'));const invalid=validate(name,email,password,true);if(invalid)return setNotice(invalid);const error=await onCreate({name,email,password});if(error)return setNotice(error);currentForm.reset();setNotice('Đã tạo tài khoản.');};
  const update=async (event:FormEvent<HTMLFormElement>,original:User)=>{event.preventDefault();const form=new FormData(event.currentTarget),name=String(form.get('name')).trim(),email=String(form.get('email')||original.email).trim().toLowerCase(),password=String(form.get('password'));const invalid=validate(name,email,password,false);if(invalid)return setNotice(invalid);const error=await onUpdate(original.email,{name,email,password:password||undefined});if(error)return setNotice(error);setEditingEmail(null);setNotice('Đã cập nhật tài khoản.');};
  const remove=(account:User)=>{if(!window.confirm(`Xóa tài khoản ${account.email}? Dữ liệu tài chính cục bộ của tài khoản này cũng sẽ bị xóa.`))return;const error=onDelete(account.email);setNotice(error||'Đã xóa tài khoản.');};
  return <div className="admin-users">
    <section className="card admin-user-create"><div className="admin-section-copy"><h3>Tạo tài khoản người dùng</h3><p>Quản lý này chỉ áp dụng cho dữ liệu tài khoản được lưu trên trình duyệt hiện tại.</p></div><form onSubmit={create}><Field label="Tên hiển thị" name="name" required/><Field label="Email" name="email" type="email" required/><Field label="Mật khẩu" name="password" type="password" minLength={6} required/><button className="btn primary" type="submit">Tạo người dùng</button></form>{notice&&<p className="admin-notice" role="status">{notice}</p>}</section>
    <section className="card admin-user-list"><div className="admin-list-head"><div><h3>Danh sách tài khoản</h3><p>{users.length} tài khoản trên trình duyệt này</p></div></div><div className="admin-account-list">{users.map((account:User)=>{const isAdmin=sameEmail(account.email,adminEmail),isEditing=editingEmail===account.email;return <article className="admin-account" key={account.email}>{isEditing?<form key={account.email} onSubmit={event=>update(event,account)}><Field label="Tên hiển thị" name="name" defaultValue={account.name} required/><Field label="Email" name="email" type="email" defaultValue={account.email} disabled={isAdmin} required/><Field label="Mật khẩu mới" name="password" type="password" minLength={6}/><p className="field-help">Để trống để giữ nguyên mật khẩu.</p><div className="admin-actions"><button type="button" className="btn" onClick={()=>setEditingEmail(null)}>Hủy</button><button className="btn primary" type="submit">Lưu tài khoản</button></div></form>:<><div className="admin-account-main"><span className="admin-avatar" aria-hidden="true">{account.name.trim().slice(0,1).toUpperCase()||'U'}</span><div><b>{account.name}</b><span>{account.email}</span></div></div><span className={'admin-role '+(isAdmin?'is-admin':'')}>{isAdmin?'Tài khoản quản trị':'Tài khoản thường'}</span><div className="admin-actions"><button className="btn" type="button" onClick={()=>{setEditingEmail(account.email);setNotice('');}}>Sửa</button><button className="btn admin-delete" type="button" disabled={isAdmin} onClick={()=>remove(account)}>Xóa tài khoản</button></div></>}</article>})}</div></section>
  </div>;
}
function Language({value,onChange}:any){return <div className="card settings-card"><h3>Manage language</h3><p className="muted">Choose the preferred language for this browser. The selection is saved automatically.</p><label>Display language<select value={value} onChange={e=>onChange(e.target.value)}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label></div>}
function Empty({text}:any){return <p className="empty">{text}</p>}

const css = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');:root{--ink:#20241b;--muted:#667061;--paper:#f1ecdd;--paper2:#e7dfc8;--card:#fbf8ef;--forest:#12301f;--forest2:#28603f;--gold:#b5872b;--goldlight:#e3c77e;--line:#d3c7a6;--red:#9c3b2c;--green:#2e6b4b}*{box-sizing:border-box}body{margin:0;background:var(--paper);font-family:Inter,sans-serif;color:var(--ink)}button,input,select{font:inherit}button{cursor:pointer}h1,h2,h3{font-family:Fraunces,serif;color:var(--forest)}h2{margin:0;font-size:22px}h3{font-size:15px;margin:0 0 16px}.auth-wrap{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(1000px 600px at 15% 0,#1c4a30,var(--forest) 58%,#0c2015)}.auth-shell{display:flex;width:min(920px,100%);min-height:510px;background:var(--card);border-radius:16px;overflow:hidden;box-shadow:0 30px 60px #0007}.auth-side{width:310px;padding:42px 32px;background:linear-gradient(160deg,var(--forest),#0d2517);color:#e7dfc8;display:flex;flex-direction:column;justify-content:space-between}.auth-side h1{color:var(--paper);font-size:30px;margin:18px 0 8px}.auth-side p{font-size:13px;line-height:1.55;color:#c9d6c4}.seal{width:86px;height:86px;border:2px dashed var(--goldlight);border-radius:50%;display:grid;place-items:center;color:var(--goldlight);font:700 30px Fraunces}.auth-side>span{color:var(--goldlight);font-size:11px;letter-spacing:.15em}.auth-main{flex:1;padding:45px;max-width:560px}.auth-main>p{margin:7px 0 25px}.auth-tabs{display:flex;gap:22px;border-bottom:1px solid var(--line);margin-bottom:27px}.auth-tabs button{border:0;background:none;padding:8px 0;color:var(--muted);font-weight:700}.auth-tabs .active{color:var(--forest);border-bottom:2px solid var(--gold)}form label{display:block;color:var(--forest);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin:0 0 13px}.input,select{display:block;width:100%;background:#fff;border:1px solid #8e9481;border-radius:7px;padding:10px 12px;margin-top:6px;color:var(--ink)}.input:focus,select:focus{outline:2px solid var(--gold)}.btn{border:1px solid #8e9481;background:var(--card);color:var(--forest);border-radius:8px;padding:9px 15px;font-weight:700;font-size:13px}.btn.primary{background:var(--forest);border-color:var(--forest);color:var(--paper)}.btn.wide{width:100%;margin-top:3px}.alert{margin:15px 0;padding:11px 13px;border:1px solid var(--red);background:#f4e1da;border-radius:7px;color:var(--red);font-size:13px}.auth-main small{color:var(--muted);display:block;margin-top:18px}.app-shell{display:flex;min-height:100vh}.sidebar{width:238px;flex:none;background:linear-gradient(180deg,var(--forest),#0e2818);padding:22px 14px;color:#cbd8c6;display:flex;flex-direction:column}.brand{display:flex;gap:10px;align-items:center;padding:0 8px 22px;border-bottom:1px solid #ffffff24;margin-bottom:17px}.brand-mark{width:35px;height:35px;border:1.5px solid var(--goldlight);display:grid;place-items:center;border-radius:8px;color:var(--goldlight);font:700 15px Fraunces}.brand b{font:600 18px Fraunces;color:var(--paper);display:block}.brand small{font-size:9px;letter-spacing:.1em;color:#9db09b}.nav-label{font-size:10px;color:#9db09b;padding:0 12px 7px;letter-spacing:.1em}.nav{display:flex;text-align:left;align-items:center;gap:11px;border:1px solid transparent;background:none;color:#cbd8c6;border-radius:8px;padding:11px 12px;margin:2px 0;font-weight:600;font-size:13px}.nav i{width:17px;font-style:normal;text-align:center}.nav:hover,.nav.active{background:#e3c77e20;color:var(--goldlight);border-color:#e3c77e4d}.sidebar-foot{margin-top:auto;border-top:1px solid #ffffff24;padding:15px 8px 0;font-size:12px;line-height:1.5}.sidebar-foot b{color:var(--paper)}.logout{color:#f0c9be;margin-top:8px;padding-left:0}.main{min-width:0;flex:1}.topbar{min-height:70px;padding:16px 28px;background:var(--paper2);border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}.content{padding:26px 28px 55px}.budget-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}.budget-kpi,.card{background:var(--card);border:1px solid var(--line);border-radius:10px}.budget-kpi{padding:16px 18px}.budget-kpi>i{float:right;color:var(--gold);font-style:normal;font-size:19px}.budget-kpi small{display:block;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-size:11px;font-weight:700}.budget-kpi b{font:500 21px 'IBM Plex Mono';display:block;margin-top:8px;color:var(--forest)}.green{color:var(--green)!important}.red{color:var(--red)!important}.gold{color:var(--gold)!important}.dashboard-grid,.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}.card{padding:20px}.donut{width:166px;height:166px;margin:5px auto 17px;border-radius:50%;background:conic-gradient(var(--gold) 0 45%,var(--forest2) 45% 74%,var(--red) 74% 90%,#536b9c 90%);display:grid;place-items:center}.donut>div{width:108px;height:108px;border-radius:50%;background:var(--card);display:grid;place-content:center;text-align:center}.donut b{font:500 12px 'IBM Plex Mono';color:var(--forest)}.donut small{font-size:10px;color:var(--muted);margin-top:4px}.legend{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;font-size:11px;color:var(--muted)}.legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}.bar{display:grid;grid-template-columns:88px 1fr 100px;gap:9px;align-items:center;padding:9px 0;border-bottom:1px dashed var(--line);font-size:12px}.bar>div{height:8px;background:var(--paper2);border-radius:8px;overflow:hidden}.bar i{display:block;height:100%;border-radius:8px}.bar b{font:500 11px 'IBM Plex Mono';text-align:right}.recent{margin-top:16px}.recent h3,.section-head{display:flex;justify-content:space-between}.recent h3 span,.section-head span{font:500 11px Inter;color:var(--muted)}.transaction{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line)}.transaction:last-child{border:0}.transaction>i{width:34px;height:34px;border-radius:8px;display:grid;place-items:center;font-style:normal}.transaction>i.income{background:#dcebdF;color:var(--green)}.transaction>i.expense{background:#f4e1da;color:var(--red)}.transaction>i.saving{background:#f5ebcd;color:var(--gold)}.transaction>div{flex:1}.transaction b,.item b,.loan b{display:block;font-size:13px}.transaction small,.item small,.loan small{display:block;font-size:11px;color:var(--muted);margin-top:3px}.transaction strong{font:500 12px 'IBM Plex Mono'}.text-btn{border:0;background:none;color:var(--red);font-size:12px;margin-left:10px}.item,.loan{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px dashed var(--line)}.loan>div:last-child{text-align:right}.small-btn{font-size:11px;padding:5px 8px;display:block;margin:8px 0 0 auto}.calc-result p{padding:13px 0;border-bottom:1px dashed var(--line);display:flex;justify-content:space-between}.calc-result b{font:500 14px 'IBM Plex Mono';color:var(--forest)}.category{border-bottom:1px dashed var(--line);padding:12px 0}.category>b{font-size:12px;text-transform:uppercase;color:var(--forest)}.category div{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.category span{padding:5px 10px;border-radius:20px;font-size:12px}.category .income{background:#dcebdF;color:var(--green)}.category .expense{background:#f4e1da;color:var(--red)}.category .saving{background:#f5ebcd;color:#846317}.empty{text-align:center;color:var(--muted);padding:35px 0}.overlay{position:fixed;z-index:4;inset:0;background:#0008;display:grid;place-items:center;padding:18px}.modal{position:relative;width:min(440px,100%);background:var(--card);border:1px solid var(--line);padding:24px;border-radius:12px}.close{position:absolute;right:14px;top:9px;border:0;background:none;font-size:25px;color:var(--muted)}@media(max-width:1000px){.budget-kpis{grid-template-columns:repeat(2,1fr)}.dashboard-grid,.two-col{grid-template-columns:1fr}.content{padding:22px}.topbar{padding:16px 22px}}@media(max-width:760px){.app-shell{display:block}.sidebar{position:sticky;top:0;z-index:3;width:100%;height:auto;flex-direction:row;align-items:center;overflow-x:auto;padding:8px;gap:3px;box-shadow:0 2px 10px #0003}.brand{padding:0 7px;margin:0;border:0;flex:none}.brand>div:not(.brand-mark),.nav-label,.sidebar-foot>div{display:none}.nav{flex:none;margin:0;padding:9px 10px;font-size:12px;white-space:nowrap}.nav i{font-size:15px}.sidebar-foot{display:contents}.logout{margin:0;padding:9px 10px}.topbar{min-height:62px;padding:12px 16px;gap:12px}.topbar h2{font-size:19px}.content{padding:16px 12px 36px}.card{padding:15px}.budget-kpis{gap:9px}.budget-kpi{padding:13px}.budget-kpi b{font-size:16px;overflow-wrap:anywhere}.budget-kpi small{font-size:9px}.bar{grid-template-columns:68px 1fr 82px;font-size:11px;gap:6px}.bar b{font-size:10px}.transaction{gap:9px}.transaction>i{width:30px;height:30px}.transaction b{font-size:12px}.transaction strong{font-size:11px}.transaction small{line-height:1.35}.loan,.item{align-items:flex-start;gap:10px}.loan{flex-direction:column}.loan>div:last-child{text-align:left;width:100%}.small-btn{margin-left:0}.modal{padding:21px 16px}.auth-wrap{padding:0}.auth-shell{min-height:100vh;border-radius:0}.auth-side{display:none}.auth-main{padding:30px 22px}.auth-main h2{font-size:24px}}@media(max-width:420px){.budget-kpis{grid-template-columns:1fr}.budget-kpi{min-height:72px}.topbar{align-items:flex-start;flex-direction:column}.topbar .btn{width:100%}.recent h3,.section-head{align-items:flex-start;gap:6px;flex-direction:column}.transaction{align-items:flex-start;flex-wrap:wrap}.transaction>div{min-width:calc(100% - 42px)}.transaction strong{margin-left:42px}.text-btn{margin-left:auto;margin-top:-27px}.bar{grid-template-columns:63px 1fr}.bar b{grid-column:2;text-align:left}.category span{font-size:11px}}`;

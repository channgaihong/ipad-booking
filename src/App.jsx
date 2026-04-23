import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Cloud, Calendar as CalendarIcon, ClipboardList, Settings, LogOut, CheckCircle, XCircle, Info, ShieldAlert, Trash2, Clock, Smartphone, Ban } from 'lucide-react';

// ==========================================
// ⚙️ 全域設定與工具函式
// ==========================================
const slashChar = String.fromCharCode(47);
const quoteChar = String.fromCharCode(34);
const doubleQuote = quoteChar + quoteChar;

const API_URL = ["https:", "", "script.google.com", "macros", "s", "AKfycbxOBNY9x0kCAngFmT4E_PcvwTZuDFh4SjJlmVKsqW8BOMDNJGW0btHDkeu-15OirUE", "exec"].join(slashChar);

const dayMap = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };
const DEFAULT_DISPLAY_ORDER = ['teacher', 'observation', 'className', 'pickupMethod', 'itSupport', 'ipadNumbers', 'remarks'];

const DateUtils = {
  today: () => new Date(),
  toISODate: (date) => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  },
  toChineseDate: (dateStr) => {
    const d = new Date(dateStr);
    return d.getFullYear() + "年 " + (d.getMonth() + 1) + "月 " + d.getDate() + "日 (星期" + dayMap[d.getDay()] + ")";
  }
};

// 使用原生的 Web Crypto API 進行加密，避免編譯依賴錯誤
const hashPassword = async (message) => {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const parseTimeRange = (rangeStr) => {
  if (!rangeStr) return null;
  const matches = rangeStr.match(new RegExp('(\\d{1,2})[:：](\\d{2})\\s*[-~至]\\s*(\\d{1,2})[:：](\\d{2})'));
  if (matches) {
    return { 
      start: parseInt(matches[1], 10) * 60 + parseInt(matches[2], 10), 
      end: parseInt(matches[3], 10) * 60 + parseInt(matches[4], 10) 
    };
  }
  return null;
};

const checkOverlap = (r1, r2) => r1 && r2 && (r1.start < r2.end && r2.start < r1.end);

const getOverlappingSlots = (slotName, currentDb) => {
  if (!currentDb || !currentDb.timeSlots) return [slotName];
  const slot = currentDb.timeSlots.find(s => s.name === slotName);
  if (!slot) return [slotName];
  const myTime = parseTimeRange(slot.timeRange);
  if (!myTime) return [slotName]; 
  
  return currentDb.timeSlots.filter(otherSlot => {
    if (slot.name === otherSlot.name) return true;
    const otherTime = parseTimeRange(otherSlot.timeRange);
    if (otherTime) return checkOverlap(myTime, otherTime);
    return false;
  }).map(s => s.name);
};

const parseIpadNumbers = (str) => {
  if (!str) return [];
  let res = [];
  str.split(',').forEach(p => {
    p = p.trim();
    if (p.includes('-')) {
      let parts = p.split('-');
      let start = parseInt(parts[0], 10); 
      let end = parseInt(parts[1], 10);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) res.push(i.toString());
      }
    } else if (p) {
      res.push(p);
    }
  });
  return Array.from(new Set(res));
};

const stringifyIpadNumbers = (arr) => {
  if (!arr || arr.length === 0) return "";
  arr = Array.from(new Set(arr)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  let res = []; 
  let start = parseInt(arr[0], 10); 
  let prev = start;
  for (let i = 1; i < arr.length; i++) {
    let curr = parseInt(arr[i], 10);
    if (curr === prev + 1) {
      prev = curr;
    } else {
      res.push(start === prev ? start.toString() : (start + "-" + prev));
      start = prev = curr;
    }
  }
  res.push(start === prev ? start.toString() : (start + "-" + prev));
  return res.join(', ');
};

const getUsedIpads = (date, timeSlot, cartId, excludeBookingId, currentDb) => {
  let used = []; 
  const overlappingNames = getOverlappingSlots(timeSlot, currentDb);
  currentDb.bookings.forEach(x => {
    if (x.status === 'assigned' && x.date === date && overlappingNames.includes(x.timeSlot) && x.cartAssignedId == cartId && x.id !== excludeBookingId) {
      used = used.concat(parseIpadNumbers(x.ipadNumbers));
    }
  });
  return used;
};

const checkIsHoliday = (dateStr, currentDb) => {
  if (!currentDb || !currentDb.holidays) return null;
  return currentDb.holidays.find(h => dateStr >= h.startDate && dateStr <= h.endDate);
};

const getNormalMinDate = (currentDb) => {
  let cur = DateUtils.today(); let count = 0;
  while (count < 2) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getDay() !== 0 && cur.getDay() !== 6 && !checkIsHoliday(DateUtils.toISODate(cur), currentDb)) count++;
  }
  return DateUtils.toISODate(cur);
};

const calculateMaxDate = (currentDb) => {
  let cur = DateUtils.today(); let count = 0;
  while (count < 30) {
    cur.setDate(cur.getDate() + 1);
    if (!checkIsHoliday(DateUtils.toISODate(cur), currentDb)) count++;
  }
  return DateUtils.toISODate(cur);
};

const defaultDB = {
  carts: [{ id: 1, name: "充電車 B", capacity: 30, damaged: "" }],
  classes: [{ id: 1, name: "一年甲班", limit: 30 }],
  timeSlots: [{ id: 1, name: "第一節", timeRange: "08:40 - 09:20", quota: 2, remark: "", showRemark: false, applicableDays: [1, 2, 3, 4, 5, 6, 0] }],
  pickupMethods: [{ id: 1, name: "送到課室" }, { id: 2, name: "送到教員室" }, { id: 3, name: "自取" }],
  displaySettings: { teacher: true, className: true, observation: true, ipadNumbers: true, pickupMethod: false, itSupport: false, remarks: false },
  displayOrder: DEFAULT_DISPLAY_ORDER,
  holidays: [], bookings: [], bookingCodes: [], admins: [{ username: 'ckadmin', password: 'ckadmin123' }]
};

// ==========================================
// ⚛️ 主要 React 應用程式組件
// ==========================================
export default function App() {
  const [db, setDb] = useState(defaultDB);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState('schedule');
  const [adminSubPage, setAdminSubPage] = useState('assign');
  const [loggedAdmin, setLoggedAdmin] = useState(sessionStorage.getItem('loggedAdmin') || null);
  const [loggedAdminHash, setLoggedAdminHash] = useState(sessionStorage.getItem('loggedAdminHash') || null);
  
  // Alert Modal 狀態
  const [alertConfig, setAlertConfig] = useState({ show: false, msg: '', title: '', icon: 'ℹ️', type: 'alert', onConfirm: null, onCancel: null });
  // 列印資料狀態
  const [printData, setPrintData] = useState(null);

  // Firebase 狀態
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);
  const [firestoreInstance, setFirestoreInstance] = useState(null);

  const showAlert = (msg, title = "系統提示", icon = "ℹ️") => {
    return new Promise(resolve => {
      setAlertConfig({ show: true, msg, title, icon, type: 'alert', onConfirm: () => { setAlertConfig(prev => ({ ...prev, show: false })); resolve(true); } });
    });
  };

  const showConfirm = (msg, title = "請確認", icon = "⚠️") => {
    return new Promise(resolve => {
      setAlertConfig({
        show: true, msg, title, icon, type: 'confirm',
        onConfirm: () => { setAlertConfig(prev => ({ ...prev, show: false })); resolve(true); },
        onCancel: () => { setAlertConfig(prev => ({ ...prev, show: false })); resolve(false); }
      });
    });
  };

  // 初始化資料庫 (Firebase + GAS)
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      let firebaseWorking = false;
      try {
        const configStr = typeof window.__firebase_config !== 'undefined' ? window.__firebase_config : '{}';
        const config = JSON.parse(configStr);
        if (Object.keys(config).length > 0) {
          const app = initializeApp(config);
          const auth = getAuth(app);
          const fs = getFirestore(app);
          setFirestoreInstance(fs);

          if (typeof window.__initial_auth_token !== 'undefined' && window.__initial_auth_token) {
            await signInWithCustomToken(auth, window.__initial_auth_token);
          } else {
            await signInAnonymously(auth);
          }

          onAuthStateChanged(auth, user => {
            if (user) {
              setIsFirebaseReady(true);
              const appId = typeof window.__app_id !== 'undefined' ? String(window.__app_id).split(slashChar).join('_') : 'ipad-booking-app';
              const docRef = doc(fs, 'artifacts', appId, 'public', 'data', 'ipad_db', 'global_state');
              onSnapshot(docRef, (snapshot) => {
                if (snapshot.exists()) {
                  setDb(snapshot.data());
                  setLoading(false);
                } else {
                  setDoc(docRef, defaultDB);
                  setDb(defaultDB);
                  setLoading(false);
                }
              });
            }
          });
          firebaseWorking = true;
        }
      } catch (e) { 
        console.warn("Firebase fail:", e); 
      }

      if (!firebaseWorking) {
        try {
          const res = await fetch(API_URL);
          const data = await res.json();
          if (data && data.carts) setDb(data);
        } catch (e) {
          showAlert("同步失敗！切換為本地預設模式。", "錯誤", "❌");
        } finally { 
          setLoading(false); 
        }
      }
    };
    initData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🛡️ 雙備援核心寫入機制
  const saveDB = async (updatedDB, showSuccessMessage = false) => {
    setLoading(true);
    let success = false;
    try {
      if (isFirebaseReady && firestoreInstance) {
        const appId = typeof window.__app_id !== 'undefined' ? String(window.__app_id).split(slashChar).join('_') : 'ipad-booking-app';
        const docRef = doc(firestoreInstance, 'artifacts', appId, 'public', 'data', 'ipad_db', 'global_state');
        await setDoc(docRef, updatedDB);
        success = true;
      }
      
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text' + slashChar + 'plain;charset=utf-8' },
        body: JSON.stringify({ action: 'adminSave', payload: updatedDB, auth: { username: loggedAdmin, passwordHash: loggedAdminHash } })
      });
      const result = await response.json();
      if (result && result.status === 'error') throw new Error(result.message);
      
      success = true;
      setDb(updatedDB); // 更新 React State
      if (showSuccessMessage) showAlert("✅ 資料儲存成功並已同步！", "成功", "✅");
    } catch (e) {
      console.error(e);
      showAlert("❌ 資料儲存失敗：" + e.message, "錯誤", "❌");
    } finally {
      setLoading(false);
    }
    return success;
  };

  const handleAdminLogin = async (u, p) => {
    if (!u || !p) return showAlert("請輸入帳號與密碼", "提示", "⚠️");
    setLoading(true);
    try {
      const hashedPwd = await hashPassword(p);
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text' + slashChar + 'plain;charset=utf-8' },
        body: JSON.stringify({ action: 'login', auth: { username: u, passwordHash: hashedPwd } })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setLoggedAdmin(u); setLoggedAdminHash(hashedPwd);
        sessionStorage.setItem('loggedAdmin', u); sessionStorage.setItem('loggedAdminHash', hashedPwd);
        setAdminSubPage('assign');
      } else { 
        showAlert('登入失敗：' + data.message, "錯誤", "❌"); 
      }
    } catch (e) { 
      showAlert("連線錯誤", "錯誤", "❌"); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans relative">
      
      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-sky-200 border-t-sky-500 rounded-full animate-spin mb-4"></div>
          <p className="text-sky-600 font-bold animate-pulse">資料處理中...</p>
        </div>
      )}

      {/* Alert Modal */}
      {alertConfig.show && (
        <div className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-3xl w-full max-w-sm shadow-2xl text-center transform transition-all scale-100">
            <div className="text-6xl mb-4">{alertConfig.icon}</div>
            <h3 className="text-2xl font-extrabold mb-2 text-gray-800">{alertConfig.title}</h3>
            <p className="text-gray-600 mb-8 whitespace-pre-wrap">{alertConfig.msg}</p>
            <div className="flex gap-3">
              {alertConfig.type === 'confirm' && (
                <button onClick={alertConfig.onCancel} className="flex-1 px-6 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition-colors">取消</button>
              )}
              <button onClick={alertConfig.onConfirm} className={`flex-1 px-6 py-3 rounded-xl font-bold shadow-lg text-white transition-colors ${alertConfig.type === 'confirm' ? 'bg-red-600 hover:bg-red-700' : 'bg-sky-600 hover:bg-sky-700'}`}>確定</button>
            </div>
          </div>
        </div>
      )}

      {/* NavBar (Mobile Responsive Updated) */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm no-print">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-2 sm:py-0">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:h-20 items-center gap-3 sm:gap-0">
            <div className="flex items-center justify-between w-full sm:w-auto">
              <div className="flex items-center">
                <Cloud className="w-8 h-8 text-sky-500 mr-2" />
                <span className="text-xl font-bold text-slate-900">iPad 預約系統</span>
              </div>
              <button onClick={() => setActivePage('admin')} className={`sm:hidden p-2 rounded-lg transition-colors ${activePage === 'admin' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Settings className="w-5 h-5" />
              </button>
            </div>
            <div className="flex w-full sm:w-auto justify-between sm:justify-end space-x-2 sm:space-x-4 items-center">
              <button onClick={() => setActivePage('schedule')} className={`flex-1 sm:flex-none whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activePage === 'schedule' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>時間表</button>
              <button onClick={() => setActivePage('booking')} className={`flex-1 sm:flex-none justify-center whitespace-nowrap px-5 py-2 sm:py-2.5 rounded-xl text-sm font-bold shadow-md transition-transform transform hover:-translate-y-0.5 flex items-center gap-2 ${activePage === 'booking' ? 'bg-sky-600 text-white ring-4 ring-sky-200' : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white'}`}><ClipboardList className="w-4 h-4" /> 立即預約</button>
              <button onClick={() => setActivePage('admin')} className={`hidden sm:block whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activePage === 'admin' ? 'bg-slate-900 text-white font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>管理後台</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 md:p-8 no-print">
        {activePage === 'schedule' && <SchedulePage db={db} />}
        {activePage === 'booking' && <BookingPage db={db} saveDB={saveDB} showAlert={showAlert} showConfirm={showConfirm} />}
        {activePage === 'admin' && (
          loggedAdmin ? 
            <AdminPanel db={db} saveDB={saveDB} subPage={adminSubPage} setSubPage={setAdminSubPage} onLogout={() => {setLoggedAdmin(null); setLoggedAdminHash(null); sessionStorage.clear();}} showAlert={showAlert} showConfirm={showConfirm} setPrintData={setPrintData} /> : 
            <AdminLogin onLogin={handleAdminLogin} />
        )}
      </main>
      
      {/* 獨立的 React 列印層 */}
      {printData && <PrintOverlay db={db} printData={printData} onClose={() => setPrintData(null)} />}
    </div>
  );
}

// ==========================================
// 🖨️ 獨立列印預覽層 (PrintOverlay)
// ==========================================
function PrintOverlay({ db, printData, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      try { 
        window.print(); 
      } catch(e) { 
        console.error("列印被瀏覽器阻擋", e); 
      }
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const { date, cartIds } = printData;
  const targetDay = new Date(date).getDay();
  const cartsToPrint = db.carts.filter(c => cartIds.includes(c.id));
  const dayBookings = db.bookings.filter(b => b.date === date && b.status === 'assigned');
  const validSlots = db.timeSlots.filter(s => !s.applicableDays || s.applicableDays.includes(targetDay));

  return (
    <div className="fixed inset-0 bg-slate-300 z-[999999] overflow-y-auto" id="print-overlay-react">
      <style dangerouslySetInnerHTML={{ __html: "@media print { @page { size: A5 landscape; margin: 8mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; margin: 0; padding: 0; } nav, main, #loading-overlay, #custom-alert, #edit-modal, #ipad-selector-modal { display: none !important; } #print-overlay-react { position: relative !important; width: 100% !important; background: white !important; display: block !important; overflow: visible !important; height: auto !important; } .no-print { display: none !important; } .page-break-after { page-break-after: always; break-after: page; } .a5-container { width: 100%; min-height: 125mm; display: flex; flex-direction: column; box-sizing: border-box; box-shadow: none !important; margin: 0 !important; border: 2px solid #1e293b !important; } }" }} />
      <div className="no-print bg-slate-800 p-4 sticky top-0 z-50 flex justify-between items-center shadow-lg">
        <h2 className="text-white text-lg font-bold">列印預覽模式</h2>
        <div className="space-x-3">
          <button onClick={onClose} className="px-5 py-2 bg-slate-600 text-white rounded-lg font-bold shadow hover:bg-slate-500 transition-colors">返回</button>
          <button onClick={() => window.print()} className="px-5 py-2 bg-sky-500 text-white rounded-lg font-bold shadow hover:bg-sky-400 transition-colors">🖨️ 確認列印</button>
        </div>
      </div>
      <div className="p-4 sm:p-8 space-y-8 flex flex-col items-center">
        {cartsToPrint.map((cart, idx) => {
           const cartBookings = dayBookings.filter(x => x.cartAssignedId == cart.id);
           return (
              <div key={cart.id} className={`a5-container p-6 bg-white border-2 border-slate-800 rounded-2xl w-full max-w-[210mm] shadow-xl ${idx !== cartsToPrint.length - 1 ? 'page-break-after' : ''}`}>
                <div className="flex justify-between items-end border-b-2 border-slate-400 pb-2 mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center text-white text-2xl">📱</div>
                    <div>
                      <h2 className="text-2xl font-bold">{cart.name}</h2>
                      <p className="text-sm text-slate-600">{DateUtils.toChineseDate(date)}</p>
                    </div>
                  </div>
                  <div className="text-right"><p className="text-lg font-bold text-slate-700">iPad 借用登記表</p></div>
                </div>
                <table className="w-full border-collapse border border-slate-800 text-xs text-center">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-800 p-2 w-[8%]">節次</th>
                      <th className="border border-slate-800 p-2 w-[14%]">時間</th>
                      <th className="border border-slate-800 p-2 w-[10%]">教師</th>
                      <th className="border border-slate-800 p-2 w-[10%]">班級</th>
                      <th className="border border-slate-800 p-2 w-[6%]">數量</th>
                      <th className="border border-slate-800 p-2 w-[12%]">取機</th>
                      <th className="border border-slate-800 p-2 w-[16%]">iPad 編號</th>
                      <th className="border border-slate-800 p-2">備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validSlots.map(slot => {
                      const bList = cartBookings.filter(x => x.timeSlot === slot.name);
                      if (bList.length === 0) return null;
                      return bList.map(b => (
                        <tr key={b.id} className="h-10">
                          <td className="border border-slate-800 font-bold">{slot.name}</td>
                          <td className="border border-slate-800">{slot.timeRange || ''}</td>
                          <td className="border border-slate-800 font-bold">
                            {b.teacher}
                            {b.observation === '是' && (<span className="text-red-600 font-bold"> (觀課)</span>)}
                          </td>
                          <td className="border border-slate-800">{b.className}</td>
                          <td className="border border-slate-800 font-bold">{b.peopleCount}</td>
                          <td className="border border-slate-800">{b.pickupMethod || ''}</td>
                          <td className="border border-slate-800 text-[10px] break-words max-w-[150px] p-1 leading-tight">{b.ipadNumbers || ''}</td>
                          <td className="border border-slate-800 text-left px-1 text-[10px]">{b.remarks || ''}</td>
                        </tr>
                      ));
                    })}
                    {cartBookings.length === 0 && (
                      <tr><td colSpan="8" className="border border-slate-800 p-4 text-center text-slate-500 font-bold">本日該車無分配紀錄</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
           );
        })}
      </div>
    </div>
  );
}

// ==========================================
// 📅 頁面 1：每日時間表 (SchedulePage)
// ==========================================
function SchedulePage({ db }) {
  const [date, setDate] = useState(DateUtils.toISODate(DateUtils.today()));
  
  const targetDay = new Date(date).getDay();
  const dayBookings = db.bookings.filter(b => b.date === date && b.status === 'assigned');
  const validSlots = db.timeSlots.filter(s => !s.applicableDays || s.applicableDays.includes(targetDay));
  const ds = db.displaySettings || { teacher: true, className: true };
  const displayOrder = db.displayOrder || DEFAULT_DISPLAY_ORDER;

  return (
    <div className="animate-fade-in">
      <div className="bg-white p-5 sm:p-6 rounded-2xl border shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="text-xl font-bold flex items-center text-slate-800"><CalendarIcon className="w-5 h-5 mr-2 text-sky-600" /> 每日充電車時間表</h2>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-4 py-2 border rounded-lg font-bold outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50" />
        </div>
        
        <div className="overflow-x-auto custom-scrollbar pb-2">
          {/* 加入 table-fixed 強制平分寬度 */}
          <table className="w-full table-fixed text-sm text-center border-collapse min-w-[800px]">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-3 border-b text-left w-32 md:w-40">節次 \ 車輛</th>
                {db.carts.map(c => <th key={c.id} className="p-3 border-b font-bold px-2">{c.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {validSlots.length === 0 ? (
                <tr><td colSpan={db.carts.length + 1} className="p-6 text-slate-500">本日無開放借用時段</td></tr>
              ) : (
                validSlots.map(slot => (
                  <tr key={slot.id} className="hover:bg-slate-50 border-b last:border-0">
                    <td className="p-3 font-bold text-left border-r bg-white sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      {slot.name} <span className="text-xs text-slate-400 block font-normal">{slot.timeRange}</span>
                    </td>
                    {db.carts.map(cart => {
                      const bList = dayBookings.filter(x => x.cartAssignedId == cart.id && x.timeSlot === slot.name);
                      return (
                        <td key={cart.id} className="p-2 border-r last:border-0 align-top">
                          {bList.length > 0 ? bList.map((b, i) => (
                            <div key={b.id} className={`p-2 rounded-lg text-center mb-2 last:mb-0 shadow-sm border flex flex-col items-center gap-0.5 ${['bg-sky-50 border-sky-200 text-sky-900', 'bg-emerald-50 border-emerald-200 text-emerald-900', 'bg-purple-50 border-purple-200 text-purple-900'][i % 3]}`}>
                              {displayOrder.map(key => {
                                  if (!ds[key]) return null;
                                  switch(key) {
                                      case 'teacher': return b.teacher ? <div key="teacher" className="font-bold text-sm leading-tight">{b.teacher}</div> : null;
                                      case 'observation': return b.observation === '是' ? <div key="obs"><span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded animate-pulse">觀課</span></div> : null;
                                      case 'className': return b.className ? <div key="class" className="text-xs">{b.className}</div> : null;
                                      case 'pickupMethod': return b.pickupMethod ? <div key="pickup" className="text-[10px] text-slate-600">📦 {b.pickupMethod}</div> : null;
                                      case 'itSupport': return b.itSupport === '是' ? <div key="it" className="text-[10px] text-blue-700 font-bold">💻 需 IT</div> : null;
                                      case 'ipadNumbers': return b.ipadNumbers ? <div key="ipad" className="text-[10px] bg-white/70 rounded px-1 py-0.5 font-mono truncate max-w-full" title={b.ipadNumbers}>📱 {b.ipadNumbers}</div> : null;
                                      case 'remarks': return b.remarks ? <div key="rmk" className="text-[10px] text-slate-500 italic truncate max-w-full" title={b.remarks}>📝 {b.remarks}</div> : null;
                                      default: return null;
                                  }
                              })}
                            </div>
                          )) : <span className="text-slate-300 text-xs">空閒</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 📝 頁面 2：預約登記 (BookingPage)
// ==========================================
function BookingPage({ db, saveDB, showAlert, showConfirm }) {
  const [formData, setForm] = useState({ teacher: '', mode: 'single', singleDate: '', batchDates: [], pickup: '送到課室', it: '否', obs: '否', remarks: '', authCode: '', isUrgent: false });
  const [selectedSlots, setSelectedSlots] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [batchInputType, setBatchInputType] = useState('custom');
  const [tempBatchDate, setTempBatchDate] = useState('');
  const [tempRangeStart, setTempRangeStart] = useState('');
  const [tempRangeEnd, setTempRangeEnd] = useState('');

  const normalMinDate = useMemo(() => getNormalMinDate(db), [db.holidays]);
  const maxDate = useMemo(() => calculateMaxDate(db), [db.holidays]);
  const minAllowedDate = formData.isUrgent ? DateUtils.toISODate(DateUtils.today()) : normalMinDate;

  const getAvailableSlots = () => {
    let dates = formData.mode === 'single' ? (formData.singleDate ? [formData.singleDate] : []) : formData.batchDates;
    if (dates.length === 0) return [];
    
    const targetDays = dates.map(d => new Date(d).getDay());
    const validSlots = db.timeSlots.filter(s => !s.applicableDays || targetDays.some(td => s.applicableDays.includes(td)));
    
    return validSlots.map(slot => {
        const overlaps = getOverlappingSlots(slot.name, db);
        let maxDbUsed = 0;
        dates.forEach(d => {
            const used = db.bookings.filter(b => b.date === d && overlaps.includes(b.timeSlot) && b.status !== 'rejected' && b.status !== 'cancelled').length;
            if (used > maxDbUsed) maxDbUsed = used;
        });
        
        let currentUiUsed = 0;
        Object.keys(selectedSlots).forEach(selectedSlotName => {
            if(overlaps.includes(selectedSlotName)) currentUiUsed++;
        });

        const baseRemain = (slot.quota || db.carts.length) - maxDbUsed;
        const finalRemain = baseRemain - (selectedSlots[slot.name] ? currentUiUsed - 1 : currentUiUsed);

        return { ...slot, isFull: finalRemain <= 0, remain: finalRemain, isSelected: !!selectedSlots[slot.name] };
    });
  };

  const availableSlots = getAvailableSlots();
  const needsAuthCode = (formData.mode === 'single' ? [formData.singleDate] : formData.batchDates).some(d => d && d < normalMinDate);

  const toggleSlot = (slotName) => {
    setForm(p => {
        const slotObj = db.timeSlots.find(s => s.name === slotName);
        let newRemarks = p.remarks;
        if(slotObj?.showRemark && slotObj.remark && !newRemarks.includes(slotObj.remark)) {
            newRemarks = newRemarks ? newRemarks + '\n' + slotObj.remark : slotObj.remark;
        }
        return {...p, remarks: newRemarks};
    });

    setSelectedSlots(prev => {
        const next = { ...prev };
        if (next[slotName]) delete next[slotName];
        else next[slotName] = { class: db.classes[0]?.name, people: db.classes[0]?.limit || 30 };
        return next;
    });
  };

  const updateSlotDetail = (slotName, field, val) => {
    setSelectedSlots(prev => {
        const updated = { ...prev };
        updated[slotName][field] = val;
        if (field === 'class') {
            const limit = db.classes.find(c => c.name === val)?.limit || 30;
            updated[slotName].people = limit;
        }
        return updated;
    });
  };

  const handleAddBatchDate = () => {
    const d = tempBatchDate;
    if (!d) return;
    if (d > maxDate) return showAlert(`超出可預約範圍 (最遠至 ${maxDate})`);
    if (d < minAllowedDate) return showAlert("該日期需要開啟緊急預約");
    const hol = checkIsHoliday(d, db);
    if (hol) return showAlert(`停借日: ${hol.remark}`);
    if (!formData.batchDates.includes(d)) {
      setForm(p => ({...p, batchDates: [...p.batchDates, d]}));
      setTempBatchDate('');
    }
  };

  const handleGenerateBatchRange = () => {
    const startStr = tempRangeStart;
    const endStr = tempRangeEnd;
    
    if(!startStr || !endStr) return showAlert("請選擇開始與結束日期！", "提示", "⚠️");
    if(startStr > endStr) return showAlert("開始日期不能大於結束日期！", "錯誤", "❌");
    if (endStr > maxDate) return showAlert(`超出可預約範圍 (系統最遠開放至 ${maxDate})`, "錯誤", "❌");

    let current = new Date(startStr); 
    const end = new Date(endStr); 
    let addedCount = 0;
    let newDates = [...formData.batchDates];

    while(current <= end) {
        const dStr = DateUtils.toISODate(current);
        if(current.getDay() !== 0 && current.getDay() !== 6 && !checkIsHoliday(dStr, db) && !newDates.includes(dStr)) {
            newDates.push(dStr); 
            addedCount++;
        }
        current.setDate(current.getDate() + 1);
    }
    
    if(addedCount === 0) { 
      showAlert("⚠️ 範圍內無有效工作日。", "提示", "⚠️"); 
    } else {
      setForm(p => ({...p, batchDates: newDates}));
    }
  };

  const submitBooking = async () => {
      if (!formData.teacher) return showAlert("請輸入教師姓名", "錯誤", "❌");
      const dates = formData.mode === 'single' ? [formData.singleDate] : formData.batchDates;
      if (!dates[0]) return showAlert("請選擇借用日期", "錯誤", "❌");
      if (Object.keys(selectedSlots).length === 0) return showAlert("請勾選預約時段", "錯誤", "❌");

      let usedCodesPayload = [];
      if (needsAuthCode) {
          if (!formData.authCode) return showAlert("緊急預約需輸入 6 碼授權碼", "錯誤", "🚨");
          const codeObj = db.bookingCodes.find(c => c.code === formData.authCode.toUpperCase() && !c.used);
          if (!codeObj) return showAlert("授權碼無效或已被使用", "錯誤", "❌");
          usedCodesPayload.push({ code: codeObj.code, usedBy: formData.teacher, usedAt: new Date().toISOString() });
      }

      let newBookings = [];
      for (let slotName of Object.keys(selectedSlots)) {
          const detail = selectedSlots[slotName];
          if (!detail.people) return showAlert(`請輸入 ${slotName} 的借用人數`);
          const classLimit = db.classes.find(c => c.name === detail.class)?.limit || 30;
          if (detail.people > classLimit) return showAlert(`${slotName} 人數超出班級上限(${classLimit})`);

          for (let d of dates) {
              if (db.bookings.some(b => b.date === d && b.timeSlot === slotName && b.className === detail.class && b.status !== 'cancelled' && b.status !== 'rejected')) {
                  return showAlert(`日期 ${d} 的 [${slotName}] 班級【${detail.class}】已有紀錄，無法重複預約！`);
              }
              newBookings.push({
                  id: Date.now().toString() + Math.floor(Math.random()*1000),
                  teacher: formData.teacher, date: d, timeSlot: slotName, className: detail.class, peopleCount: detail.people,
                  pickupMethod: formData.pickup, itSupport: formData.it, observation: formData.obs, remarks: formData.remarks,
                  status: 'pending', timestamp: new Date().toISOString()
              });
          }
      }

      const updatedDB = { ...db };
      updatedDB.bookings = [...db.bookings, ...newBookings];
      if (usedCodesPayload.length > 0) {
          const cIndex = updatedDB.bookingCodes.findIndex(c => c.code === usedCodesPayload[0].code);
          if (cIndex > -1) {
              updatedDB.bookingCodes[cIndex].used = true;
              updatedDB.bookingCodes[cIndex].usedBy = formData.teacher;
          }
      }

      const success = await saveDB(updatedDB);
      if (success) {
          showAlert(`✅ 預約已送出！共建立 ${newBookings.length} 筆預約。`, "成功", "🎉");
          setForm({ teacher: '', mode: 'single', singleDate: '', batchDates: [], pickup: '送到課室', it: '否', obs: '否', remarks: '', authCode: '', isUrgent: false });
          setSelectedSlots({});
      }
  };

  const cancelBooking = async (id) => {
      const ok = await showConfirm("確定要取消這筆預約嗎？名額將重新釋放。");
      if (!ok) return;
      const updatedDB = { ...db };
      const b = updatedDB.bookings.find(x => x.id === id);
      if (b) b.status = 'cancelled';
      await saveDB(updatedDB);
  };

  const myBookings = db.bookings.filter(b => b.teacher.toLowerCase().includes(searchQuery.toLowerCase()) && b.date >= DateUtils.toISODate(DateUtils.today())).sort((a,b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in">
        {/* 表單區塊 */}
        <div className="bg-white p-6 md:p-8 rounded-2xl border shadow-lg lg:col-span-5">
            <h2 className="text-2xl font-extrabold mb-6 flex items-center"><ClipboardList className="w-6 h-6 mr-2 text-sky-600" /> 新建預約申請</h2>
            <div className="space-y-5">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">教師姓名 <span className="text-red-500">*</span></label>
                    <input type="text" value={formData.teacher} onChange={(e) => setForm({...formData, teacher: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none" placeholder="請輸入姓名" />
                </div>
                
                <div className="flex p-1 bg-slate-100 rounded-xl">
                    <button onClick={() => setForm({...formData, mode: 'single'})} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${formData.mode === 'single' ? 'bg-white shadow text-sky-600' : 'text-slate-500'}`}>單次預約</button>
                    <button onClick={() => setForm({...formData, mode: 'batch'})} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${formData.mode === 'batch' ? 'bg-white shadow text-sky-600' : 'text-slate-500'}`}>多日批量</button>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex justify-between items-center mb-3">
                        <label className="text-sm font-bold text-slate-700">選擇日期 <span className="text-red-500">*</span></label>
                        <label className="flex items-center text-xs text-red-600 font-bold bg-red-100/50 px-2 py-1 rounded cursor-pointer border border-red-200 hover:bg-red-100 transition-colors">
                            <input type="checkbox" checked={formData.isUrgent} onChange={(e) => {
                                const isUrgent = e.target.checked;
                                const newMinDate = isUrgent ? DateUtils.toISODate(DateUtils.today()) : normalMinDate;
                                setForm(p => {
                                  let newSingle = p.singleDate;
                                  if (!isUrgent && newSingle && newSingle < newMinDate) newSingle = '';
                                  let newBatch = p.batchDates.filter(d => isUrgent || d >= newMinDate);
                                  return {...p, isUrgent, singleDate: newSingle, batchDates: newBatch};
                                });
                            }} className="mr-1.5 accent-red-600 w-3.5 h-3.5" /> 緊急預約
                        </label>
                    </div>
                    {formData.mode === 'single' ? (
                        <input type="date" min={minAllowedDate} max={maxDate} value={formData.singleDate} onChange={(e) => {
                            const dStr = e.target.value;
                            setForm({...formData, singleDate: dStr});
                            if (dStr) {
                                const hol = checkIsHoliday(dStr, db);
                                if (hol) showAlert(`⚠️ 停借日: ${hol.remark}`);
                            }
                        }} className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-sky-400" />
                    ) : (
                        <div>
                            <div className="flex space-x-3 mb-3">
                                <label className="flex items-center text-xs sm:text-sm font-bold cursor-pointer transition-colors text-sky-700">
                                    <input type="radio" checked={batchInputType === 'custom'} onChange={() => setBatchInputType('custom')} className="mr-1 accent-sky-600" /> 挑選特定日期
                                </label>
                                <label className="flex items-center text-xs sm:text-sm font-bold cursor-pointer transition-colors text-slate-500">
                                    <input type="radio" checked={batchInputType === 'range'} onChange={() => setBatchInputType('range')} className="mr-1 accent-sky-600" /> 連續範圍
                                </label>
                            </div>
                            
                            {batchInputType === 'custom' ? (
                              <div className="flex space-x-2 mb-3">
                                  <input type="date" value={tempBatchDate} onChange={e=>setTempBatchDate(e.target.value)} min={minAllowedDate} max={maxDate} className="flex-grow px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-400" />
                                  <button onClick={handleAddBatchDate} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold shadow hover:bg-slate-700 whitespace-nowrap">加入</button>
                              </div>
                            ) : (
                              <div className="flex flex-col sm:flex-row gap-2 mb-3 items-center">
                                  <input type="date" value={tempRangeStart} onChange={e=>setTempRangeStart(e.target.value)} min={minAllowedDate} max={maxDate} className="w-full sm:flex-grow px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-400" placeholder="開始日期" />
                                  <span className="text-slate-500 text-sm font-bold hidden sm:inline">至</span>
                                  <input type="date" value={tempRangeEnd} onChange={e=>setTempRangeEnd(e.target.value)} min={minAllowedDate} max={maxDate} className="w-full sm:flex-grow px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-400" placeholder="結束日期" />
                                  <button onClick={handleGenerateBatchRange} className="w-full sm:w-auto px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-sky-700 whitespace-nowrap">套用產生</button>
                              </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {formData.batchDates.map(d => (
                                    <span key={d} className="bg-sky-100 text-sky-700 px-3 py-1 rounded-full text-xs font-bold border border-sky-200 flex items-center">
                                      {d} 
                                      <button onClick={() => setForm(p => ({...p, batchDates: p.batchDates.filter(x => x !== d)}))} className="ml-1.5 hover:text-red-500"><XCircle className="w-3.5 h-3.5" /></button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* 動態時段顯示 */}
                {availableSlots.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                        {availableSlots.map(slot => (
                            <div key={slot.name} className={`border rounded-xl p-3 shadow-sm transition-colors ${slot.isSelected ? 'bg-sky-50 border-sky-300' : 'bg-white hover:border-sky-300'} ${slot.isFull && !slot.isSelected ? 'opacity-60 bg-slate-50' : ''}`}>
                                <label className="flex items-center cursor-pointer">
                                    <input type="checkbox" checked={slot.isSelected} disabled={slot.isFull && !slot.isSelected} onChange={() => toggleSlot(slot.name)} className="mr-2.5 w-4 h-4 accent-sky-600" />
                                    <span className={`text-sm font-bold ${slot.isFull && !slot.isSelected ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                      {slot.name} <span className="text-[10px] text-slate-500 block sm:inline font-normal mt-0.5 sm:mt-0">({slot.isFull && !slot.isSelected ? '額滿' : `剩${slot.remain}`})</span>
                                    </span>
                                </label>
                                {slot.isSelected && (
                                    <div className="mt-3 space-y-2 border-t border-sky-100 pt-2 animate-fade-in">
                                        <select value={selectedSlots[slot.name]?.class || ''} onChange={(e) => updateSlotDetail(slot.name, 'class', e.target.value)} className="w-full text-xs border border-sky-200 rounded py-1.5 px-2 outline-none focus:ring-1 focus:ring-sky-400 bg-white">
                                            {db.classes.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                        </select>
                                        <input type="number" value={selectedSlots[slot.name]?.people || ''} onChange={(e) => updateSlotDetail(slot.name, 'people', parseInt(e.target.value, 10))} className="w-full text-xs border border-sky-200 rounded py-1.5 px-2 outline-none focus:ring-1 focus:ring-sky-400" min="1" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {needsAuthCode && (
                    <div className="bg-red-50 p-4 rounded-xl border border-red-200 shadow-inner flex items-start gap-3 animate-fade-in">
                        <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                        <div className="w-full">
                            <label className="block text-sm font-bold text-red-800 mb-1">緊急授權碼 <span className="text-red-500">*</span></label>
                            <input type="text" value={formData.authCode} onChange={(e) => setForm({...formData, authCode: e.target.value})} className="w-full px-3 py-2 border border-red-300 bg-white rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-mono uppercase text-red-900 tracking-widest text-center" placeholder="輸入 6 碼" />
                        </div>
                    </div>
                )}

                <div className="pt-4 border-t border-slate-200 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">取機方式</label>
                      <select value={formData.pickup} onChange={(e) => setForm({...formData, pickup: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-400">
                        {db.pickupMethods.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">需 IT 協助？</label>
                      <select value={formData.it} onChange={(e) => setForm({...formData, it: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-400">
                        <option value="否">否</option><option value="是">是</option>
                      </select>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-xs font-bold text-slate-700 mb-1">觀課？</label>
                      <select value={formData.obs} onChange={(e) => setForm({...formData, obs: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-400">
                        <option value="否">否</option><option value="是">是</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">備註</label>
                      <textarea value={formData.remarks} onChange={(e) => setForm({...formData, remarks: e.target.value})} rows="3" className="w-full px-4 py-2 bg-slate-50 border rounded-xl outline-none text-sm focus:ring-2 focus:ring-sky-400" placeholder="備註需求..."></textarea>
                    </div>
                </div>

                <button onClick={submitBooking} className="w-full bg-sky-600 text-white py-3.5 rounded-xl font-extrabold shadow-lg text-lg hover:bg-sky-700 transition-all transform hover:-translate-y-0.5 flex justify-center items-center gap-2"><CheckCircle className="w-5 h-5" /> 送出預約申請</button>
            </div>
        </div>

        {/* 查詢清單區塊 */}
        <div className="bg-white p-6 md:p-8 rounded-2xl border shadow-sm lg:col-span-7 flex flex-col h-full">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-3">
                <h3 className="text-xl font-extrabold text-slate-800">⏱️ 預約記錄查詢</h3>
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="🔍 搜尋教師姓名..." className="w-full sm:w-64 px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 space-y-3 max-h-[600px]">
                {myBookings.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200"><Info className="w-8 h-8 mx-auto mb-2 opacity-50" /> 輸入姓名查詢近期紀錄</div>
                ) : (
                    myBookings.map(b => (
                        <div key={b.id} className="p-4 border bg-white rounded-2xl shadow-sm flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-4 hover:border-sky-200 transition-colors">
                            <div>
                                <div className="font-extrabold text-slate-800 text-base">
                                  {b.teacher} 
                                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full ml-1 font-bold">{b.className}</span> 
                                  {b.observation === '是' && (<span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded ml-1 font-bold">觀課</span>)}
                                </div>
                                <div className="text-sm text-slate-500 mt-1 font-medium flex items-center gap-1.5"><CalendarIcon className="w-3.5 h-3.5" /> {b.date} <Clock className="w-3.5 h-3.5 ml-1" /> {b.timeSlot}</div>
                                {b.remarks && (<div className="text-xs text-sky-600 mt-2 bg-sky-50 px-2 py-1 rounded inline-block">備註: {b.remarks}</div>)}
                            </div>
                            <div className="text-right flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-lg">
                                {b.status === 'assigned' && (<span className="text-emerald-600 font-extrabold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 shadow-sm flex items-center gap-1">✅ {b.cartAssignedName} <span className="text-xs font-normal text-emerald-700 block ml-1">{b.ipadNumbers && (`📱${b.ipadNumbers}`)}</span></span>)}
                                {b.status === 'rejected' && (<span className="text-red-500 font-bold bg-red-50 px-2 py-1 rounded-lg">❌ 已退回</span>)}
                                {b.status === 'cancelled' && (<span className="text-slate-400 font-bold">⛔ 已取消</span>)}
                                {b.status === 'pending' && (<span className="text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 shadow-sm">⏳ 待處理</span>)}
                                
                                {b.status === 'pending' && (<button onClick={() => cancelBooking(b.id)} className="text-xs px-3 py-1.5 bg-white text-red-500 border border-red-200 rounded-lg hover:bg-red-50 font-bold shadow-sm transition-colors w-full sm:w-auto">取消預約</button>)}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
     </div>
  );
}

// ==========================================
// 🔒 頁面 3：管理員登入 (AdminLogin)
// ==========================================
function AdminLogin({ onLogin }) {
  const [u, setU] = useState(''); const [p, setP] = useState('');
  return (
    <div className="max-w-md mx-auto mt-16 bg-white p-8 rounded-3xl border shadow-2xl animate-fade-in">
        <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg"><Settings className="w-8 h-8 text-white" /></div>
        <h2 className="text-2xl font-extrabold text-center mb-8 text-slate-800">管理後台登入</h2>
        <div className="space-y-4">
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1 uppercase tracking-wider">Username</label>
                <input type="text" value={u} onChange={(e) => setU(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 transition-shadow font-medium" placeholder="管理員帳號" />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1 uppercase tracking-wider">Password</label>
                <input type="password" value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onLogin(u,p)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 transition-shadow font-medium" placeholder="密碼" />
            </div>
            <button onClick={() => onLogin(u, p)} className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-extrabold shadow-lg hover:bg-slate-800 transition-all transform hover:-translate-y-0.5 mt-4">登入系統</button>
        </div>
    </div>
  );
}

// ==========================================
// ⚙️ 頁面 4：管理後台 (AdminPanel) 包含左右選單
// ==========================================
function AdminPanel({ db, saveDB, subPage, setSubPage, onLogout, showAlert, showConfirm, setPrintData }) {
  const [editModal, setEditModal] = useState({ show: false, type: null, index: null, data: null });

  const exportExcel = () => {
    if(!db.bookings || db.bookings.length === 0) return showAlert("沒有預約紀錄可供匯出！");
    const statusMap = { 'pending': '待處理', 'assigned': '已分配', 'rejected': '已退回', 'cancelled': '已取消' };
    
    let csvContent = "申請時間,教師姓名,借用日期,時段,班級,借用人數,取機方式,IT協助,觀課,狀態,分配車輛,iPad編號,備註\n";
    
    [...db.bookings].sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(b => {
        let ipadStr = b.ipadNumbers ? quoteChar + String(b.ipadNumbers) + quoteChar : '';
        let remStr = b.remarks ? quoteChar + String(b.remarks).split(quoteChar).join(doubleQuote) + quoteChar : '';
        const row = [
            b.timestamp ? b.timestamp.split('T').join(' ').substring(0, 19) : '',
            b.teacher || '',
            b.date || '',
            b.timeSlot || '',
            b.className || '',
            b.peopleCount || '',
            b.pickupMethod || '',
            b.itSupport || '',
            b.observation || '否',
            statusMap[b.status] || b.status,
            b.cartAssignedName || '',
            ipadStr,
            remStr
        ];
        csvContent += row.join(',') + "\n";
    });

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text' + slashChar + 'csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "iPad預約年度紀錄_" + DateUtils.toISODate(new Date()) + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const backupSystem = () => {
    const dataStr = "data:text" + slashChar + "json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "iPad_System_Backup_" + DateUtils.toISODate(new Date()) + ".json");
    dlAnchorElem.click();
  };

  const clearData = async () => {
      const ok = await showConfirm("⚠️ 嚴重警告：此操作將永久刪除所有預約紀錄！\n確定要清空嗎？", "清空歷史紀錄", "🚨");
      if (ok) {
          const uDb = {...db, bookings: []};
          await saveDB(uDb, true);
      }
  };

  const openEdit = (type, index) => {
      let data = type === 'bookings' ? { ...db.bookings.find(x => x.id === index) } : { ...db[type][index] };
      setEditModal({ show: true, type, index, data });
  };

  const closeEdit = () => setEditModal({ show: false, type: null, index: null, data: null });

  const saveEdit = async () => {
      const uDb = { ...db };
      if (editModal.type === 'bookings') {
          const bIndex = uDb.bookings.findIndex(x => x.id === editModal.index);
          if (bIndex > -1) {
              const b = uDb.bookings[bIndex];
              const newStatus = editModal.data.status;
              const cid = editModal.data.cartAssignedId;
              const ipadStr = editModal.data.ipadNumbers;

              if (cid && newStatus === 'assigned') {
                  const cart = uDb.carts.find(c => c.id == cid);
                  let damaged = (cart.damaged || "").split(',').map(x => x.trim()).filter(x => x);
                  let parsedIpads = parseIpadNumbers(ipadStr).filter(num => !damaged.includes(num));
                  let usedIpads = getUsedIpads(b.date, b.timeSlot, cid, b.id, uDb);
                  let conflicts = parsedIpads.filter(num => usedIpads.includes(num));
                  if (conflicts.length > 0) {
                      showAlert(`❌ 儲存失敗：編號 (${conflicts.join(', ')}) 已被分配！`);
                      return;
                  }
                  b.cartAssignedId = cid;
                  b.cartAssignedName = cart ? cart.name : '';
                  b.ipadNumbers = stringifyIpadNumbers(parsedIpads);
              } else {
                  b.cartAssignedId = null;
                  b.cartAssignedName = null;
                  b.ipadNumbers = ipadStr;
              }
              b.status = newStatus;
              b.observation = editModal.data.observation;
              b.pickupMethod = editModal.data.pickupMethod;
          }
      } else {
          uDb[editModal.type][editModal.index] = editModal.data;
          if (editModal.type === 'admins' && editModal.data.newPassword) {
              uDb.admins[editModal.index].password = await hashPassword(editModal.data.newPassword);
              delete uDb.admins[editModal.index].newPassword;
          }
      }
      await saveDB(uDb, true);
      closeEdit();
  };

  const NavButton = ({ id, icon, label, bgActive = 'bg-slate-900 text-white shadow-md' }) => {
      const isActive = subPage === id;
      return (
        <button onClick={() => setSubPage(id)} className={`text-left px-4 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-3 ${isActive ? bgActive : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
            <span className="text-lg">{icon}</span> {label}
        </button>
      );
  };

  return (
    <div className="animate-fade-in">
      <header className="mb-6 sm:mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3"><Settings className="w-8 h-8 text-sky-600" /> 管理系統後台</h1>
      </header>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* 左側選單 */}
        <div className="w-full lg:w-64 flex-shrink-0 flex flex-col gap-2">
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1 mt-2 px-2">主要作業</div>
            <NavButton id="assign" icon="📋" label="分配與列印" />
            
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1 mt-6 px-2">系統設定</div>
            <NavButton id="display" icon="🖥️" label="總覽表顯示" />
            <NavButton id="timeslots" icon="⏱️" label="時段與名額" />
            <NavButton id="classes" icon="🏫" label="班級與人數" />
            <NavButton id="carts" icon="🔋" label="充電車設備" />
            <NavButton id="pickups" icon="📦" label="取機方式" />
            <NavButton id="codes" icon="🔑" label="預約授權碼" />
            <NavButton id="holidays" icon="🏖️" label="停借日設定" />
            <NavButton id="admins" icon="👨‍💻" label="管理員帳號" />

            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1 mt-6 px-2">進階操作</div>
            <button onClick={exportExcel} className="text-left px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-bold shadow-sm hover:bg-emerald-100 transition-colors flex items-center gap-3"><span className="text-lg">📥</span> 匯出 Excel</button>
            <button onClick={backupSystem} className="text-left px-4 py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-sm font-bold shadow-sm hover:bg-blue-100 transition-colors flex items-center gap-3"><span className="text-lg">💾</span> 系統備份</button>
            <button onClick={clearData} className="text-left px-4 py-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-bold shadow-sm hover:bg-red-100 transition-colors flex items-center gap-3"><span className="text-lg">⚠️</span> 清理歷史紀錄</button>
            
            <button onClick={onLogout} className="text-left px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold mt-4 hover:bg-slate-200 transition-colors flex justify-center items-center gap-2 border border-slate-200"><LogOut className="w-4 h-4" /> 安全登出</button>
        </div>

        {/* 右側內容區塊 */}
        <div className="flex-grow min-w-0">
            {subPage === 'assign' && <AdminAssign db={db} saveDB={saveDB} showAlert={showAlert} showConfirm={showConfirm} setPrintData={setPrintData} openEdit={openEdit} />}
            {subPage === 'display' && <AdminDisplay db={db} saveDB={saveDB} showAlert={showAlert} />}
            {subPage === 'timeslots' && <AdminTimeSlots db={db} saveDB={saveDB} showAlert={showAlert} showConfirm={showConfirm} openEdit={openEdit} />}
            {subPage === 'classes' && <AdminClasses db={db} saveDB={saveDB} showAlert={showAlert} showConfirm={showConfirm} openEdit={openEdit} />}
            {subPage === 'carts' && <AdminCarts db={db} saveDB={saveDB} showAlert={showAlert} showConfirm={showConfirm} openEdit={openEdit} />}
            {subPage === 'pickups' && <AdminPickups db={db} saveDB={saveDB} showAlert={showAlert} showConfirm={showConfirm} openEdit={openEdit} />}
            {subPage === 'codes' && <AdminCodes db={db} saveDB={saveDB} showAlert={showAlert} showConfirm={showConfirm} />}
            {subPage === 'holidays' && <AdminHolidays db={db} saveDB={saveDB} showAlert={showAlert} showConfirm={showConfirm} />}
            {subPage === 'admins' && <AdminAdmins db={db} saveDB={saveDB} showAlert={showAlert} showConfirm={showConfirm} openEdit={openEdit} />}
        </div>
      </div>

      {/* 統一編輯 Modal */}
      {editModal.show && (
          <div className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
              <div className="bg-white p-6 md:p-8 rounded-3xl w-full max-w-md shadow-2xl">
                  <h3 className="text-xl font-extrabold mb-4 border-b border-slate-100 pb-3 text-slate-800">編輯項目</h3>
                  <div className="space-y-4 mt-4">
                      {editModal.type === 'bookings' && (
                          <>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">預約狀態</label>
                                <select value={editModal.data.status} onChange={e=>setEditModal(p=>({...p, data:{...p.data, status: e.target.value}}))} className="w-full p-2.5 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-sky-400">
                                    <option value="pending">待處理</option>
                                    <option value="assigned">已分配</option>
                                    <option value="rejected">已退回</option>
                                    <option value="cancelled">已取消</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">分配車輛</label>
                                <select value={editModal.data.cartAssignedId || ''} onChange={e=>setEditModal(p=>({...p, data:{...p.data, cartAssignedId: e.target.value}}))} className="w-full p-2.5 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-sky-400">
                                    <option value="">-- 無車輛 --</option>
                                    {db.carts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">iPad 編號</label>
                                <input type="text" value={editModal.data.ipadNumbers || ''} onChange={e=>setEditModal(p=>({...p, data:{...p.data, ipadNumbers: e.target.value}}))} className="w-full p-2.5 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-sky-400 font-mono" placeholder="例如: 1-30"/>
                              </div>
                          </>
                      )}
                      {editModal.type === 'timeSlots' && (
                          <>
                              <div><label className="block text-xs font-bold text-slate-700 mb-1">時段名稱</label><input type="text" value={editModal.data.name} onChange={e=>setEditModal(p=>({...p, data:{...p.data, name: e.target.value}}))} className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400" /></div>
                              <div><label className="block text-xs font-bold text-slate-700 mb-1">時間範圍</label><input type="text" value={editModal.data.timeRange} onChange={e=>setEditModal(p=>({...p, data:{...p.data, timeRange: e.target.value}}))} className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400" /></div>
                              <div><label className="block text-xs font-bold text-slate-700 mb-1">名額</label><input type="number" value={editModal.data.quota} onChange={e=>setEditModal(p=>({...p, data:{...p.data, quota: parseInt(e.target.value, 10)}}))} className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400" /></div>
                              <div><label className="block text-xs font-bold text-slate-700 mb-1">備註</label><textarea value={editModal.data.remark || ''} onChange={e=>setEditModal(p=>({...p, data:{...p.data, remark: e.target.value}}))} className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400" rows={2}></textarea></div>
                          </>
                      )}
                      {editModal.type === 'classes' && (
                          <>
                              <div><label className="block text-xs font-bold text-slate-700 mb-1">班級名稱</label><input type="text" value={editModal.data.name} onChange={e=>setEditModal(p=>({...p, data:{...p.data, name: e.target.value}}))} className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400" /></div>
                              <div><label className="block text-xs font-bold text-slate-700 mb-1">人數上限</label><input type="number" value={editModal.data.limit} onChange={e=>setEditModal(p=>({...p, data:{...p.data, limit: parseInt(e.target.value, 10)}}))} className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400" /></div>
                          </>
                      )}
                      {editModal.type === 'carts' && (
                          <>
                              <div><label className="block text-xs font-bold text-slate-700 mb-1">車輛名稱</label><input type="text" value={editModal.data.name} onChange={e=>setEditModal(p=>({...p, data:{...p.data, name: e.target.value}}))} className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400" /></div>
                              <div><label className="block text-xs font-bold text-slate-700 mb-1">容量</label><input type="number" value={editModal.data.capacity} onChange={e=>setEditModal(p=>({...p, data:{...p.data, capacity: parseInt(e.target.value, 10)}}))} className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400" /></div>
                              <div><label className="block text-xs font-bold text-slate-700 mb-1">損壞編號 (逗號分隔)</label><input type="text" value={editModal.data.damaged || ''} onChange={e=>setEditModal(p=>({...p, data:{...p.data, damaged: e.target.value}}))} className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400" /></div>
                          </>
                      )}
                      {editModal.type === 'pickupMethods' && (
                          <>
                              <div><label className="block text-xs font-bold text-slate-700 mb-1">名稱</label><input type="text" value={editModal.data.name} onChange={e=>setEditModal(p=>({...p, data:{...p.data, name: e.target.value}}))} className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400" /></div>
                          </>
                      )}
                      {editModal.type === 'admins' && (
                          <>
                              <div><label className="block text-xs font-bold text-slate-700 mb-1">帳號</label><input type="text" value={editModal.data.username} disabled className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-100 text-slate-500 font-bold" /></div>
                              <div><label className="block text-xs font-bold text-slate-700 mb-1">新密碼</label><input type="password" value={editModal.data.newPassword || ''} onChange={e=>setEditModal(p=>({...p, data:{...p.data, newPassword: e.target.value}}))} className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400" placeholder="輸入新密碼" /></div>
                          </>
                      )}
                  </div>
                  <div className="mt-8 flex justify-end gap-3">
                      <button onClick={closeEdit} className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors w-full sm:w-auto">取消</button>
                      <button onClick={saveEdit} className="px-5 py-2.5 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 shadow-md transition-colors w-full sm:w-auto">儲存變更</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

// ------------------------------------------
// 後台各子頁面組件
// ------------------------------------------

function AdminAssign({ db, saveDB, showAlert, showConfirm, setPrintData, openEdit }) {
    const [printDate, setPrintDate] = useState(DateUtils.toISODate(DateUtils.today()));
    const [filterDate, setFilterDate] = useState(DateUtils.toISODate(DateUtils.today()));
    const [selectedCartsForPrint, setSelectedCarts] = useState([]);
    const [ipadModal, setIpadModal] = useState({ show: false, bId: null, cartId: null, selectedIpads: [] });
    const [pendingInputs, setPendingInputs] = useState({});

    const pending = db.bookings.filter(b => b.status === 'pending');
    const processed = db.bookings.filter(b => b.status !== 'pending' && b.date === filterDate);

    const toggleCartPrint = (id) => setSelectedCarts(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id]);

    const handlePrint = () => {
        if (!printDate) return showAlert("請先選擇列印日期！", "提示", "⚠️");
        if (selectedCartsForPrint.length === 0) return showAlert("請勾選要列印的充電車！", "提示", "⚠️");
        setPrintData({ date: printDate, cartIds: selectedCartsForPrint });
    };

    const getPendingVal = (id, field, defaultVal) => pendingInputs[id]?.[field] ?? defaultVal;
    const updatePending = (id, field, val) => setPendingInputs(p => ({...p, [id]: {...p[id], [field]: val}}));

    const handleApprove = async (bid) => {
        const cid = getPendingVal(bid, 'cart', '');
        const ipad = getPendingVal(bid, 'ipad', '');
        const pickup = getPendingVal(bid, 'pickup', '');
        if(!cid) return showAlert("請分配車輛", "提示", "⚠️");
        
        const b = db.bookings.find(x => x.id === bid);
        const cart = db.carts.find(c => c.id == cid);
        
        let damaged = (cart.damaged || "").split(',').map(x => x.trim()).filter(x => x);
        let parsedIpads = parseIpadNumbers(ipad).filter(num => !damaged.includes(num));
        let usedIpads = getUsedIpads(b.date, b.timeSlot, cid, b.id, db);
        let conflicts = parsedIpads.filter(num => usedIpads.includes(num));
        
        if (conflicts.length > 0) return showAlert(`❌ 錯誤：編號 (${conflicts.join(', ')}) 在該時段(或重疊時段) 已被分配給其他班級！`, "分配衝突", "❌");
        
        if (parsedIpads.length > 0 && parsedIpads.length !== parseInt(b.peopleCount, 10)) {
            const ok = await showConfirm(`分配的 iPad 數量 (${parsedIpads.length}台) 與班級需求 (${b.peopleCount}人) 不符。\n確定要繼續嗎？`);
            if(!ok) return;
        }

        const uDb = {...db};
        const updatedB = uDb.bookings.find(x => x.id === bid);
        updatedB.status = 'assigned';
        updatedB.cartAssignedId = cid;
        updatedB.cartAssignedName = cart.name;
        updatedB.ipadNumbers = stringifyIpadNumbers(parsedIpads);
        if(pickup) updatedB.pickupMethod = pickup;
        
        await saveDB(uDb);
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* 列印卡片 */}
            <div className="bg-gradient-to-br from-sky-50 to-white p-6 md:p-8 rounded-3xl border border-sky-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-sky-200 rounded-full blur-3xl opacity-50 -mr-10 -mt-10"></div>
                <h2 className="text-xl md:text-2xl font-extrabold text-sky-950 mb-6 flex items-center gap-2 border-b border-sky-200/60 pb-3"><ClipboardList className="text-sky-600" /> 列印充電車登記表</h2>
                <div className="flex flex-col lg:flex-row gap-5 items-start lg:items-end relative z-10">
                    <div className="w-full lg:w-48">
                        <label className="text-sm font-bold text-sky-800 mb-2 block">列印日期</label>
                        <input type="date" value={printDate} onChange={(e) => setPrintDate(e.target.value)} className="w-full px-4 py-2.5 border border-sky-300 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-bold text-slate-700 bg-white/80 backdrop-blur-sm" />
                    </div>
                    <div className="flex-grow w-full">
                        <label className="text-sm font-bold text-sky-800 mb-2 block">選擇充電車</label>
                        <div className="flex flex-wrap gap-2">
                            {db.carts.map(c => (
                                <label key={c.id} className={`flex items-center px-4 py-2 rounded-xl cursor-pointer text-sm font-bold border transition-all ${selectedCartsForPrint.includes(c.id) ? 'bg-sky-600 text-white border-sky-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300'}`}>
                                    <input type="checkbox" className="hidden" checked={selectedCartsForPrint.includes(c.id)} onChange={() => toggleCartPrint(c.id)} />
                                    {c.name}
                                </label>
                            ))}
                        </div>
                    </div>
                    <button onClick={handlePrint} className="w-full lg:w-auto bg-sky-700 text-white px-8 py-3 rounded-xl font-extrabold shadow-lg hover:bg-sky-800 hover:-translate-y-0.5 transition-all whitespace-nowrap">列印預覽</button>
                </div>
            </div>

            {/* 待處理 */}
            <div className="bg-white p-6 md:p-8 rounded-3xl border shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-slate-100 pb-3 gap-3">
                    <h2 className="text-xl md:text-2xl font-extrabold text-slate-800 flex items-center gap-2"><Clock className="text-amber-500" /> 待處理預約</h2>
                    <button onClick={async () => {
                        const pendingBookings = db.bookings.filter(b => b.status === 'pending');
                        let approvedCount = 0; let hasError = false;

                        for (let b of pendingBookings) {
                            const cid = getPendingVal(b.id, 'cart', '');
                            const ipad = getPendingVal(b.id, 'ipad', '');
                            const pickup = getPendingVal(b.id, 'pickup', b.pickupMethod);

                            if (cid) {
                                const cart = db.carts.find(c => c.id == cid);
                                let damaged = (cart.damaged || "").split(',').map(x => x.trim()).filter(x => x);
                                let parsedIpads = parseIpadNumbers(ipad).filter(num => !damaged.includes(num));
                                let usedIpads = getUsedIpads(b.date, b.timeSlot, cid, b.id, db);
                                let conflicts = parsedIpads.filter(num => usedIpads.includes(num));
                                
                                if (conflicts.length > 0) {
                                    showAlert(`❌ 預約 [${b.teacher} - ${b.timeSlot}] 失敗：\n編號 (${conflicts.join(', ')}) 在該時段(或重疊時段) 已被分配！`, "分配衝突", "❌");
                                    hasError = true; continue;
                                }

                                let finalIpadString = stringifyIpadNumbers(parsedIpads);
                                if (parsedIpads.length > 0 && parsedIpads.length !== parseInt(b.peopleCount, 10)) {
                                    const ok = await showConfirm(`⚠️ 提醒：預約 [${b.teacher}] 分配的數量 (${parsedIpads.length}台) 與需求 (${b.peopleCount}人) 不符。\n確定要核准嗎？`);
                                    if(!ok) { hasError = true; continue; }
                                }

                                b.status = 'assigned'; b.cartAssignedId = cid; b.cartAssignedName = cart.name; b.ipadNumbers = finalIpadString;
                                b.pickupMethod = pickup;
                                approvedCount++;
                            }
                        }
                        if (approvedCount > 0) { await saveDB({...db}); showAlert(`✅ 已成功批量核准 ${approvedCount} 筆預約！`, "成功", "✅"); } 
                        else if (!hasError) { showAlert("請至少為一筆預約選擇分配車輛！", "提示", "⚠️"); }
                    }} className="w-full sm:w-auto bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-sky-700 transition-colors">一鍵批量核准</button>
                </div>
                <div className="overflow-x-auto custom-scrollbar pb-2">
                    {pending.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200"><CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-50" /> 目前沒有待處理的預約</div>
                    ) : (
                        <table className="w-full text-sm text-left min-w-[800px]">
                            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-extrabold">
                                <tr><th className="px-4 py-3 rounded-tl-xl">時間 / 需求</th><th className="px-4 py-3">分配車輛 & 方式</th><th className="px-4 py-3 w-1/4">iPad 編號 (可開網格)</th><th className="px-4 py-3 text-center rounded-tr-xl w-24">操作</th></tr>
                            </thead>
                            <tbody>
                                {pending.map(b => (
                                    <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-4">
                                            <div className="font-bold text-slate-800">{b.date} <span className="text-slate-500 font-normal">| {b.timeSlot}</span></div>
                                            <div className="mt-1 font-bold text-sky-700">
                                              {b.teacher} 
                                              <span className="text-xs bg-sky-100 px-1.5 py-0.5 rounded text-sky-800 ml-1">{b.className} ({b.peopleCount}人)</span> 
                                              {b.observation === '是' && (<span className="text-[10px] bg-red-100 text-red-600 px-1 py-0.5 rounded ml-1 font-bold">觀課</span>)}
                                            </div>
                                            {b.remarks && (<div className="mt-1.5 text-xs text-slate-500 italic bg-slate-100 p-1.5 rounded border border-slate-200">備註: {b.remarks}</div>)}
                                        </td>
                                        <td className="px-4 py-4 space-y-2">
                                            <select value={getPendingVal(b.id, 'cart', '')} onChange={(e) => updatePending(b.id, 'cart', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg py-2 px-2 outline-none focus:ring-2 focus:ring-sky-400 bg-white font-bold text-slate-700"><option value="">--選擇車輛--</option>{db.carts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
                                            <select value={getPendingVal(b.id, 'pickup', b.pickupMethod)} onChange={(e) => updatePending(b.id, 'pickup', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg py-1.5 px-2 outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50 text-slate-600">{db.pickupMethods.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex shadow-sm rounded-lg group">
                                                <input type="text" value={getPendingVal(b.id, 'ipad', '')} onChange={(e) => updatePending(b.id, 'ipad', e.target.value)} className="w-full text-sm border border-slate-200 border-r-0 rounded-l-lg p-2 outline-none focus:ring-2 focus:ring-sky-400 font-mono" placeholder="例: 1-15" />
                                                <button onClick={() => {
                                                    const cid = getPendingVal(b.id, 'cart', '');
                                                    if(!cid) return showAlert("請先在左側選擇充電車！", "提示", "⚠️");
                                                    setIpadModal({ show: true, bId: b.id, cartId: cid, selectedIpads: parseIpadNumbers(getPendingVal(b.id, 'ipad', '')) });
                                                }} className="bg-sky-50 text-sky-600 border border-sky-200 px-3 rounded-r-lg text-sm font-bold hover:bg-sky-100 transition-colors whitespace-nowrap"><Smartphone className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <button onClick={() => handleApprove(b.id)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-extrabold shadow-sm hover:bg-emerald-700 hover:-translate-y-0.5 transition-all w-full">核准</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* 已處理 */}
            <div className="bg-white p-6 md:p-8 rounded-3xl border shadow-sm mt-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-slate-100 pb-3 gap-3">
                    <h2 className="text-xl md:text-2xl font-extrabold text-slate-800 flex items-center gap-2"><CheckCircle className="text-emerald-500" /> 已處理紀錄</h2>
                    <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-400 font-bold bg-slate-50" />
                </div>
                <div className="overflow-x-auto custom-scrollbar pb-2">
                    <table className="w-full text-sm text-left min-w-[600px]">
                        <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-extrabold">
                            <tr><th className="px-4 py-3 rounded-tl-xl">預約時間</th><th className="px-4 py-3">教師 / 需求</th><th className="px-4 py-3">狀態 / 分配結果</th><th className="px-4 py-3 text-center">操作</th></tr>
                        </thead>
                        <tbody>
                            {processed.length === 0 ? (
                                <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-400">該日期尚無已處理的預約</td></tr>
                            ) : (
                                processed.map(b => (
                                    <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3 text-slate-600"><b>{b.date}</b><br />{b.timeSlot}</td>
                                        <td className="px-4 py-3"><b>{b.teacher}</b><br /><span className="text-xs text-slate-500">{b.className} ({b.peopleCount}人)</span></td>
                                        <td className="px-4 py-3">
                                            {b.status === 'assigned' && (<span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded border border-emerald-200 text-xs">✅ 已分配</span>)}
                                            {b.status === 'rejected' && (<span className="text-red-500 font-bold bg-red-50 px-2 py-1 rounded border border-red-200 text-xs">❌ 已退回</span>)}
                                            {b.status === 'cancelled' && (<span className="text-slate-500 font-bold bg-slate-100 px-2 py-1 rounded border border-slate-200 text-xs">⛔ 已取消</span>)}
                                            <div className="mt-1.5 text-xs text-slate-600 font-bold">{b.cartAssignedName ? `🚗 ${b.cartAssignedName}` : ''} {b.ipadNumbers ? (<span className="block mt-0.5 bg-slate-100 p-1 rounded font-mono inline-block">📱 {b.ipadNumbers}</span>) : ''}</div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button onClick={() => openEdit('bookings', b.id)} className="text-sky-600 text-xs font-bold hover:underline bg-sky-50 px-3 py-1.5 rounded border border-sky-200 shadow-sm transition-colors">✏️ 編輯</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* iPad 網格選取 Modal */}
            {ipadModal.show && (
                <div className="fixed inset-0 bg-black/60 z-[10500] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white p-6 md:p-8 rounded-3xl w-full max-w-lg shadow-2xl animate-fade-in">
                        <h3 className="text-xl font-extrabold mb-4 text-slate-800 border-b pb-3 flex justify-between items-center">
                            <span>📱 選擇 iPad</span>
                            <span className="text-sm font-bold text-sky-600 bg-sky-50 px-3 py-1 rounded-full border border-sky-100">已選: {ipadModal.selectedIpads.length}</span>
                        </h3>
                        <div className="max-h-[50vh] overflow-y-auto mb-4 custom-scrollbar pr-2 mt-4">
                            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                                {Array.from({length: db.carts.find(c=>c.id==ipadModal.cartId)?.capacity || 30}).map((_, i) => {
                                    const numStr = (i+1).toString();
                                    const cart = db.carts.find(c=>c.id==ipadModal.cartId);
                                    const damaged = (cart?.damaged || "").split(',').map(x=>x.trim()).filter(x=>x);
                                    const b = db.bookings.find(x=>x.id===ipadModal.bId);
                                    const used = getUsedIpads(b.date, b.timeSlot, cart.id, b.id, db);
                                    
                                    const isDamaged = damaged.includes(numStr);
                                    const isUsed = used.includes(numStr);
                                    const isSelected = ipadModal.selectedIpads.includes(numStr);

                                    if (isDamaged) return (<div key={i} className="aspect-square border rounded-xl bg-red-50 text-red-400 flex items-center justify-center text-xs font-bold border-red-200 line-through">壞</div>);
                                    if (isUsed) return (<div key={i} className="aspect-square border rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center text-xs font-bold border-slate-200 cursor-not-allowed">{numStr}</div>);
                                    
                                    return (
                                        <button key={i} onClick={() => {
                                            setIpadModal(p => ({...p, selectedIpads: p.selectedIpads.includes(numStr) ? p.selectedIpads.filter(x=>x!==numStr) : [...p.selectedIpads, numStr]}));
                                        }} className={`aspect-square border rounded-xl flex items-center justify-center text-sm font-extrabold transition-all transform hover:scale-105 shadow-sm ${isSelected ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-sky-600 border-sky-200 hover:bg-sky-50'}`}>{numStr}</button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6 border-t border-slate-100 pt-4">
                            <button onClick={() => setIpadModal({show:false})} className="px-5 py-2.5 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 font-bold transition-colors w-full sm:w-auto">取消</button>
                            <button onClick={() => {
                                updatePending(ipadModal.bId, 'ipad', stringifyIpadNumbers(ipadModal.selectedIpads));
                                setIpadModal({show:false});
                            }} className="px-6 py-2.5 rounded-xl bg-sky-600 text-white hover:bg-sky-700 font-bold shadow-lg transition-colors w-full sm:w-auto">確認分配</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function AdminDisplay({ db, saveDB }) {
    const ds = db.displaySettings || { teacher: true, className: true, observation: true, ipadNumbers: true, pickupMethod: false, itSupport: false, remarks: false };
    const [localDs, setLocalDs] = useState(ds);
    const handleSave = async () => {
        const uDb = {...db, displaySettings: localDs};
        await saveDB(uDb, true);
    };
    return (
        <div className="bg-white p-6 md:p-8 rounded-3xl border shadow-sm animate-fade-in">
            <h3 className="text-2xl font-extrabold mb-6 text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2"><Settings className="text-sky-600" /> 總覽表顯示項目</h3>
            <p className="text-sm text-slate-500 mb-6">自訂前台「每日充電車時間表」格子內呈現的資訊：</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                {Object.keys(localDs).map(key => {
                    const labelMap = {teacher:'教師姓名', className:'班級名稱', observation:'觀課提醒', ipadNumbers:'iPad編號', pickupMethod:'取機方式', itSupport:'IT協助', remarks:'備註說明'};
                    return (
                        <label key={key} className="flex items-center space-x-3 cursor-pointer bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm hover:border-sky-300 transition-colors font-bold text-slate-700">
                            <input type="checkbox" checked={localDs[key]} onChange={(e) => setLocalDs({...localDs, [key]: e.target.checked})} className="accent-sky-600 w-4 h-4" /> <span>{labelMap[key]}</span>
                        </label>
                    );
                })}
            </div>
            <button onClick={handleSave} className="px-8 py-3.5 bg-slate-900 text-white rounded-xl text-base font-extrabold shadow-lg hover:bg-slate-800 transition-all hover:-translate-y-0.5">儲存顯示設定</button>
        </div>
    );
}

function AdminTimeSlots({ db, saveDB, showAlert, showConfirm, openEdit }) {
    const [name, setName] = useState(''); const [time, setTime] = useState(''); const [quota, setQuota] = useState(''); const [remark, setRemark] = useState(''); const [showRmk, setShowRmk] = useState(true); const [days, setDays] = useState([1,2,3,4,5,6,0]);
    const [draggedIdx, setDraggedIdx] = useState(null);

    const handleAdd = async () => {
        if(!name) return showAlert("請填寫時段名稱", "提示", "⚠️"); if(days.length===0) return showAlert("請勾選適用星期", "提示", "⚠️");
        const uDb = {...db, timeSlots: [...db.timeSlots, {id: Date.now(), name, timeRange: time, remark, showRemark: showRmk, quota: parseInt(quota, 10)||db.carts.length, applicableDays: days}]};
        if(await saveDB(uDb)) { setName(''); setTime(''); setQuota(''); setRemark(''); }
    };
    
    const handleDel = async (i) => { if(await showConfirm("確定刪除此時段？")) { const uDb = {...db}; uDb.timeSlots.splice(i,1); await saveDB(uDb); } };

    const handleDrop = async (e, dropIndex) => {
        e.preventDefault();
        if (draggedIdx === null || draggedIdx === dropIndex) return;
        const newArr = [...db.timeSlots];
        const item = newArr.splice(draggedIdx, 1)[0];
        newArr.splice(dropIndex, 0, item);
        await saveDB({ ...db, timeSlots: newArr });
        setDraggedIdx(null);
    };

    return (
        <div className="bg-white p-6 md:p-8 rounded-3xl border shadow-sm animate-fade-in">
            <h3 className="text-2xl font-extrabold mb-6 text-slate-800 border-b border-slate-100 pb-3">⏱️ 借用時段與名額</h3>
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 mb-8 space-y-4 shadow-inner">
                <div className="flex flex-col sm:flex-row gap-3 mb-2">
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="名稱 (例:第一節)" className="w-full sm:w-1/3 px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-sky-400 font-bold" />
                    <input type="text" value={time} onChange={(e) => setTime(e.target.value)} placeholder="時間 (08:00-09:00)" className="flex-grow px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-sky-400" />
                    <input type="number" value={quota} onChange={(e) => setQuota(e.target.value)} placeholder="名額" className="w-24 px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-sky-400" />
                </div>
                <div className="mb-3">
                    <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-wider">適用星期</label>
                    <div className="flex flex-wrap gap-2">
                        {[1,2,3,4,5,6,0].map(d => (
                            <label key={d} className={`px-3 py-1.5 rounded-lg border text-sm font-bold cursor-pointer transition-colors ${days.includes(d) ? 'bg-sky-100 border-sky-300 text-sky-800' : 'bg-white border-slate-200 text-slate-400'}`}>
                                <input type="checkbox" className="hidden" checked={days.includes(d)} onChange={(e) => {
                                    if(e.target.checked) setDays([...days, d]); else setDays(days.filter(x=>x!==d));
                                }} /> {dayMap[d]}
                            </label>
                        ))}
                    </div>
                </div>
                <textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="時段備註..." rows={2} className="w-full px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-sky-400 mb-3"></textarea>
                <div className="flex justify-between items-center pt-2">
                    <label className="flex items-center text-sm font-bold text-slate-600 cursor-pointer"><input type="checkbox" checked={showRmk} onChange={(e) => setShowRmk(e.target.checked)} className="mr-2 w-4 h-4 accent-sky-600" /> 顯示備註</label>
                    <button onClick={handleAdd} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-extrabold shadow hover:bg-slate-800 transition-transform hover:-translate-y-0.5">新增時段</button>
                </div>
            </div>
            <ul className="space-y-3">
                {db.timeSlots.map((s, i) => (
                    <li key={s.id} 
                        draggable 
                        onDragStart={() => setDraggedIdx(i)} 
                        onDragOver={e => e.preventDefault()} 
                        onDrop={e => handleDrop(e, i)}
                        className="p-4 border border-slate-200 rounded-2xl bg-white shadow-sm flex justify-between items-center hover:border-sky-300 transition-colors cursor-grab active:cursor-grabbing">
                        <div className="flex items-center w-full">
                            <div className="text-slate-400 mr-4 text-lg">☰</div>
                            <div>
                                <div className="font-extrabold text-lg text-slate-800">{s.name} <span className="text-sm font-normal text-slate-500 ml-2">{s.timeRange}</span> <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full ml-2">名額:{s.quota}</span></div>
                                <div className="text-xs text-slate-500 mt-1.5 flex items-center gap-2">
                                    <span className="bg-slate-100 px-1.5 rounded text-slate-600">星期 {s.applicableDays?.map(d=>dayMap[d]).join(',')}</span>
                                    {s.remark && (<span className="italic">備註: {s.remark} ({s.showRemark?'顯示':'隱藏'})</span>)}
                                </div>
                            </div>
                        </div>
                        <div className="space-x-2 flex-shrink-0">
                            <button onClick={() => openEdit('timeSlots', i)} className="text-sky-600 text-xs font-bold hover:underline bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-200">編輯</button>
                            <button onClick={() => handleDel(i)} className="text-red-500 text-xs font-bold hover:underline bg-red-50 px-3 py-1.5 rounded-lg border border-red-200">刪除</button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function AdminClasses({ db, saveDB, showAlert, showConfirm, openEdit }) {
    const [name, setName] = useState(''); const [limit, setLimit] = useState(30);
    const [draggedIdx, setDraggedIdx] = useState(null);

    const handleAdd = async () => {
        if(!name) return showAlert("請填寫班級", "提示", "⚠️");
        const uDb = {...db, classes: [...db.classes, {id: Date.now(), name, limit}]};
        if(await saveDB(uDb)) { setName(''); setLimit(30); }
    };
    const handleDel = async (i) => { if(await showConfirm("確定刪除？")) { const uDb = {...db}; uDb.classes.splice(i,1); await saveDB(uDb); } };

    const handleDrop = async (e, dropIndex) => {
        e.preventDefault();
        if (draggedIdx === null || draggedIdx === dropIndex) return;
        const newArr = [...db.classes];
        const item = newArr.splice(draggedIdx, 1)[0];
        newArr.splice(dropIndex, 0, item);
        await saveDB({ ...db, classes: newArr });
        setDraggedIdx(null);
    };

    return (
        <div className="bg-white p-6 md:p-8 rounded-3xl border shadow-sm animate-fade-in">
            <h3 className="text-2xl font-extrabold mb-6 text-slate-800 border-b border-slate-100 pb-3">🏫 班級與人數</h3>
            <div className="flex flex-col sm:flex-row gap-3 mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="班級名稱" className="flex-grow px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-sky-400 font-bold" />
                <input type="number" value={limit} onChange={(e) => setLimit(parseInt(e.target.value, 10)||30)} placeholder="人數上限" className="w-full sm:w-32 px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-sky-400" />
                <button onClick={handleAdd} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-extrabold shadow hover:bg-slate-800 transition-transform hover:-translate-y-0.5 whitespace-nowrap">新增</button>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {db.classes.map((c, i) => (
                    <li key={c.id} 
                        draggable 
                        onDragStart={() => setDraggedIdx(i)} 
                        onDragOver={e => e.preventDefault()} 
                        onDrop={e => handleDrop(e, i)}
                        className="p-4 border border-slate-200 rounded-xl flex justify-between items-center shadow-sm bg-white hover:border-sky-300 cursor-grab active:cursor-grabbing">
                        <div className="flex items-center">
                            <div className="text-slate-400 mr-3 text-lg">☰</div>
                            <div className="font-bold text-slate-700">{c.name} <span className="text-xs text-slate-400 font-normal ml-1">({c.limit}人)</span></div>
                        </div>
                        <div className="space-x-2">
                            <button onClick={() => openEdit('classes', i)} className="text-sky-600 text-xs font-bold hover:underline bg-sky-50 px-2 py-1 rounded border border-sky-200">編輯</button>
                            <button onClick={() => handleDel(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function AdminCarts({ db, saveDB, showAlert, showConfirm, openEdit }) {
    const [name, setName] = useState(''); const [cap, setCap] = useState(30);
    const [draggedIdx, setDraggedIdx] = useState(null);

    const handleAdd = async () => {
        if(!name) return showAlert("請填寫車輛", "提示", "⚠️");
        const uDb = {...db, carts: [...db.carts, {id: Date.now(), name, capacity: cap, damaged: ''}]};
        if(await saveDB(uDb)) { setName(''); setCap(30); }
    };
    const handleDel = async (i) => { if(await showConfirm("確定刪除？")) { const uDb = {...db}; uDb.carts.splice(i,1); await saveDB(uDb); } };

    const handleDrop = async (e, dropIndex) => {
        e.preventDefault();
        if (draggedIdx === null || draggedIdx === dropIndex) return;
        const newArr = [...db.carts];
        const item = newArr.splice(draggedIdx, 1)[0];
        newArr.splice(dropIndex, 0, item);
        await saveDB({ ...db, carts: newArr });
        setDraggedIdx(null);
    };

    return (
        <div className="bg-white p-6 md:p-8 rounded-3xl border shadow-sm animate-fade-in">
            <h3 className="text-2xl font-extrabold mb-6 text-slate-800 border-b border-slate-100 pb-3">🔋 充電車設備</h3>
            <div className="flex flex-col sm:flex-row gap-3 mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="車輛名稱" className="flex-grow px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-sky-400 font-bold" />
                <input type="number" value={cap} onChange={(e) => setCap(parseInt(e.target.value, 10)||30)} placeholder="總數量" className="w-full sm:w-32 px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-sky-400" />
                <button onClick={handleAdd} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-extrabold shadow hover:bg-slate-800 transition-transform hover:-translate-y-0.5 whitespace-nowrap">新增</button>
            </div>
            <ul className="grid grid-cols-1 gap-3">
                {db.carts.map((c, i) => (
                    <li key={c.id} 
                        draggable 
                        onDragStart={() => setDraggedIdx(i)} 
                        onDragOver={e => e.preventDefault()} 
                        onDrop={e => handleDrop(e, i)}
                        className="p-4 border border-slate-200 rounded-xl flex justify-between items-center shadow-sm bg-white hover:border-sky-300 cursor-grab active:cursor-grabbing">
                        <div className="flex items-center">
                            <div className="text-slate-400 mr-3 text-lg">☰</div>
                            <div className="font-extrabold text-lg text-slate-800">{c.name} <span className="text-sm font-normal text-slate-500 ml-2">({c.capacity}台)</span></div>
                        </div>
                        <div className="space-x-2">
                            <button onClick={() => openEdit('carts', i)} className="text-sky-600 text-xs font-bold hover:underline bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-200">編輯</button>
                            <button onClick={() => handleDel(i)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 className="w-5 h-5" /></button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function AdminPickups({ db, saveDB, showAlert, showConfirm, openEdit }) {
    const [name, setName] = useState('');
    const [draggedIdx, setDraggedIdx] = useState(null);

    const handleAdd = async () => {
        if(!name) return showAlert("請填寫名稱", "提示", "⚠️");
        const uDb = {...db, pickupMethods: [...db.pickupMethods, {id: Date.now(), name}]};
        if(await saveDB(uDb)) setName('');
    };
    const handleDel = async (i) => { 
        if(db.pickupMethods.length<=1) return showAlert("需保留至少一種方式", "提示", "⚠️");
        if(await showConfirm("確定刪除？")) { const uDb = {...db}; uDb.pickupMethods.splice(i,1); await saveDB(uDb); } 
    };

    const handleDrop = async (e, dropIndex) => {
        e.preventDefault();
        if (draggedIdx === null || draggedIdx === dropIndex) return;
        const newArr = [...db.pickupMethods];
        const item = newArr.splice(draggedIdx, 1)[0];
        newArr.splice(dropIndex, 0, item);
        await saveDB({ ...db, pickupMethods: newArr });
        setDraggedIdx(null);
    };

    return (
        <div className="bg-white p-6 md:p-8 rounded-3xl border shadow-sm animate-fade-in">
            <h3 className="text-2xl font-extrabold mb-6 text-slate-800 border-b border-slate-100 pb-3">📦 取機方式</h3>
            <div className="flex gap-3 mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="取機方式名稱" className="flex-grow px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-sky-400 font-bold" />
                <button onClick={handleAdd} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-extrabold shadow hover:bg-slate-800 transition-transform hover:-translate-y-0.5 whitespace-nowrap">新增</button>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {db.pickupMethods.map((p, i) => (
                    <li key={p.id} 
                        draggable 
                        onDragStart={() => setDraggedIdx(i)} 
                        onDragOver={e => e.preventDefault()} 
                        onDrop={e => handleDrop(e, i)}
                        className="p-3.5 border border-slate-200 rounded-xl flex justify-between items-center shadow-sm bg-white hover:border-sky-300 cursor-grab active:cursor-grabbing">
                        <div className="flex items-center">
                            <div className="text-slate-400 mr-3 text-lg">☰</div>
                            <div className="font-bold text-slate-700">{p.name}</div>
                        </div>
                        <div className="space-x-2">
                            <button onClick={() => openEdit('pickupMethods', i)} className="text-sky-600 text-xs font-bold hover:underline bg-sky-50 px-2 py-1 rounded border border-sky-200">編輯</button>
                            <button onClick={() => handleDel(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function AdminCodes({ db, saveDB, showAlert, showConfirm }) {
    const generate = async () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = '';
        for(let i=0; i<6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
        const uDb = {...db, bookingCodes: [...db.bookingCodes, {code, used: false, createdAt: new Date().toISOString()}]};
        await saveDB(uDb, true);
    };
    const handleDel = async (codeStr) => {
        if(await showConfirm("確定刪除此授權碼？")) {
            const uDb = {...db, bookingCodes: db.bookingCodes.filter(c=>c.code!==codeStr)};
            await saveDB(uDb);
        }
    };

    return (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-purple-100 shadow-sm relative overflow-hidden animate-fade-in">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-200 rounded-full blur-3xl opacity-30 -mr-10 -mt-10"></div>
            <div className="relative z-10">
                <div className="flex justify-between items-center mb-4 border-b border-purple-100 pb-4">
                    <h3 className="text-2xl font-extrabold text-purple-950">🔑 緊急預約授權碼</h3>
                    <button onClick={generate} className="bg-purple-600 text-white px-5 py-2.5 rounded-xl text-sm font-extrabold shadow-lg hover:bg-purple-700 hover:-translate-y-0.5 transition-all">產生新授權碼</button>
                </div>
                <p className="text-sm text-slate-500 mb-6 font-medium">一次性授權碼，僅針對緊急預約使用。提供給有急需的教師使用。</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[...db.bookingCodes].reverse().map(c => (
                        <div key={c.code} className={`p-4 border rounded-2xl flex flex-col justify-between shadow-sm transition-all ${c.used ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-purple-200 hover:border-purple-400'}`}>
                            <div className={`font-mono text-xl text-center font-extrabold tracking-widest mb-3 ${c.used ? 'text-slate-400 line-through' : 'text-purple-700'}`}>{c.code}</div>
                            <div className="flex justify-between items-center">
                                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${c.used ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>{c.used ? ("已用(" + c.usedBy + ")") : '未使用'}</span>
                                <button onClick={() => handleDel(c.code)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function AdminHolidays({ db, saveDB, showAlert, showConfirm }) {
    const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [remark, setRemark] = useState('');
    const handleAdd = async () => {
        if(!start || !end || !remark) return showAlert("請完整填寫日期與原因", "提示", "⚠️");
        if(start > end) return showAlert("開始日期不能大於結束日期", "錯誤", "❌");
        const uDb = {...db, holidays: [...db.holidays, {id: Date.now(), startDate: start, endDate: end, remark}]};
        if(await saveDB(uDb)) { setStart(''); setEnd(''); setRemark(''); }
    };
    const handleDel = async (i) => { if(await showConfirm("確定刪除？")) { const uDb = {...db}; uDb.holidays.splice(i,1); await saveDB(uDb); } };

    return (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-red-50 shadow-sm animate-fade-in">
            <h3 className="text-2xl font-extrabold mb-6 text-red-950 border-b border-red-100 pb-3">🏖️ 特殊假日與停借</h3>
            <div className="flex flex-col gap-3 mb-8 bg-red-50/50 p-5 rounded-2xl border border-red-100">
                <div className="flex flex-col sm:flex-row gap-3 items-center w-full">
                    <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full px-4 py-2.5 border border-red-200 rounded-xl outline-none focus:ring-2 focus:ring-red-400 font-bold text-slate-700" />
                    <span className="text-red-400 font-bold">至</span>
                    <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full px-4 py-2.5 border border-red-200 rounded-xl outline-none focus:ring-2 focus:ring-red-400 font-bold text-slate-700" />
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full">
                    <input type="text" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="停借原因 (如: 運動會)" className="flex-grow px-4 py-2.5 border border-red-200 rounded-xl outline-none focus:ring-2 focus:ring-red-400" />
                    <button onClick={handleAdd} className="px-8 py-2.5 bg-red-600 text-white rounded-xl font-extrabold shadow-md hover:bg-red-700 transition-transform hover:-translate-y-0.5 whitespace-nowrap">新增</button>
                </div>
            </div>
            <div className="space-y-3">
                {db.holidays.map((h, i) => (
                    <div key={h.id} className="p-4 border border-slate-200 rounded-2xl flex justify-between items-center shadow-sm bg-white hover:border-red-200 transition-colors">
                        <div className="font-bold text-slate-700 text-base">{h.startDate} <span className="text-slate-400 mx-1 font-normal">~</span> {h.endDate} <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg ml-3">{h.remark}</span></div>
                        <button onClick={() => handleDel(i)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-5 h-5" /></button>
                    </div>
                ))}
            </div>
        </div>
    );
}

function AdminAdmins({ db, saveDB, showAlert, showConfirm, openEdit }) {
    const [u, setU] = useState(''); const [p, setP] = useState('');
    const handleAdd = async () => {
        if(!u || !p) return showAlert("請填寫帳號密碼", "提示", "⚠️");
        if(db.admins.find(a=>a.username===u)) return showAlert("帳號已存在", "錯誤", "❌");
        const uDb = {...db, admins: [...db.admins, {username: u, password: await hashPassword(p)}]};
        if(await saveDB(uDb, true)) { setU(''); setP(''); }
    };
    const handleDel = async (i) => {
        if(db.admins.length<=1) return showAlert("需保留至少一個帳號", "提示", "⚠️");
        if(await showConfirm("確定刪除？")) { const uDb = {...db}; uDb.admins.splice(i,1); await saveDB(uDb); }
    };

    return (
        <div className="bg-white p-6 md:p-8 rounded-3xl border shadow-sm animate-fade-in">
            <h3 className="text-2xl font-extrabold mb-6 text-slate-800 border-b border-slate-100 pb-3">👨‍💻 管理員帳號</h3>
            <div className="flex flex-col sm:flex-row gap-3 mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <input type="text" value={u} onChange={(e) => setU(e.target.value)} placeholder="登入帳號" className="flex-grow px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-sky-400 font-bold" />
                <input type="password" value={p} onChange={(e) => setP(e.target.value)} placeholder="登入密碼" className="flex-grow px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-sky-400" />
                <button onClick={handleAdd} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-extrabold shadow hover:bg-slate-800 transition-transform hover:-translate-y-0.5 whitespace-nowrap">新增</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {db.admins.map((a, i) => (
                    <div key={i} className="p-4 border border-slate-200 rounded-xl flex justify-between items-center shadow-sm bg-white hover:border-sky-300">
                        <div className="font-bold text-slate-700 flex items-center gap-2"><span className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-lg">👤</span> {a.username}</div>
                        <div className="space-x-2">
                            <button onClick={() => openEdit('admins', i)} className="text-sky-600 text-xs font-bold hover:underline bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-200">改密碼</button>
                            <button onClick={() => handleDel(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
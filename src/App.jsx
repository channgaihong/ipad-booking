import React, { useState, useEffect, useMemo, useRef, lazy } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Cloud, Calendar as CalendarIcon, ClipboardList, Settings, LogOut, CheckCircle, XCircle, Info, ShieldAlert, Trash2, Clock, Smartphone } from 'lucide-react';

// ==========================================
// ⚙️ 全域設定與工具函式
// ==========================================
const slashChar = String.fromCharCode(47);
const quoteChar = String.fromCharCode(34);
const doubleQuote = quoteChar + quoteChar;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const API_URL = import.meta.env.VITE_GAS_API_URL;

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const db_firestore = getFirestore(app);

// const API_URL = ["https:", "", "script.google.com", "macros", "s", "AKfycbwoEBK86I5vvf6RScyYNxLGOIVz9SbuFLARCQ-LhzsjvthkMrHwx7unVLfA97LeuQw", "exec"].join(slashChar);

const dayMap = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };
const DEFAULT_DISPLAY_ORDER = ['observation', 'teacher', 'className', 'pickupMethod', 'itSupport', 'ipadNumbers', 'remarks'];

// 使用 lazy 動態載入我們剛建立的組件
const AdminPanel = lazy(() => import('./components/AdminPanel'));

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

const normalizeAuthCode = (code) => {
  if (!code) return '';
  let normalized = String(code).replace(new RegExp('[\\uFF01-\\uFF5E]', 'g'), function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  });
  return normalized.replace(new RegExp('[^A-Za-z0-9]', 'g'), '').toUpperCase();
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
  
  const [alertConfig, setAlertConfig] = useState({ show: false, msg: '', title: '', icon: 'ℹ️', type: 'alert', onConfirm: null, onCancel: null });
  const [printData, setPrintData] = useState(null);

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
              const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';
              const docRef = doc(fs, 'artifacts', appId, 'public', 'data', 'ipad_db', 'global_state');
              
              onSnapshot(docRef, (snapshot) => {
                if (snapshot.exists()) {
                  const fetchedDb = snapshot.data();
                  if (!fetchedDb.pickupMethods) fetchedDb.pickupMethods = [{id: 1, name: "送到課室"}, {id: 2, name: "送到教員室"}, {id: 3, name: "自取"}];
                  if (!fetchedDb.displayOrder || fetchedDb.displayOrder.length === 0) fetchedDb.displayOrder = [...DEFAULT_DISPLAY_ORDER];
                  setDb(fetchedDb);
                  setLoading(false);
                } else {
                  setDoc(docRef, defaultDB).catch(e => console.error(e));
                  setDb(defaultDB);
                  setLoading(false);
                }
              }, (error) => {
                 console.error("Firestore snapshot error:", error);
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
          if (data && data.carts) {
              if (!data.pickupMethods) data.pickupMethods = [{id: 1, name: "送到課室"}, {id: 2, name: "送到教員室"}, {id: 3, name: "自取"}];
              if (!data.displayOrder || data.displayOrder.length === 0) data.displayOrder = [...DEFAULT_DISPLAY_ORDER];
              setDb(data);
          }
        } catch (e) {
          showAlert("同步失敗！切換為本地預設模式。", "錯誤", "❌");
        } finally { 
          setLoading(false); 
        }
      }
    };
    initData();
  }, []);

const api = {
    // 1. 新增預約
    addBookings: async (newBookings, usedCodesPayload) => {
      setLoading(true);
      try {
        const updatedDB = { ...db };
        updatedDB.bookings = [...(db.bookings || []), ...newBookings];
        
        // 處理授權碼邏輯
        if (usedCodesPayload && usedCodesPayload.length > 0) {
            usedCodesPayload.forEach(uc => {
                const cIndex = updatedDB.bookingCodes.findIndex(c => c.code === uc.code);
                if (cIndex > -1) {
                    updatedDB.bookingCodes[cIndex].used = true;
                    updatedDB.bookingCodes[cIndex].usedBy = uc.usedBy;
                }
            });
        }
        
        // 準備非同步任務
        const tasks = [];
        if (isFirebaseReady && firestoreInstance) {
          const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';
          tasks.push(setDoc(doc(firestoreInstance, 'artifacts', appId, 'public', 'data', 'ipad_db', 'global_state'), updatedDB));
        }
        
        tasks.push(
          fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'addBookings', payload: newBookings, usedCodes: usedCodesPayload })
          }).then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
        );
        
        // 平行執行並檢查
        const results = await Promise.allSettled(tasks);
        const hasError = results.some(r => r.status === 'rejected' || (r.value && r.value.status === 'error'));
        if (hasError) console.warn("部分備份節點(GAS)寫入失敗，但主資料庫(Firebase)應已更新。");

        setDb(updatedDB); 
        return true;
      } catch (e) {
        console.error("addBookings 錯誤:", e); throw e;
      } finally { setLoading(false); }
    },

    // 2. 取消預約
    cancelBooking: async (bookingId) => {
      setLoading(true);
      try {
        const updatedDB = { ...db };
        const bIndex = updatedDB.bookings.findIndex(x => x.id === bookingId);
        if (bIndex > -1) updatedDB.bookings[bIndex].status = 'cancelled';
        
        const tasks = [];
        if (isFirebaseReady && firestoreInstance) {
          const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';
          tasks.push(setDoc(doc(firestoreInstance, 'artifacts', appId, 'public', 'data', 'ipad_db', 'global_state'), updatedDB));
        }
        
        tasks.push(
          fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'cancelBooking', bookingId: bookingId })
          }).then(res => res.json())
        );
        
        await Promise.allSettled(tasks);
        
        setDb(updatedDB);
        return true;
      } catch (e) {
        console.error("cancelBooking 錯誤:", e); throw e;
      } finally { setLoading(false); }
    },

    // 3. 管理員儲存設定 (包含驗證)
    adminSaveSettings: async (newDbConfig) => {
      setLoading(true);
      try {
        const tasks = [];
        if (isFirebaseReady && firestoreInstance) {
          const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';
          tasks.push(setDoc(doc(firestoreInstance, 'artifacts', appId, 'public', 'data', 'ipad_db', 'global_state'), newDbConfig));
        }
        
        tasks.push(
          fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'adminSaveSettings', payload: newDbConfig, auth: { username: loggedAdmin, passwordHash: loggedAdminHash } })
          }).then(res => res.json())
        );
        
        await Promise.allSettled(tasks);
        
        setDb(newDbConfig);
        return true;
      } catch (e) {
        console.error("adminSaveSettings 錯誤:", e); throw e;
      } finally { setLoading(false); }
    },

    // 4. 管理員更新特定預約 (審核/修改)
    adminUpdateBookings: async (updatedBookingsArray) => {
      setLoading(true);
      try {
        const newDb = { ...db };
        updatedBookingsArray.forEach(ub => {
           const idx = newDb.bookings.findIndex(x => x.id === ub.id);
           if (idx > -1) newDb.bookings[idx] = ub;
        });
        
        const tasks = [];
        if (isFirebaseReady && firestoreInstance) {
          const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';
          tasks.push(setDoc(doc(firestoreInstance, 'artifacts', appId, 'public', 'data', 'ipad_db', 'global_state'), newDb));
        }
        
        tasks.push(
          fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'adminUpdateBookings', payload: updatedBookingsArray, auth: { username: loggedAdmin, passwordHash: loggedAdminHash } })
          }).then(res => res.json())
        );
        
        await Promise.allSettled(tasks);
        
        setDb(newDb);
        return true;
      } catch (e) {
        console.error("adminUpdateBookings 錯誤:", e); throw e;
      } finally { setLoading(false); }
    },

    // 5. 管理員覆寫所有資料 (危險操作)
    adminOverwriteAll: async (newDbConfig) => {
      setLoading(true);
      try {
        const tasks = [];
        if (isFirebaseReady && firestoreInstance) {
          const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';
          tasks.push(setDoc(doc(firestoreInstance, 'artifacts', appId, 'public', 'data', 'ipad_db', 'global_state'), newDbConfig));
        }
        
        tasks.push(
          fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'overwriteAll', payload: newDbConfig, auth: { username: loggedAdmin, passwordHash: loggedAdminHash } })
          }).then(res => res.json())
        );
        
        const results = await Promise.allSettled(tasks);
        const hasError = results.some(r => r.status === 'rejected');
        if (hasError) console.warn("⚠️ 覆寫過程中，部分備份節點出現異常。");
        
        setDb(newDbConfig);
        return true;
      } catch (e) {
        console.error("adminOverwriteAll 錯誤:", e); throw e;
      } finally { setLoading(false); }
    }
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

      {/* NavBar */}
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
        {activePage === 'booking' && <BookingPage db={db} api={api} showAlert={showAlert} showConfirm={showConfirm} />}
        {activePage === 'admin' && (
          loggedAdmin ? 
            <AdminPanel db={db} api={api} subPage={adminSubPage} setSubPage={setAdminSubPage} onLogout={() => {setLoggedAdmin(null); setLoggedAdminHash(null); sessionStorage.clear();}} showAlert={showAlert} showConfirm={showConfirm} setPrintData={setPrintData} /> : 
            <AdminLogin onLogin={handleAdminLogin} />
        )}
      </main>
      
      {/* 獨立的列印預覽層 */}
      {printData && <PrintOverlay db={db} printData={printData} onClose={() => setPrintData(null)} />}
    </div>
  );
}

// ==========================================
// 🖨️ 獨立列印預覽層 (PrintOverlay) - A5 精準無白頁限制
// ==========================================
function PrintOverlay({ db, printData, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      try { window.print(); } catch(e) { console.error("列印被瀏覽器阻擋", e); }
    }, 500); 
    return () => clearTimeout(timer);
  }, []);

  const { date, cartIds } = printData;
  const targetDay = new Date(date).getDay();
  const cartsToPrint = db.carts.filter(c => cartIds.includes(c.id));
  const dayBookings = db.bookings.filter(b => b.date === date && b.status === 'assigned');
  const validSlots = db.timeSlots.filter(s => !s.applicableDays || s.applicableDays.includes(targetDay));

  return (
    <div className="fixed inset-0 bg-slate-300 z-[999999] overflow-y-auto print:static print:bg-white print:overflow-visible" id="print-overlay-react">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
            @page { 
                size: 210mm 148mm; 
                margin: 0 !important; 
            }
            html, body { 
                width: 210mm !important;
                height: 148mm !important;
                overflow: visible !important; 
                background: white !important; 
                margin: 0 !important; 
                padding: 0 !important; 
            }
            nav, main, #loading-overlay, #custom-alert, #edit-modal, #ipad-selector-modal { 
                display: none !important; 
            }
            #root, #root > div { 
                display: block !important; 
                position: static !important; 
            }
            #print-overlay-react { 
                position: absolute !important; 
                left: 0; top: 0; 
                width: 100% !important; 
                background: white !important; 
                display: block !important; 
                padding: 0 !important; 
                margin: 0 !important; 
            }
            .no-print { display: none !important; }
            
            /* 針對每一張表強制換頁，並限制絕對長寬 210mm x 147.5mm 避免溢出 */
            .a5-container { 
                width: 210mm !important; 
                height: 147.5mm !important; 
                padding: 10mm !important; 
                display: block !important; 
                box-sizing: border-box !important; 
                box-shadow: none !important; 
                margin: 0 auto !important; 
                border: none !important;
                page-break-after: always !important;
                page-break-inside: avoid !important;
                overflow: hidden !important;
                background: white !important;
            }
            .a5-container:last-child {
                page-break-after: auto !important;
            }
        }
      `}} />
      
      <div className="no-print bg-slate-800 p-4 sticky top-0 z-50 flex justify-between items-center shadow-lg">
        <h2 className="text-white text-lg font-bold">列印預覽模式</h2>
        <div className="space-x-3">
          <button onClick={onClose} className="px-5 py-2 bg-slate-600 text-white rounded-lg font-bold shadow hover:bg-slate-500 transition-colors">返回</button>
          <button onClick={() => window.print()} className="px-5 py-2 bg-sky-500 text-white rounded-lg font-bold shadow hover:bg-sky-400 transition-colors">🖨️ 確認列印</button>
        </div>
      </div>
      
      <div className="p-4 sm:p-8 space-y-8 print:p-0 print:space-y-0 print:block flex flex-col items-center">
        {cartsToPrint.map((cart, idx) => {
           const cartBookings = dayBookings.filter(x => x.cartAssignedId == cart.id);
           return (
              <div 
                  key={cart.id} 
                  className={`a5-container p-6 bg-white border-2 border-slate-800 rounded-2xl shadow-xl w-full max-w-[210mm] print:max-w-none print:p-0 print:mb-0 print:rounded-none print:shadow-none ${idx !== cartsToPrint.length - 1 ? 'page-break-after' : ''}`}
              >
                <div className="flex justify-between items-end border-b border-slate-400 pb-1 mb-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center text-white text-xl">📱</div>
                    <div>
                      <h2 className="text-2xl font-bold">{cart.name}</h2>
                      <p className="text-xs text-slate-600">{DateUtils.toChineseDate(date)}</p>
                    </div>
                  </div>
                  <div className="text-right"><p className="text-base font-bold text-slate-700">iPad 借用登記表</p></div>
                </div>
                <table className="w-full border-collapse border border-slate-800 text-[11px] sm:text-xs text-center">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-800 p-1.5 w-[8%]">節次</th>
                      <th className="border border-slate-800 p-1.5 w-[14%]">時間</th>
                      <th className="border border-slate-800 p-1.5 w-[10%]">教師</th>
                      <th className="border border-slate-800 p-1.5 w-[10%]">班級</th>
                      <th className="border border-slate-800 p-1.5 w-[6%]">數量</th>
                      <th className="border border-slate-800 p-1.5 w-[12%]">取機</th>
                      <th className="border border-slate-800 p-1.5 w-[16%]">iPad 編號</th>
                      <th className="border border-slate-800 p-1.5">備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validSlots.map(slot => {
                      const bList = cartBookings.filter(x => x.timeSlot === slot.name);
                      if (bList.length === 0) return null;
                      return bList.map(b => (
                        <tr key={b.id} className="h-9">
                          <td className="border border-slate-800 font-bold">{slot.name}</td>
                          <td className="border border-slate-800">{slot.timeRange || ''}</td>
                          <td className="border border-slate-800 font-bold">
                            {b.teacher}
                            {b.observation === '是' && (<span className="text-red-600 font-bold ml-1">(觀課)</span>)}
                          </td>
                          <td className="border border-slate-800">{b.className}</td>
                          <td className="border border-slate-800 font-bold">{b.peopleCount}</td>
                          <td className="border border-slate-800">{b.pickupMethod || ''}</td>
                          <td className="border border-slate-800 text-[9px] break-words whitespace-pre-wrap max-w-[150px] p-0.5 leading-tight">{b.ipadNumbers || ''}</td>
                          <td className="border border-slate-800 text-left px-1 text-[9px] whitespace-pre-wrap break-words">{b.remarks || ''}</td>
                        </tr>
                      ));
                    })}
                    {cartBookings.length === 0 && (
                      <tr><td colSpan="8" className="border border-slate-800 p-3 text-center text-slate-500 font-bold">本日該車無分配紀錄</td></tr>
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
      <div className="bg-white p-5 sm:p-6 rounded-2xl border shadow-sm mt-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="text-xl font-bold flex items-center text-slate-800"><CalendarIcon className="w-5 h-5 mr-2 text-sky-600" /> 每日充電車時間表</h2>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-4 py-2 border rounded-lg font-bold outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50" />
        </div>
        
        <div className="overflow-x-auto custom-scrollbar pb-2">
          <table className="w-full table-fixed text-sm text-center border-collapse min-w-[800px]">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-3 border-b font-bold px-2 w-[100px] sm:w-[130px] bg-slate-100 sticky left-0 z-20">節次 \ 車輛</th>
                {db.carts.map(c => <th key={c.id} className="p-3 border-b font-bold px-2">{c.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {validSlots.length === 0 ? (
                <tr><td colSpan={db.carts.length + 1} className="p-6 text-slate-500">本日無開放借用時段</td></tr>
              ) : (
                validSlots.map(slot => (
                  <tr key={slot.id} className="hover:bg-slate-50 border-b last:border-0">
                    <td className="p-3 font-bold text-center border-r bg-white sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      {slot.name} <span className="text-[10px] sm:text-xs text-slate-400 block font-normal mt-1">{slot.timeRange}</span>
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
                                      case 'observation': return b.observation === '是' ? <div key="obs"><span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded animate-pulse shadow-sm">觀課</span></div> : null;
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
function BookingPage({ db, api, showAlert, showConfirm }) {
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

  const handleDateChange = (dStr) => {
      setForm({...formData, singleDate: dStr});
      if (dStr) {
          const maxD = calculateMaxDate(db);
          if (dStr > maxD) return;
          const hol = checkIsHoliday(dStr, db);
          if (hol) {
              showAlert(`❌ 錯誤：日期 ${dStr} 為停借日 (${hol.remark})，系統不允許預約！`, "錯誤", "❌");
              setForm(p => ({...p, singleDate: ''}));
          }
      }
  };

  const handleAddBatchDate = () => {
    const d = tempBatchDate;
    if (!d) return;
    if (d > maxDate) return showAlert(`超出可預約範圍 (最遠至 ${maxDate})`);
    if (d < minAllowedDate) return showAlert("該日期需要開啟緊急預約");
    const hol = checkIsHoliday(d, db);
    if (hol) {
        showAlert(`❌ 錯誤：日期 ${d} 為停借日 (${hol.remark})，系統不允許預約！`, "錯誤", "❌");
        return;
    }
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
      showAlert("⚠️ 範圍內無有效工作日 (可能皆為假日或停借日)。", "提示", "⚠️"); 
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
          const cleanCode = normalizeAuthCode(formData.authCode);
          if (!cleanCode) return showAlert("緊急預約需輸入 6 碼授權碼", "錯誤", "🚨");
          const codeObj = db.bookingCodes.find(c => c.code === cleanCode && !c.used);
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
              const hol = checkIsHoliday(d, db);
              if (hol) return showAlert(`❌ 錯誤：日期 ${d} 為停借日 (${hol.remark})，系統不允許預約！`, "錯誤", "❌");

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

      try {
          await api.addBookings(newBookings, usedCodesPayload);
          showAlert(`✅ 預約已送出！共建立 ${newBookings.length} 筆預約。`, "成功", "🎉");
          setForm({ teacher: '', mode: 'single', singleDate: '', batchDates: [], pickup: '送到課室', it: '否', obs: '否', remarks: '', authCode: '', isUrgent: false });
          setSelectedSlots({});
      } catch (e) {
          showAlert("❌ 預約失敗：" + e.message, "錯誤", "❌");
      }
  };

  const cancelBooking = async (id) => {
      const ok = await showConfirm("確定要取消這筆預約嗎？名額將重新釋放。");
      if (!ok) return;
      try {
          await api.cancelBooking(id);
      } catch (e) {
          showAlert("❌ 取消失敗：" + e.message, "錯誤", "❌");
      }
  };

  const myBookings = searchQuery.trim() === '' ? [] : db.bookings.filter(b => b.teacher.toLowerCase().includes(searchQuery.toLowerCase()) && b.date >= DateUtils.toISODate(DateUtils.today())).sort((a,b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in">
        {/* 表單區塊 */}
        <div className="bg-white p-6 md:p-8 rounded-2xl border shadow-lg lg:col-span-5">
            <h2 className="text-xl sm:text-2xl font-extrabold mb-4 flex items-center"><ClipboardList className="w-6 h-6 mr-2 text-sky-600" /> 新建預約申請</h2>
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
                        <input type="date" min={minAllowedDate} max={maxDate} value={formData.singleDate} onChange={(e) => handleDateChange(e.target.value)} className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-sky-400" />
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
                {searchQuery.trim() === '' ? (
                    <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200"><Info className="w-8 h-8 mx-auto mb-2 opacity-50" /> 請在上方輸入教師姓名，系統將自動顯示近期的預約紀錄。</div>
                ) : myBookings.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">無符合的紀錄</div>
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
                                {b.remarks && (<div className="text-[11px] text-sky-700 mt-2 bg-sky-50 px-2 py-1 rounded block w-full whitespace-pre-wrap break-words">備註: {b.remarks}</div>)}
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




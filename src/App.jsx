import React, { useState, useEffect, useMemo, useRef, lazy, Suspense, startTransition } from 'react';
//import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Cloud, Calendar as CalendarIcon, ClipboardList, Settings, LogOut, CheckCircle, XCircle, Info, ShieldAlert, Trash2, Clock, Smartphone } from 'lucide-react';
// 加入 slashChar
import { DateUtils, dayMap, DEFAULT_DISPLAY_ORDER, hashPassword, API_URL, defaultDB, slashChar, db_firestore, app } from "./components/utils.jsx";

// 使用 lazy 動態載入我們剛建立的組件
//const AdminPanel = lazy(() => import('./components/AdminPanel'));
//const AdminLogin = lazy(() => import('./components/AdminLogin'));
const SchedulePage = React.lazy(() => import('./components/SchedulePage.jsx'));
const BookingPage = React.lazy(() => import('./components/BookingPage.jsx'));
const AdminPanel = React.lazy(() => import('./components/AdminPanel.jsx'));
const AdminLogin = React.lazy(() => import('./components/AdminLogin.jsx'));
const PrintOverlay = React.lazy(() => import('./components/PrintOverlay.jsx'));
// ==========================================
// ⚛️ 主要 React 應用程式組件
// ==========================================
export default function App() {
  const [db, setDb] = useState(defaultDB);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState('schedule');
  const [adminSubPage, setAdminSubPage] = useState('assign');
  //const [loggedAdmin, setLoggedAdmin] = useState('admin'); // 強制設定為 admin
  //const [loggedAdminHash, setLoggedAdminHash] = useState('1234'); // 隨便塞一個字串
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
          //const app = initializeApp(config);
          const auth = getAuth(app);
          //const fs = getFirestore(app);
          setFirestoreInstance(db_firestore);

          if (typeof window.__initial_auth_token !== 'undefined' && window.__initial_auth_token) {
            await signInWithCustomToken(auth, window.__initial_auth_token);
          } else {
            await signInAnonymously(auth);
          }

          onAuthStateChanged(auth, user => {
            if (user) {
              setIsFirebaseReady(true);
              const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';
              const docRef = doc( db_firestore, 'artifacts', appId, 'public', 'data', 'ipad_db', 'global_state');
              
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
          fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
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
          fetch(API_URL, {
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
          fetch(API_URL, {
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
          fetch(API_URL, {
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
          fetch(API_URL, {
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
              <button onClick={() => {startTransition(() => {
                setActivePage('admin');
              })
              }} className={`sm:hidden p-2 rounded-lg transition-colors ${activePage === 'admin' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Settings className="w-5 h-5" />
              </button>
            </div>
            <div className="flex w-full sm:w-auto justify-between sm:justify-end space-x-2 sm:space-x-4 items-center">
              <button onClick={() => {startTransition(() => {
                setActivePage('schedule');
              })
              }}className={`flex-1 sm:flex-none whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activePage === 'schedule' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>時間表</button>
              <button onClick={() => {startTransition(() => {
                  setActivePage('booking');
                })
              }}className={`flex-1 sm:flex-none justify-center whitespace-nowrap px-5 py-2 sm:py-2.5 rounded-xl text-sm font-bold shadow-md transition-transform transform hover:-translate-y-0.5 flex items-center gap-2 ${activePage === 'booking' ? 'bg-sky-600 text-white ring-4 ring-sky-200' : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white'}`}><ClipboardList className="w-4 h-4" /> 立即預約</button>
              <button onClick={() => {
                startTransition(() => {
                    setActivePage('admin');
                  })
                }} className={`hidden sm:block whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activePage === 'admin' ? 'bg-slate-900 text-white font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>管理後台</button>
            </div>
          </div>
        </div>
      </nav>
      <Suspense fallback={<div className="text-center p-10 font-bold text-sky-600">正在加載模組...</div>}>
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
      </Suspense>
    </div>
  );
}


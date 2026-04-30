import React, { useState, useEffect, useMemo, useRef, lazy, Suspense, startTransition } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Cloud, Calendar as CalendarIcon, ClipboardList, Settings, LogOut, CheckCircle, XCircle, Info, ShieldAlert, Trash2, Clock, Smartphone } from 'lucide-react';
import { DateUtils, dayMap, DEFAULT_DISPLAY_ORDER, hashPassword, API_URL, defaultDB } from 'src/utils';

// 使用 lazy 動態載入我們剛建立的組件
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const AdminLogin = lazy(() => import('./components/AdminLogin'));


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




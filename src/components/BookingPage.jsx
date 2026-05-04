import React, { useState, useMemo } from 'react';
// 👇 請補上這一行，把用到的圖示全部請進來
import { ClipboardList, ShieldAlert, CheckCircle, XCircle, Info, Calendar as CalendarIcon, Clock } from 'lucide-react';
// 👇 您原本的 utils 引入
import { DateUtils, getNormalMinDate, calculateMaxDate, checkIsHoliday, getOverlappingSlots, normalizeAuthCode } from './utils.jsx';
// ==========================================
// 📝 頁面 2：預約登記 (BookingPage)
// ==========================================
export default function BookingPage({ db, api, showAlert, showConfirm }) {
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
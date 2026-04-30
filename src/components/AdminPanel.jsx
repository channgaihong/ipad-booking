import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx'; // 因為有 exportExcel，必須匯入 XLSX
import { 
  Settings, LogOut, CheckCircle, XCircle, Info, ShieldAlert, Trash2, Clock, Smartphone 
} from 'lucide-react'; // 將後台有用到的 Icon 都放進來

// ==========================================
// ⚙️ 全域設定與工具函式 (AdminPanel 需要用到的部分)
// ==========================================
const quoteChar = String.fromCharCode(34);
const doubleQuote = quoteChar + quoteChar;

const dayMap = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };

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

// ==========================================
// ⚙️ 頁面 4：管理後台 (AdminPanel) 包含左右選單
// ==========================================
function AdminPanel({ db, api, subPage, setSubPage, onLogout, showAlert, showConfirm, setPrintData }) {
  const [editModal, setEditModal] = useState({ show: false, type: null, index: null, data: null });
  const fileInputRef = useRef(null);

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

  const handleImportBackup = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!importedData.carts || !importedData.bookings) {
                 throw new Error("無效的備份檔案格式！遺失重要系統結構。");
            }
            const ok = await showConfirm("⚠️ 警告：匯入備份將完全覆蓋目前所有的系統與預約資料！\n確定要繼續嗎？", "匯入系統備份", "🚨");
            if (ok) {
                await api.adminOverwriteAll(importedData);
                showAlert("✅ 備份已成功還原！", "成功", "🎉");
            }
        } catch (error) {
            showAlert(`❌ 匯入失敗：${error.message}`, "錯誤", "❌");
        }
        event.target.value = ''; 
    };
    reader.readAsText(file);
  };

  const handleRepairSystem = async () => {
      const ok = await showConfirm("系統修復將會自動執行：\n1. 補齊遺失的系統預設設定\n2. 清除無效、損毀或重複的預約資料\n\n確定要執行修復嗎？", "一鍵修復系統", "🔧");
      if (!ok) return;

      let repairedDb = { ...db };
      
      repairedDb.carts = Array.isArray(repairedDb.carts) && repairedDb.carts.length > 0 ? repairedDb.carts : defaultDB.carts;
      repairedDb.classes = Array.isArray(repairedDb.classes) && repairedDb.classes.length > 0 ? repairedDb.classes : defaultDB.classes;
      repairedDb.timeSlots = Array.isArray(repairedDb.timeSlots) && repairedDb.timeSlots.length > 0 ? repairedDb.timeSlots : defaultDB.timeSlots;
      repairedDb.pickupMethods = Array.isArray(repairedDb.pickupMethods) && repairedDb.pickupMethods.length > 0 ? repairedDb.pickupMethods : defaultDB.pickupMethods;
      repairedDb.displaySettings = repairedDb.displaySettings || defaultDB.displaySettings;
      repairedDb.displayOrder = Array.isArray(repairedDb.displayOrder) && repairedDb.displayOrder.length > 0 ? repairedDb.displayOrder : defaultDB.displayOrder;
      repairedDb.holidays = Array.isArray(repairedDb.holidays) ? repairedDb.holidays : [];
      repairedDb.bookingCodes = Array.isArray(repairedDb.bookingCodes) ? repairedDb.bookingCodes : [];
      repairedDb.admins = Array.isArray(repairedDb.admins) && repairedDb.admins.length > 0 ? repairedDb.admins : defaultDB.admins;

      if (Array.isArray(repairedDb.bookings)) {
          let validBookings = [];
          let seenIds = new Set();
          repairedDb.bookings.forEach(b => {
              if (b && b.id && b.timeSlot && b.date && !seenIds.has(b.id)) {
                  seenIds.add(b.id);
                  if(!b.status) b.status = 'pending'; 
                  validBookings.push(b);
              }
          });
          repairedDb.bookings = validBookings;
      } else {
          repairedDb.bookings = [];
      }

      try {
          await api.adminOverwriteAll(repairedDb);
          showAlert("✅ 系統結構與資料修復完成！所有異常參數已自動校正。", "修復成功", "🔧");
      } catch(e) {
          showAlert("❌ 修復失敗：" + e.message, "錯誤", "❌");
      }
  };

  const clearData = () => {
      setEditModal({ show: true, type: 'clearBookings', index: -1, data: {} });
  };

  const openEdit = (type, index) => {
      let data = type === 'bookings' ? { ...db.bookings.find(x => x.id === index) } : { ...db[type][index] };
      setEditModal({ show: true, type, index, data });
  };

  const closeEdit = () => setEditModal({ show: false, type: null, index: null, data: null });

  const saveEdit = async () => {
      if (editModal.type === 'clearBookings') {
          const pwd = editModal.data.pwd?.trim();
          if (!pwd) return showAlert("請輸入密碼！", "提示", "⚠️");
          
          const hashedPwd = await hashPassword(pwd);
          if (hashedPwd !== loggedAdminHash) {
              return showAlert("密碼錯誤！拒絕清理。", "錯誤", "❌");
          }
          
          const uDb = {...db, bookings: []};
          try {
              await api.adminOverwriteAll(uDb);
              closeEdit();
              showAlert("✅ 已成功清空所有歷史預約紀錄。", "清理完成", "🗑️");
          } catch(e) {
              showAlert("❌ 清空失敗：" + e.message, "錯誤", "❌");
          }
          return;
      }

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
              b.observation = editModal.data.observation || '否';
              b.itSupport = editModal.data.itSupport || '否';
              b.pickupMethod = editModal.data.pickupMethod;
              
              try {
                  await api.adminUpdateBookings([b]);
                  closeEdit();
              } catch(e) {
                  showAlert("❌ 儲存失敗：" + e.message, "錯誤", "❌");
              }
          }
      } else {
          uDb[editModal.type][editModal.index] = editModal.data;
          if (editModal.type === 'admins' && editModal.data.newPassword) {
              uDb.admins[editModal.index].password = await hashPassword(editModal.data.newPassword);
              delete uDb.admins[editModal.index].newPassword;
          }
          try {
              await api.adminSaveSettings(uDb);
              closeEdit();
          } catch(e) {
              showAlert("❌ 儲存設定失敗：" + e.message, "錯誤", "❌");
          }
      }
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
            <button onClick={backupSystem} className="text-left px-4 py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-sm font-bold shadow-sm hover:bg-blue-100 transition-colors flex items-center gap-3"><span className="text-lg">💾</span> 系統備份導出</button>
            
            {/* 隱藏的檔案上傳標籤 */}
            <input type="file" ref={fileInputRef} onChange={handleImportBackup} accept=".json" className="hidden" />
            
            <button onClick={() => fileInputRef.current.click()} className="text-left px-4 py-3 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl text-sm font-bold shadow-sm hover:bg-orange-100 transition-colors flex items-center gap-3"><span className="text-lg">📂</span> 匯入備份還原</button>
            <button onClick={handleRepairSystem} className="text-left px-4 py-3 bg-purple-50 border border-purple-200 text-purple-700 rounded-xl text-sm font-bold shadow-sm hover:bg-purple-100 transition-colors flex items-center gap-3"><span className="text-lg">🔧</span> 一鍵修復系統</button>
            <button onClick={clearData} className="text-left px-4 py-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-bold shadow-sm hover:bg-red-100 transition-colors flex items-center gap-3"><span className="text-lg">⚠️</span> 清理歷史紀錄</button>
            
            <button onClick={onLogout} className="text-left px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold mt-4 hover:bg-slate-200 transition-colors flex justify-center items-center gap-2 border border-slate-200"><LogOut className="w-4 h-4" /> 安全登出</button>
        </div>

        {/* 右側內容區塊 */}
        <div className="flex-grow min-w-0">
            {subPage === 'assign' && <AdminAssign db={db} api={api} showAlert={showAlert} showConfirm={showConfirm} setPrintData={setPrintData} openEdit={openEdit} />}
            {subPage === 'display' && <AdminDisplay db={db} api={api} showAlert={showAlert} />}
            {subPage === 'timeslots' && <AdminTimeSlots db={db} api={api} showAlert={showAlert} showConfirm={showConfirm} openEdit={openEdit} />}
            {subPage === 'classes' && <AdminClasses db={db} api={api} showAlert={showAlert} showConfirm={showConfirm} openEdit={openEdit} />}
            {subPage === 'carts' && <AdminCarts db={db} api={api} showAlert={showAlert} showConfirm={showConfirm} openEdit={openEdit} />}
            {subPage === 'pickups' && <AdminPickups db={db} api={api} showAlert={showAlert} showConfirm={showConfirm} openEdit={openEdit} />}
            {subPage === 'codes' && <AdminCodes db={db} api={api} showAlert={showAlert} showConfirm={showConfirm} />}
            {subPage === 'holidays' && <AdminHolidays db={db} api={api} showAlert={showAlert} showConfirm={showConfirm} />}
            {subPage === 'admins' && <AdminAdmins db={db} api={api} showAlert={showAlert} showConfirm={showConfirm} openEdit={openEdit} />}
        </div>
      </div>

      {/* 統一編輯 Modal */}
      {editModal.show && (
          <div className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
              <div className="bg-white p-6 md:p-8 rounded-3xl w-full max-w-md shadow-2xl">
                  <h3 className="text-xl font-extrabold mb-4 border-b border-slate-100 pb-3 text-slate-800">
                    {editModal.type === 'clearBookings' ? <span className="text-red-600 flex items-center gap-2"><ShieldAlert /> 嚴重警告：清理歷史紀錄</span> : '編輯項目'}
                  </h3>
                  <div className="space-y-4 mt-4">
                      {editModal.type === 'clearBookings' && (
                          <div className="space-y-4">
                              <p className="text-sm text-slate-700 font-medium">此操作將會永久刪除所有預約紀錄，且無法復原！</p>
                              <div>
                                  <label className="text-xs text-slate-500 block mb-1">請輸入管理員密碼以確認執行</label>
                                  <input type="password" value={editModal.data.pwd || ''} onChange={e => setEditModal(p => ({...p, data: {...p.data, pwd: e.target.value}}))} className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" placeholder="目前登入的管理員密碼" />
                              </div>
                          </div>
                      )}
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
                              <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">觀課</label>
                                    <select value={editModal.data.observation || '否'} onChange={e=>setEditModal(p=>({...p, data:{...p.data, observation: e.target.value}}))} className="w-full p-2.5 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-sky-400">
                                        <option value="否">否</option>
                                        <option value="是">是</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">需 IT 協助</label>
                                    <select value={editModal.data.itSupport || '否'} onChange={e=>setEditModal(p=>({...p, data:{...p.data, itSupport: e.target.value}}))} className="w-full p-2.5 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-sky-400">
                                        <option value="否">否</option>
                                        <option value="是">是</option>
                                    </select>
                                  </div>
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
                              <div><label className="flex items-center text-sm font-bold text-slate-600"><input type="checkbox" checked={editModal.data.showRemark || false} onChange={e=>setEditModal(p=>({...p, data:{...p.data, showRemark: e.target.checked}}))} className="mr-2" /> 顯示備註於預約表單中</label></div>
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
                      <button onClick={saveEdit} className={`px-5 py-2.5 text-white rounded-xl font-bold shadow-md transition-colors w-full sm:w-auto ${editModal.type === 'clearBookings' ? 'bg-red-600 hover:bg-red-700' : 'bg-sky-600 hover:bg-sky-700'}`}>儲存變更</button>
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

function AdminAssign({ db, api, showAlert, showConfirm, setPrintData, openEdit }) {
    const [printDate, setPrintDate] = useState(DateUtils.toISODate(DateUtils.today()));
    const [filterDate, setFilterDate] = useState(DateUtils.toISODate(DateUtils.today()));
    const [selectedCartsForPrint, setSelectedCarts] = useState([]);
    const [ipadModal, setIpadModal] = useState({ show: false, bId: null, cartId: null, selectedIpads: [] });
    const [pendingInputs, setPendingInputs] = useState({});

    const pending = db.bookings.filter(b => b.status === 'pending');
    
    // 💡 依據設定檔的時段順序進行智慧排序
    const timeSlotOrder = {};
    db.timeSlots.forEach((ts, idx) => { timeSlotOrder[ts.name] = idx; });
    const processed = db.bookings.filter(b => b.status !== 'pending' && b.date === filterDate).sort((a, b) => {
        const orderA = timeSlotOrder[a.timeSlot] ?? 999;
        const orderB = timeSlotOrder[b.timeSlot] ?? 999;
        return orderA - orderB;
    });

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

        const updatedB = { ...b, status: 'assigned', cartAssignedId: cid, cartAssignedName: cart.name, ipadNumbers: stringifyIpadNumbers(parsedIpads) };
        if(pickup) updatedB.pickupMethod = pickup;
        
        try {
            await api.adminUpdateBookings([updatedB]);
            showAlert("✅ 成功分配車輛！", "成功", "✅");
        } catch(e) {
            showAlert("❌ 處理失敗：" + e.message, "錯誤", "❌");
        }
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
                    <button onClick={handlePrint} className="w-full lg:w-auto bg-sky-700 text-white px-8 py-3 rounded-xl font-extrabold shadow-lg hover:bg-sky-800 hover:-translate-y-0.5 transition-all whitespace-nowrap">列印</button>
                </div>
            </div>

            {/* 待處理 */}
            <div className="bg-white p-6 md:p-8 rounded-3xl border shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b pb-3 gap-3">
                    <h2 className="text-xl md:text-2xl font-extrabold text-slate-800 flex items-center gap-2"><Clock className="text-amber-500" /> 待處理預約</h2>
                    <button onClick={async () => {
                        const pendingBookings = db.bookings.filter(b => b.status === 'pending');
                        let updatedList = []; let hasError = false;

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

                                updatedList.push({ ...b, status: 'assigned', cartAssignedId: cid, cartAssignedName: cart.name, ipadNumbers: finalIpadString, pickupMethod: pickup });
                            }
                        }
                        if (updatedList.length > 0) { 
                            try {
                                await api.adminUpdateBookings(updatedList);
                                showAlert(`✅ 已成功批量核准 ${updatedList.length} 筆預約！`, "成功", "✅"); 
                            } catch(e) {
                                showAlert("❌ 處理失敗：" + e.message, "錯誤", "❌");
                            }
                        } 
                        else if (!hasError) { showAlert("請至少為一筆預約選擇分配車輛！", "提示", "⚠️"); }
                    }} className="w-full sm:w-auto bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-sky-700 transition-colors">一鍵批量核准</button>
                </div>
                <div className="overflow-x-auto custom-scrollbar pb-2">
                    {pending.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200"><CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-50" /> 目前沒有待處理的預約</div>
                    ) : (
                        <table className="w-full text-sm text-left min-w-[800px]">
                            <thead className="bg-slate-50 border-b text-xs uppercase text-slate-500 font-extrabold">
                                <tr><th className="px-4 py-3 rounded-tl-xl">時間 / 需求</th><th className="px-4 py-3">分配車輛 & 方式</th><th className="px-4 py-3 w-1/4">iPad 編號 (可開網格)</th><th className="px-4 py-3 text-center rounded-tr-xl w-24">操作</th></tr>
                            </thead>
                            <tbody>
                                {pending.map(b => (
                                    <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            <div className="font-bold text-slate-800">{b.date}</div><div className="text-slate-500">{b.timeSlot}</div>
                                            <div className="mt-2 font-bold text-sky-700">
                                              {b.teacher} 
                                              <span className="text-xs bg-sky-100 px-1.5 py-0.5 rounded text-sky-800 ml-1">{b.className} ({b.peopleCount}人)</span> 
                                              {b.observation === '是' && (<span className="text-[10px] bg-red-100 text-red-600 px-1 py-0.5 rounded ml-1 font-bold">觀課</span>)}
                                            </div>
                                            {b.remarks && (<div className="mt-1.5 text-xs text-slate-500 italic bg-slate-100 p-1.5 rounded border border-slate-200 whitespace-pre-wrap break-words">備註: {b.remarks}</div>)}
                                        </td>
                                        <td className="px-4 py-4 space-y-2">
                                            <select value={getPendingVal(b.id, 'cart', '')} onChange={(e) => updatePending(b.id, 'cart', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg py-2 px-2 outline-none focus:ring-2 focus:ring-sky-400 bg-white font-bold text-slate-700"><option value="">--選擇車輛--</option>{db.carts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
                                            <select value={getPendingVal(b.id, 'pickup', b.pickupMethod)} onChange={(e) => updatePending(b.id, 'pickup', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg py-1.5 px-2 outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50 text-slate-600">{db.pickupMethods.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex shadow-sm rounded-lg w-full">
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
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b pb-3 gap-3">
                    <h2 className="text-xl md:text-2xl font-extrabold flex items-center gap-2 text-gray-800"><CheckCircle className="text-emerald-500" /> 已處理紀錄</h2>
                    <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-400 font-bold bg-slate-50" />
                </div>
                <div className="overflow-x-auto custom-scrollbar pb-2">
                    <table className="w-full text-sm text-left min-w-[600px]">
                        <thead className="bg-slate-50 border-b text-xs uppercase text-slate-500 font-extrabold">
                            <tr><th className="px-4 py-3 rounded-tl-xl">預約時間</th><th className="px-4 py-3">教師 / 需求</th><th className="px-4 py-3">狀態 / 分配結果</th><th className="px-4 py-3 text-center">操作</th></tr>
                        </thead>
                        <tbody>
                            {processed.length === 0 ? (
                                <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-400">該日期尚無已處理的預約</td></tr>
                            ) : (
                                processed.map(b => (
                                    <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3 text-xs whitespace-nowrap"><b>{b.date}</b><br />{b.timeSlot}</td>
                                        <td className="px-4 py-3 text-xs">
                                            <b>{b.teacher}</b><br /><span className="text-slate-500">{b.className} ({b.peopleCount}人)</span>
                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                {b.observation === '是' && <span className="text-[10px] text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded font-bold">觀課</span>}
                                                {b.itSupport === '是' && <span className="text-[10px] text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded font-bold">需IT</span>}
                                            </div>
                                            {b.remarks && <div className="mt-1.5 text-[11px] text-sky-700 bg-sky-50 border border-sky-100 px-2 py-1 rounded block w-full whitespace-pre-wrap break-words">備註: {b.remarks}</div>}
                                        </td>
                                        <td className="px-4 py-3 text-xs">
                                            {b.status === 'assigned' && (<span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded border border-emerald-200">✅ 已分配</span>)}
                                            {b.status === 'rejected' && (<span className="text-red-500 font-bold bg-red-50 px-2 py-1 rounded border border-red-200">❌ 已退回</span>)}
                                            {b.status === 'cancelled' && (<span className="text-slate-500 font-bold bg-slate-100 px-2 py-1 rounded border border-slate-200">⛔ 已取消</span>)}
                                            <div className="mt-2 text-slate-600 font-medium">{b.cartAssignedName ? `🚗 ${b.cartAssignedName}` : ''} {b.ipadNumbers ? (<><br/>📱 {b.ipadNumbers}</>) : ''}</div>
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
                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 w-full">
                                {Array.from({length: db.carts.find(c=>c.id==ipadModal.cartId)?.capacity || 30}).map((_, i) => {
                                    const numStr = (i+1).toString();
                                    const cart = db.carts.find(c=>c.id==ipadModal.cartId);
                                    const damaged = (cart?.damaged || "").split(',').map(x=>x.trim()).filter(x=>x);
                                    const b = db.bookings.find(x=>x.id===ipadModal.bId);
                                    const used = getUsedIpads(b.date, b.timeSlot, cart.id, b.id, db);
                                    
                                    const isDamaged = damaged.includes(numStr);
                                    const isUsed = used.includes(numStr);
                                    const isSelected = ipadModal.selectedIpads.includes(numStr);

                                    if (isDamaged) return (<div key={i} className="aspect-square p-1 sm:p-2 border rounded bg-red-100 text-red-500 flex items-center justify-center text-xs font-bold border-red-200 line-through">壞</div>);
                                    if (isUsed) return (<div key={i} className="aspect-square p-1 sm:p-2 border rounded bg-slate-100 text-slate-400 flex items-center justify-center text-xs font-bold border-slate-200 cursor-not-allowed">{numStr}</div>);
                                    
                                    return (
                                        <button key={i} onClick={() => {
                                            setIpadModal(p => ({...p, selectedIpads: p.selectedIpads.includes(numStr) ? p.selectedIpads.filter(x=>x!==numStr) : [...p.selectedIpads, numStr]}));
                                        }} className={`aspect-square p-1 sm:p-2 border rounded flex items-center justify-center text-xs sm:text-sm font-extrabold transition-all transform hover:scale-105 shadow-sm ${isSelected ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-sky-600 border-sky-200 hover:bg-sky-50'}`}>{numStr}</button>
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

function AdminDisplay({ db, api, showAlert }) {
    const ds = db.displaySettings || { teacher: true, className: true, observation: true, ipadNumbers: true, pickupMethod: false, itSupport: false, remarks: false };
    const order = db.displayOrder || DEFAULT_DISPLAY_ORDER;
    const [localDs, setLocalDs] = useState(ds);
    const [localOrder, setLocalOrder] = useState(order);
    const [draggedIdx, setDraggedIdx] = useState(null);

    const handleSave = async () => {
        const uDb = {...db, displaySettings: localDs, displayOrder: localOrder};
        try {
            await api.adminSaveSettings(uDb);
            showAlert("✅ 設定已儲存！", "成功", "✅");
        } catch(e) {
            showAlert("❌ 儲存失敗：" + e.message, "錯誤", "❌");
        }
    };

    const handleDrop = (e, dropIndex) => {
        e.preventDefault();
        if (draggedIdx === null || draggedIdx === dropIndex) return;
        const newArr = [...localOrder];
        const item = newArr.splice(draggedIdx, 1)[0];
        newArr.splice(dropIndex, 0, item);
        setLocalOrder(newArr);
        setDraggedIdx(null);
    };

    const handleOrderChange = (oldIndex, newOrderStr) => {
        let newIndex = parseInt(newOrderStr, 10) - 1;
        const arr = [...localOrder];
        if (isNaN(newIndex) || newIndex < 0) newIndex = 0;
        if (newIndex >= arr.length) newIndex = arr.length - 1;
        if (newIndex === oldIndex) return; 

        const item = arr.splice(oldIndex, 1)[0];
        arr.splice(newIndex, 0, item);
        setLocalOrder(arr);
    };

    const labelMap = {teacher:'教師姓名', className:'班級名稱', observation:'觀課提醒', ipadNumbers:'iPad編號', pickupMethod:'取機方式', itSupport:'IT協助', remarks:'備註說明'};

    return (
        <div className="bg-white p-6 md:p-8 rounded-3xl border shadow-sm animate-fade-in">
            <h3 className="text-2xl font-extrabold mb-6 text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2"><Settings className="text-sky-600" /> 總覽表顯示項目</h3>
            <p className="text-sm text-slate-500 mb-6">自訂前台「每日充電車時間表」格子內呈現的資訊與順序 <span className="text-sky-600 font-bold">(可直接輸入數字或拖拉 ☰ 排序)</span>：</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                {localOrder.map((key, idx) => (
                    <li key={key} 
                        draggable 
                        onDragStart={() => setDraggedIdx(idx)} 
                        onDragOver={e => e.preventDefault()} 
                        onDrop={e => handleDrop(e, idx)}
                        className="flex items-center justify-between space-x-3 bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm hover:border-sky-300 cursor-grab active:cursor-grabbing">
                        <div className="flex items-center w-full">
                            <div className="text-slate-400 text-lg mr-2">☰</div>
                            <input type="number" min="1" max={localOrder.length} value={idx + 1} onChange={(e) => handleOrderChange(idx, e.target.value)} className="w-12 px-1 py-1 mr-3 text-center border border-slate-300 rounded text-sm outline-none focus:border-sky-500" />
                            <label className="flex items-center space-x-3 cursor-pointer font-bold text-slate-700 w-full">
                                <input type="checkbox" checked={localDs[key] || false} onChange={(e) => setLocalDs({...localDs, [key]: e.target.checked})} className="accent-sky-600 w-4 h-4" /> 
                                <span>{labelMap[key]}</span>
                            </label>
                        </div>
                    </li>
                ))}
            </ul>
            <button onClick={handleSave} className="px-8 py-3.5 bg-slate-900 text-white rounded-xl text-base font-extrabold shadow-lg hover:bg-slate-800 transition-all hover:-translate-y-0.5">儲存顯示設定</button>
        </div>
    );
}

function AdminTimeSlots({ db, api, showAlert, showConfirm, openEdit }) {
    const [name, setName] = useState(''); const [time, setTime] = useState(''); const [quota, setQuota] = useState(''); const [remark, setRemark] = useState(''); const [showRmk, setShowRmk] = useState(true); const [days, setDays] = useState([1,2,3,4,5,6,0]);
    const [draggedIdx, setDraggedIdx] = useState(null);

    const handleAdd = async () => {
        if(!name) return showAlert("請填寫時段名稱", "提示", "⚠️"); if(days.length===0) return showAlert("請勾選適用星期", "提示", "⚠️");
        const uDb = {...db, timeSlots: [...db.timeSlots, {id: Date.now(), name, timeRange: time, remark, showRemark: showRmk, quota: parseInt(quota, 10)||db.carts.length, applicableDays: days}]};
        try { await api.adminSaveSettings(uDb); setName(''); setTime(''); setQuota(''); setRemark(''); } catch(e) {}
    };
    
    const handleDel = async (i) => { if(await showConfirm("確定刪除此時段？")) { const uDb = {...db}; uDb.timeSlots.splice(i,1); try { await api.adminSaveSettings(uDb); } catch(e){} } };

    const handleDrop = async (e, dropIndex) => {
        e.preventDefault();
        if (draggedIdx === null || draggedIdx === dropIndex) return;
        const newArr = [...db.timeSlots];
        const item = newArr.splice(draggedIdx, 1)[0];
        newArr.splice(dropIndex, 0, item);
        try { await api.adminSaveSettings({ ...db, timeSlots: newArr }); setDraggedIdx(null); } catch(e){}
    };

    const handleOrderChange = async (oldIndex, newOrderStr) => {
        let newIndex = parseInt(newOrderStr, 10) - 1;
        const arr = [...db.timeSlots];
        if (isNaN(newIndex) || newIndex < 0) newIndex = 0;
        if (newIndex >= arr.length) newIndex = arr.length - 1;
        if (newIndex === oldIndex) return;

        const item = arr.splice(oldIndex, 1)[0];
        arr.splice(newIndex, 0, item);
        try { await api.adminSaveSettings({ ...db, timeSlots: arr }); } catch(e){}
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
                            <div className="flex items-center mr-4">
                                <div className="text-slate-400 text-lg mr-2 cursor-grab">☰</div>
                                <input type="number" min="1" max={db.timeSlots.length} value={i + 1} onChange={(e) => handleOrderChange(i, e.target.value)} className="w-12 px-1 py-1 text-center border border-slate-300 rounded text-sm outline-none focus:border-sky-500" />
                            </div>
                            <div>
                                <div className="font-extrabold text-lg text-slate-800">{s.name} <span className="text-sm font-normal text-slate-500 ml-2">{s.timeRange}</span> <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full ml-2">名額:{s.quota}</span></div>
                                <div className="text-xs text-slate-500 mt-1.5 flex items-center gap-2">
                                    <span className="bg-slate-100 px-1.5 rounded text-slate-600">星期 {s.applicableDays?.map(d=>dayMap[d]).join(',')}</span>
                                    {s.remark && (<span className="italic">備註: {s.remark} <span className="font-bold text-sky-600">{s.showRemark?'(顯示)':'(不顯示)'}</span></span>)}
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

function AdminClasses({ db, api, showAlert, showConfirm, openEdit }) {
    const [name, setName] = useState(''); const [limit, setLimit] = useState(30);
    const [draggedIdx, setDraggedIdx] = useState(null);

    const handleAdd = async () => {
        if(!name) return showAlert("請填寫班級", "提示", "⚠️");
        const uDb = {...db, classes: [...db.classes, {id: Date.now(), name, limit}]};
        try { await api.adminSaveSettings(uDb); setName(''); setLimit(30); } catch(e){}
    };
    const handleDel = async (i) => { if(await showConfirm("確定刪除？")) { const uDb = {...db}; uDb.classes.splice(i,1); try { await api.adminSaveSettings(uDb); } catch(e){} } };

    const handleDrop = async (e, dropIndex) => {
        e.preventDefault();
        if (draggedIdx === null || draggedIdx === dropIndex) return;
        const newArr = [...db.classes];
        const item = newArr.splice(draggedIdx, 1)[0];
        newArr.splice(dropIndex, 0, item);
        try { await api.adminSaveSettings({ ...db, classes: newArr }); setDraggedIdx(null); } catch(e){}
    };

    const handleOrderChange = async (oldIndex, newOrderStr) => {
        let newIndex = parseInt(newOrderStr, 10) - 1;
        const arr = [...db.classes];
        if (isNaN(newIndex) || newIndex < 0) newIndex = 0;
        if (newIndex >= arr.length) newIndex = arr.length - 1;
        if (newIndex === oldIndex) return;

        const item = arr.splice(oldIndex, 1)[0];
        arr.splice(newIndex, 0, item);
        try { await api.adminSaveSettings({ ...db, classes: arr }); } catch(e){}
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
                        <div className="flex items-center w-full">
                            <div className="flex items-center mr-4">
                                <div className="text-slate-400 text-lg mr-2 cursor-grab">☰</div>
                                <input type="number" min="1" max={db.classes.length} value={i + 1} onChange={(e) => handleOrderChange(i, e.target.value)} className="w-12 px-1 py-1 text-center border border-slate-300 rounded text-sm outline-none focus:border-sky-500" />
                            </div>
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

function AdminCarts({ db, api, showAlert, showConfirm, openEdit }) {
    const [name, setName] = useState(''); const [cap, setCap] = useState(30);
    const [draggedIdx, setDraggedIdx] = useState(null);

    const handleAdd = async () => {
        if(!name) return showAlert("請填寫車輛", "提示", "⚠️");
        const uDb = {...db, carts: [...db.carts, {id: Date.now(), name, capacity: cap, damaged: ''}]};
        try { await api.adminSaveSettings(uDb); setName(''); setCap(30); } catch(e){}
    };
    const handleDel = async (i) => { if(await showConfirm("確定刪除？")) { const uDb = {...db}; uDb.carts.splice(i,1); try { await api.adminSaveSettings(uDb); } catch(e){} } };

    const handleDrop = async (e, dropIndex) => {
        e.preventDefault();
        if (draggedIdx === null || draggedIdx === dropIndex) return;
        const newArr = [...db.carts];
        const item = newArr.splice(draggedIdx, 1)[0];
        newArr.splice(dropIndex, 0, item);
        try { await api.adminSaveSettings({ ...db, carts: newArr }); setDraggedIdx(null); } catch(e){}
    };

    const handleOrderChange = async (oldIndex, newOrderStr) => {
        let newIndex = parseInt(newOrderStr, 10) - 1;
        const arr = [...db.carts];
        if (isNaN(newIndex) || newIndex < 0) newIndex = 0;
        if (newIndex >= arr.length) newIndex = arr.length - 1;
        if (newIndex === oldIndex) return;

        const item = arr.splice(oldIndex, 1)[0];
        arr.splice(newIndex, 0, item);
        try { await api.adminSaveSettings({ ...db, carts: arr }); } catch(e){}
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
                        <div className="flex items-center w-full">
                            <div className="flex items-center mr-4">
                                <div className="text-slate-400 text-lg mr-2 cursor-grab">☰</div>
                                <input type="number" min="1" max={db.carts.length} value={i + 1} onChange={(e) => handleOrderChange(i, e.target.value)} className="w-12 px-1 py-1 text-center border border-slate-300 rounded text-sm outline-none focus:border-sky-500" />
                            </div>
                            <div className="font-extrabold text-lg text-slate-800">{c.name} <span className="text-sm font-normal text-slate-500 ml-2">({c.capacity}台)</span></div>
                        </div>
                        <div className="space-x-2">
                            <button onClick={() => openEdit('carts', i)} className="text-sky-600 text-xs font-bold hover:underline bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-200">編輯</button>
                            <button onClick={() => handleDel(i)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function AdminPickups({ db, api, showAlert, showConfirm, openEdit }) {
    const [name, setName] = useState('');
    const [draggedIdx, setDraggedIdx] = useState(null);

    const handleAdd = async () => {
        if(!name) return showAlert("請填寫名稱", "提示", "⚠️");
        const uDb = {...db, pickupMethods: [...db.pickupMethods, {id: Date.now(), name}]};
        try { await api.adminSaveSettings(uDb); setName(''); } catch(e){}
    };
    const handleDel = async (i) => { 
        if(db.pickupMethods.length<=1) return showAlert("需保留至少一種方式", "提示", "⚠️");
        if(await showConfirm("確定刪除？")) { const uDb = {...db}; uDb.pickupMethods.splice(i,1); try { await api.adminSaveSettings(uDb); } catch(e){} } 
    };

    const handleDrop = async (e, dropIndex) => {
        e.preventDefault();
        if (draggedIdx === null || draggedIdx === dropIndex) return;
        const newArr = [...db.pickupMethods];
        const item = newArr.splice(draggedIdx, 1)[0];
        newArr.splice(dropIndex, 0, item);
        try { await api.adminSaveSettings({ ...db, pickupMethods: newArr }); setDraggedIdx(null); } catch(e){}
    };

    const handleOrderChange = async (oldIndex, newOrderStr) => {
        let newIndex = parseInt(newOrderStr, 10) - 1;
        const arr = [...db.pickupMethods];
        if (isNaN(newIndex) || newIndex < 0) newIndex = 0;
        if (newIndex >= arr.length) newIndex = arr.length - 1;
        if (newIndex === oldIndex) return;

        const item = arr.splice(oldIndex, 1)[0];
        arr.splice(newIndex, 0, item);
        try { await api.adminSaveSettings({ ...db, pickupMethods: arr }); } catch(e){}
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
                        <div className="flex items-center w-full">
                            <div className="flex items-center mr-4">
                                <div className="text-slate-400 text-lg mr-2 cursor-grab">☰</div>
                                <input type="number" min="1" max={db.pickupMethods.length} value={i + 1} onChange={(e) => handleOrderChange(i, e.target.value)} className="w-12 px-1 py-1 text-center border border-slate-300 rounded text-sm outline-none focus:border-sky-500" />
                            </div>
                            <div className="font-bold text-slate-700">{p.name}</div>
                        </div>
                        <div className="space-x-2 flex-shrink-0">
                            <button onClick={() => openEdit('pickupMethods', i)} className="text-sky-600 text-xs font-bold hover:underline bg-sky-50 px-2 py-1 rounded border border-sky-200">編輯</button>
                            <button onClick={() => handleDel(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function AdminCodes({ db, api, showAlert, showConfirm }) {
    const generate = async () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = '';
        for(let i=0; i<6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
        const uDb = {...db, bookingCodes: [...db.bookingCodes, {code, used: false, createdAt: new Date().toISOString()}]};
        try { await api.adminSaveSettings(uDb); } catch(e){}
    };
    const handleDel = async (codeStr) => {
        if(await showConfirm("確定刪除此授權碼？")) {
            const uDb = {...db, bookingCodes: db.bookingCodes.filter(c=>c.code!==codeStr)};
            try { await api.adminSaveSettings(uDb); } catch(e){}
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

function AdminHolidays({ db, api, showAlert, showConfirm }) {
    const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [remark, setRemark] = useState('');
    const handleAdd = async () => {
        if(!start || !end || !remark) return showAlert("請完整填寫日期與原因", "提示", "⚠️");
        if(start > end) return showAlert("開始日期不能大於結束日期", "錯誤", "❌");
        const uDb = {...db, holidays: [...db.holidays, {id: Date.now(), startDate: start, endDate: end, remark}]};
        try { await api.adminSaveSettings(uDb); setStart(''); setEnd(''); setRemark(''); } catch(e){}
    };
    const handleDel = async (i) => { if(await showConfirm("確定刪除？")) { const uDb = {...db}; uDb.holidays.splice(i,1); try { await api.adminSaveSettings(uDb); } catch(e){} } };

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

function AdminAdmins({ db, api, showAlert, showConfirm, openEdit }) {
    const [u, setU] = useState(''); const [p, setP] = useState('');
    const handleAdd = async () => {
        if(!u || !p) return showAlert("請填寫帳號密碼", "提示", "⚠️");
        if(db.admins.find(a=>a.username===u)) return showAlert("帳號已存在", "錯誤", "❌");
        try {
            const hashedPwd = await hashPassword(p);
            const uDb = {...db, admins: [...db.admins, {username: u, password: hashedPwd}]};
            await api.adminSaveSettings(uDb); 
            setU(''); setP('');
        } catch(e) {}
    };
    const handleDel = async (i) => {
        if(db.admins.length<=1) return showAlert("需保留至少一個帳號", "提示", "⚠️");
        if(await showConfirm("確定刪除？")) { const uDb = {...db}; uDb.admins.splice(i,1); try { await api.adminSaveSettings(uDb); } catch(e){} }
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
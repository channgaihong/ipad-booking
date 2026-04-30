import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx'; 
import { Settings, LogOut, CheckCircle, XCircle, Info, ShieldAlert, Trash2, Clock, Smartphone } from 'lucide-react';

import AdminAssign from './AdminAssign';
import AdminDisplay from './AdminDisplay';
import AdminTimeSlots from './AdminTimeSlots';
import AdminClasses from './AdminClasses';
import AdminCarts from './AdminCarts';
import AdminPickups from './AdminPickups';
import AdminCodes from './AdminCodes';
import AdminHolidays from './AdminHolidays';
import AdminAdmins from './AdminAdmins';

// ==========================================
// ⚙️ 全域設定與工具函式 (AdminPanel 需要用到的部分)
// ==========================================
const slashChar = String.fromCharCode(47);
const quoteChar = String.fromCharCode(34);
const doubleQuote = quoteChar + quoteChar;
const dayMap = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };

const DEFAULT_DISPLAY_ORDER = ['observation', 'teacher', 'className', 'pickupMethod', 'itSupport', 'ipadNumbers', 'remarks'];

const DateUtils = {
  today: () => new Date(),
  toISODate: (date) => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  },
  toChineseDate: (dateStr) => {
    if(!dateStr) return "";
    const d = new Date(dateStr);
    return d.getFullYear() + "年 " + (d.getMonth() + 1) + "月 " + d.getDate() + "日 (星期" + dayMap[d.getDay()] + ")";
  }
};

// ==========================================
// ⚙️ 頁面 4：管理後台 (AdminPanel) 包含左右選單
// ==========================================
export default function AdminPanel({ db, api, subPage, setSubPage, onLogout, showAlert, showConfirm, setPrintData }) {
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
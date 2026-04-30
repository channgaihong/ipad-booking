import React, { useState, useEffect, useMemo, useRef, lazy, Suspense, startTransition } from 'react';
import { Cloud, Calendar as CalendarIcon, ClipboardList, Settings, LogOut, CheckCircle, XCircle, Info, ShieldAlert, Trash2, Clock, Smartphone } from 'lucide-react';

export default function AdminDisplay({ db, api, showAlert }) {
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
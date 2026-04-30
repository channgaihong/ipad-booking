import React, { useState, useEffect, useMemo, useRef, lazy, Suspense, startTransition } from 'react';
import { Cloud, Calendar as CalendarIcon, ClipboardList, Settings, LogOut, CheckCircle, XCircle, Info, ShieldAlert, Trash2, Clock, Smartphone } from 'lucide-react';

export default function AdminPickups({ db, api, showAlert, showConfirm, openEdit }) {
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
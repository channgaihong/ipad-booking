import React, { useState, useEffect, useMemo, useRef, lazy, Suspense, startTransition } from 'react';
import { Cloud, Calendar as CalendarIcon, ClipboardList, Settings, LogOut, CheckCircle, XCircle, Info, ShieldAlert, Trash2, Clock, Smartphone } from 'lucide-react';

export default function AdminTimeSlots({ db, api, showAlert, showConfirm, openEdit }) {
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
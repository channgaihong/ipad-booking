import React, { useState, useEffect, useMemo, useRef, lazy, Suspense, startTransition } from 'react';
import { Cloud, Calendar as CalendarIcon, ClipboardList, Settings, LogOut, CheckCircle, XCircle, Info, ShieldAlert, Trash2, Clock, Smartphone } from 'lucide-react';

export default function AdminAdmins({ db, api, showAlert, showConfirm, openEdit }) {
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
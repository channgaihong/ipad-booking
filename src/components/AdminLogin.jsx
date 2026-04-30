// src/components/AdminLogin.jsx
import React, { useState } from 'react';
import { Settings } from 'lucide-react'; // 登入畫面有用到 Settings 這個 Icon

// ==========================================
// 🔒 頁面 3：管理員登入 (AdminLogin)
// ==========================================
export default function AdminLogin({ onLogin }) {
  const [u, setU] = useState(''); 
  const [p, setP] = useState('');
  return (
    <div className="max-w-md mx-auto mt-16 bg-white p-8 rounded-3xl border shadow-2xl animate-fade-in">
        <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg"><Settings className="w-8 h-8 text-white" /></div>
        <h2 className="text-2xl font-extrabold text-center mb-8 text-slate-800">管理後台登入</h2>
        <div className="space-y-4">
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1 uppercase tracking-wider">Username</label>
                <input type="text" value={u} onChange={(e) => setU(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 transition-shadow font-medium" placeholder="管理員帳號" />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1 uppercase tracking-wider">Password</label>
                <input type="password" value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onLogin(u,p)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 transition-shadow font-medium" placeholder="密碼" />
            </div>
            <button onClick={() => onLogin(u, p)} className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-extrabold shadow-lg hover:bg-slate-800 transition-all transform hover:-translate-y-0.5 mt-4">登入系統</button>
        </div>
    </div>
  );
}
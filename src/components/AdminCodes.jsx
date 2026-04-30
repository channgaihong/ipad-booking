export default function AdminCodes({ db, api, showAlert, showConfirm }) {
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
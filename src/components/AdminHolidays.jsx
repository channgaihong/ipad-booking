export default function AdminHolidays({ db, api, showAlert, showConfirm }) {
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
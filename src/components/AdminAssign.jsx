import React, { useState, useEffect, useMemo, useRef, lazy, Suspense, startTransition } from 'react';
import { Cloud, Calendar as CalendarIcon, ClipboardList, Settings, LogOut, CheckCircle, XCircle, Info, ShieldAlert, Trash2, Clock, Smartphone } from 'lucide-react';
import { DateUtils, stringifyIpadNumbers, parseIpadNumbers } from './utils';

export default function AdminAssign({ db, api, showAlert, showConfirm, setPrintData, openEdit }) {
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

import React,{ useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { DateUtils, DEFAULT_DISPLAY_ORDER, dayMap } from './utils.jsx'; 

// ==========================================
// 📅 頁面 1：每日時間表 (SchedulePage)
// ==========================================
export default function SchedulePage({ db }) {
  const [date, setDate] = useState(DateUtils.toISODate(DateUtils.today()));
  
  const targetDay = new Date(date).getDay();
  const dayBookings = db.bookings.filter(b => b.date === date && b.status === 'assigned');
  const validSlots = db.timeSlots.filter(s => !s.applicableDays || s.applicableDays.includes(targetDay));
  const ds = db.displaySettings || { teacher: true, className: true };
  const displayOrder = db.displayOrder || DEFAULT_DISPLAY_ORDER;

  return (
    <div className="animate-fade-in">
      <div className="bg-white p-5 sm:p-6 rounded-2xl border shadow-sm mt-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="text-xl font-bold flex items-center text-slate-800"><CalendarIcon className="w-5 h-5 mr-2 text-sky-600" /> 每日充電車時間表</h2>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-4 py-2 border rounded-lg font-bold outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50" />
        </div>
        
        <div className="overflow-x-auto custom-scrollbar pb-2">
          <table className="w-full table-fixed text-sm text-center border-collapse min-w-[800px]">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-3 border-b font-bold px-2 w-[100px] sm:w-[130px] bg-slate-100 sticky left-0 z-20">節次 \ 車輛</th>
                {db.carts.map(c => <th key={c.id} className="p-3 border-b font-bold px-2">{c.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {validSlots.length === 0 ? (
                <tr><td colSpan={db.carts.length + 1} className="p-6 text-slate-500">本日無開放借用時段</td></tr>
              ) : (
                validSlots.map(slot => (
                  <tr key={slot.id} className="hover:bg-slate-50 border-b last:border-0">
                    <td className="p-3 font-bold text-center border-r bg-white sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      {slot.name} <span className="text-[10px] sm:text-xs text-slate-400 block font-normal mt-1">{slot.timeRange}</span>
                    </td>
                    {db.carts.map(cart => {
                      const bList = dayBookings.filter(x => x.cartAssignedId == cart.id && x.timeSlot === slot.name);
                      return (
                        <td key={cart.id} className="p-2 border-r last:border-0 align-top">
                          {bList.length > 0 ? bList.map((b, i) => (
                            <div key={b.id} className={`p-2 rounded-lg text-center mb-2 last:mb-0 shadow-sm border flex flex-col items-center gap-0.5 ${['bg-sky-50 border-sky-200 text-sky-900', 'bg-emerald-50 border-emerald-200 text-emerald-900', 'bg-purple-50 border-purple-200 text-purple-900'][i % 3]}`}>
                              {displayOrder.map(key => {
                                  if (!ds[key]) return null;
                                  switch(key) {
                                      case 'teacher': return b.teacher ? <div key="teacher" className="font-bold text-sm leading-tight">{b.teacher}</div> : null;
                                      case 'observation': return b.observation === '是' ? <div key="obs"><span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded animate-pulse shadow-sm">觀課</span></div> : null;
                                      case 'className': return b.className ? <div key="class" className="text-xs">{b.className}</div> : null;
                                      case 'pickupMethod': return b.pickupMethod ? <div key="pickup" className="text-[10px] text-slate-600">📦 {b.pickupMethod}</div> : null;
                                      case 'itSupport': return b.itSupport === '是' ? <div key="it" className="text-[10px] text-blue-700 font-bold">💻 需 IT</div> : null;
                                      case 'ipadNumbers': return b.ipadNumbers ? <div key="ipad" className="text-[10px] bg-white/70 rounded px-1 py-0.5 font-mono truncate max-w-full" title={b.ipadNumbers}>📱 {b.ipadNumbers}</div> : null;
                                      case 'remarks': return b.remarks ? <div key="rmk" className="text-[10px] text-slate-500 italic truncate max-w-full" title={b.remarks}>📝 {b.remarks}</div> : null;
                                      default: return null;
                                  }
                              })}
                            </div>
                          )) : <span className="text-slate-300 text-xs">空閒</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

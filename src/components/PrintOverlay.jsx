import React, { useState, useEffect } from 'react';
import { CalendarIcon } from 'lucide-react';
import { DateUtils, dayMap, slashChar, DEFAULT_DISPLAY_ORDER, API_URL, defaultDB } from './utils.jsx';

// ==========================================
// 🖨️ 獨立列印預覽層 (PrintOverlay) - A5 精準無白頁限制
// ==========================================
export default function PrintOverlay({ db, printData, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      try { window.print(); } catch(e) { console.error("列印被瀏覽器阻擋", e); }
    }, 500); 
    return () => clearTimeout(timer);
  }, []);

  const { date, cartIds } = printData;
  const targetDay = new Date(date).getDay();
  const cartsToPrint = db.carts.filter(c => cartIds.includes(c.id));
  const dayBookings = db.bookings.filter(b => b.date === date && b.status === 'assigned');
  const validSlots = db.timeSlots.filter(s => !s.applicableDays || s.applicableDays.includes(targetDay));

  return (
    <div className="fixed inset-0 bg-slate-300 z-[999999] overflow-y-auto print:static print:bg-white print:overflow-visible" id="print-overlay-react">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
            @page { 
                size: 210mm 148mm; 
                margin: 0 !important; 
            }
            html, body { 
                width: 210mm !important;
                height: 148mm !important;
                overflow: visible !important; 
                background: white !important; 
                margin: 0 !important; 
                padding: 0 !important; 
            }
            nav, main, #loading-overlay, #custom-alert, #edit-modal, #ipad-selector-modal { 
                display: none !important; 
            }
            #root, #root > div { 
                display: block !important; 
                position: static !important; 
            }
            #print-overlay-react { 
                position: absolute !important; 
                left: 0; top: 0; 
                width: 100% !important; 
                background: white !important; 
                display: block !important; 
                padding: 0 !important; 
                margin: 0 !important; 
            }
            .no-print { display: none !important; }
            
            /* 針對每一張表強制換頁，並限制絕對長寬 210mm x 147.5mm 避免溢出 */
            .a5-container { 
                width: 210mm !important; 
                height: 147.5mm !important; 
                padding: 10mm !important; 
                display: block !important; 
                box-sizing: border-box !important; 
                box-shadow: none !important; 
                margin: 0 auto !important; 
                border: none !important;
                page-break-after: always !important;
                page-break-inside: avoid !important;
                overflow: hidden !important;
                background: white !important;
            }
            .a5-container:last-child {
                page-break-after: auto !important;
            }
        }
      `}} />
      
      <div className="no-print bg-slate-800 p-4 sticky top-0 z-50 flex justify-between items-center shadow-lg">
        <h2 className="text-white text-lg font-bold">列印預覽模式</h2>
        <div className="space-x-3">
          <button onClick={onClose} className="px-5 py-2 bg-slate-600 text-white rounded-lg font-bold shadow hover:bg-slate-500 transition-colors">返回</button>
          <button onClick={() => window.print()} className="px-5 py-2 bg-sky-500 text-white rounded-lg font-bold shadow hover:bg-sky-400 transition-colors">🖨️ 確認列印</button>
        </div>
      </div>
      
      <div className="p-4 sm:p-8 space-y-8 print:p-0 print:space-y-0 print:block flex flex-col items-center">
        {cartsToPrint.map((cart, idx) => {
           const cartBookings = dayBookings.filter(x => x.cartAssignedId == cart.id);
           return (
              <div 
                  key={cart.id} 
                  className={`a5-container p-6 bg-white border-2 border-slate-800 rounded-2xl shadow-xl w-full max-w-[210mm] print:max-w-none print:p-0 print:mb-0 print:rounded-none print:shadow-none ${idx !== cartsToPrint.length - 1 ? 'page-break-after' : ''}`}
              >
                <div className="flex justify-between items-end border-b border-slate-400 pb-1 mb-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center text-white text-xl">📱</div>
                    <div>
                      <h2 className="text-2xl font-bold">{cart.name}</h2>
                      <p className="text-xs text-slate-600">{DateUtils.toChineseDate(date)}</p>
                    </div>
                  </div>
                  <div className="text-right"><p className="text-base font-bold text-slate-700">iPad 借用登記表</p></div>
                </div>
                <table className="w-full border-collapse border border-slate-800 text-[11px] sm:text-xs text-center">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-800 p-1.5 w-[8%]">節次</th>
                      <th className="border border-slate-800 p-1.5 w-[14%]">時間</th>
                      <th className="border border-slate-800 p-1.5 w-[10%]">教師</th>
                      <th className="border border-slate-800 p-1.5 w-[10%]">班級</th>
                      <th className="border border-slate-800 p-1.5 w-[6%]">數量</th>
                      <th className="border border-slate-800 p-1.5 w-[12%]">取機</th>
                      <th className="border border-slate-800 p-1.5 w-[16%]">iPad 編號</th>
                      <th className="border border-slate-800 p-1.5">備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validSlots.map(slot => {
                      const bList = cartBookings.filter(x => x.timeSlot === slot.name);
                      if (bList.length === 0) return null;
                      return bList.map(b => (
                        <tr key={b.id} className="h-9">
                          <td className="border border-slate-800 font-bold">{slot.name}</td>
                          <td className="border border-slate-800">{slot.timeRange || ''}</td>
                          <td className="border border-slate-800 font-bold">
                            {b.teacher}
                            {b.observation === '是' && (<span className="text-red-600 font-bold ml-1">(觀課)</span>)}
                          </td>
                          <td className="border border-slate-800">{b.className}</td>
                          <td className="border border-slate-800 font-bold">{b.peopleCount}</td>
                          <td className="border border-slate-800">{b.pickupMethod || ''}</td>
                          <td className="border border-slate-800 text-[9px] break-words whitespace-pre-wrap max-w-[150px] p-0.5 leading-tight">{b.ipadNumbers || ''}</td>
                          <td className="border border-slate-800 text-left px-1 text-[9px] whitespace-pre-wrap break-words">{b.remarks || ''}</td>
                        </tr>
                      ));
                    })}
                    {cartBookings.length === 0 && (
                      <tr><td colSpan="8" className="border border-slate-800 p-3 text-center text-slate-500 font-bold">本日該車無分配紀錄</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
           );
        })}
      </div>
    </div>
  );
}
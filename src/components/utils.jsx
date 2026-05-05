/* eslint-disable react-refresh/only-export-components */
import React, { useState, useEffect, Suspense, startTransition } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { Cloud, Calendar as CalendarIcon, ClipboardList, Settings, LogOut, CheckCircle, XCircle, Info, ShieldAlert, Trash2, Clock, Smartphone } from 'lucide-react';


// ==========================================
// ⚙️ 全域設定與工具函式
// ==========================================
export const slashChar = String.fromCharCode(47);
export const quoteChar = String.fromCharCode(34);
export const doubleQuote = quoteChar + quoteChar;

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const API_URL = import.meta.env.VITE_GAS_API_URL;

// 初始化 Firebase
export const app = initializeApp(firebaseConfig);
export const db_firestore = getFirestore(app);

export const dayMap = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };
export const DEFAULT_DISPLAY_ORDER = ['observation', 'teacher', 'className', 'pickupMethod', 'itSupport', 'ipadNumbers', 'remarks'];

export const DateUtils = {
  today: () => new Date(),
  toISODate: (date) => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  },
  // 確保這個中文日期轉換功能真的有在裡面！
  toChineseDate: (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.getFullYear() + "年 " + (d.getMonth() + 1) + "月 " + d.getDate() + "日 (星期" + dayMap[d.getDay()] + ")";
  }
};

export const hashPassword = async (message) => {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const parseTimeRange = (rangeStr) => {
  if (!rangeStr) return null;
  const matches = rangeStr.match(new RegExp('(\\d{1,2})[:：](\\d{2})\\s*[-~至]\\s*(\\d{1,2})[:：](\\d{2})'));
  if (matches) {
    return { 
      start: parseInt(matches[1], 10) * 60 + parseInt(matches[2], 10), 
      end: parseInt(matches[3], 10) * 60 + parseInt(matches[4], 10) 
    };
  }
  return null;
};

export const checkOverlap = (r1, r2) => r1 && r2 && (r1.start < r2.end && r2.start < r1.end);

export const getOverlappingSlots = (slotName, currentDb) => {
  if (!currentDb || !currentDb.timeSlots) return [slotName];
  const slot = currentDb.timeSlots.find(s => s.name === slotName);
  if (!slot) return [slotName];
  const myTime = parseTimeRange(slot.timeRange);
  if (!myTime) return [slotName]; 
  
  return currentDb.timeSlots.filter(otherSlot => {
    if (slot.name === otherSlot.name) return true;
    const otherTime = parseTimeRange(otherSlot.timeRange);
    if (otherTime) return checkOverlap(myTime, otherTime);
    return false;
  }).map(s => s.name);
};

export const parseIpadNumbers = (str) => {
  if (!str) return [];
  let res = [];
  str.split(',').forEach(p => {
    p = p.trim();
    if (p.includes('-')) {
      let parts = p.split('-');
      let start = parseInt(parts[0], 10); 
      let end = parseInt(parts[1], 10);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) res.push(i.toString());
      }
    } else if (p) {
      res.push(p);
    }
  });
  return Array.from(new Set(res));
};

export const stringifyIpadNumbers = (arr) => {
  if (!arr || arr.length === 0) return "";
  arr = Array.from(new Set(arr)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  let res = []; 
  let start = parseInt(arr[0], 10); 
  let prev = start;
  for (let i = 1; i < arr.length; i++) {
    let curr = parseInt(arr[i], 10);
    if (curr === prev + 1) {
      prev = curr;
    } else {
      res.push(start === prev ? start.toString() : (start + "-" + prev));
      start = prev = curr;
    }
  }
  res.push(start === prev ? start.toString() : (start + "-" + prev));
  return res.join(', ');
};

export const getUsedIpads = (date, timeSlot, cartId, excludeBookingId, currentDb) => {
  let used = []; 
  const overlappingNames = getOverlappingSlots(timeSlot, currentDb);
  currentDb.bookings.forEach(x => {
    if (x.status === 'assigned' && x.date === date && overlappingNames.includes(x.timeSlot) && x.cartAssignedId == cartId && x.id !== excludeBookingId) {
      used = used.concat(parseIpadNumbers(x.ipadNumbers));
    }
  });
  return used;
};

export const checkIsHoliday = (dateStr, currentDb) => {
  if (!currentDb || !currentDb.holidays) return null;
  return currentDb.holidays.find(h => dateStr >= h.startDate && dateStr <= h.endDate);
};

export const getNormalMinDate = (currentDb) => {
  let cur = DateUtils.today(); let count = 0;
  while (count < 2) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getDay() !== 0 && cur.getDay() !== 6 && !checkIsHoliday(DateUtils.toISODate(cur), currentDb)) count++;
  }
  return DateUtils.toISODate(cur);
};

export const calculateMaxDate = (currentDb) => {
  let cur = DateUtils.today(); let count = 0;
  while (count < 30) {
    cur.setDate(cur.getDate() + 1);
    if (!checkIsHoliday(DateUtils.toISODate(cur), currentDb)) count++;
  }
  return DateUtils.toISODate(cur);
};

export const normalizeAuthCode = (code) => {
  if (!code) return '';
  let normalized = String(code).replace(new RegExp('[\\uFF01-\\uFF5E]', 'g'), function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  });
  return normalized.replace(new RegExp('[^A-Za-z0-9]', 'g'), '').toUpperCase();
};

export const defaultDB = {
  carts: [{ id: 1, name: "充電車 B", capacity: 30, damaged: "" }],
  classes: [{ id: 1, name: "一年甲班", limit: 30 }],
  timeSlots: [{ id: 1, name: "第一節", timeRange: "08:40 - 09:20", quota: 2, remark: "", showRemark: false, applicableDays: [1, 2, 3, 4, 5, 6, 0] }],
  pickupMethods: [{ id: 1, name: "送到課室" }, { id: 2, name: "送到教員室" }, { id: 3, name: "自取" }],
  displaySettings: { teacher: true, className: true, observation: true, ipadNumbers: true, pickupMethod: true, itSupport: true, remarks: false },
  displayOrder: DEFAULT_DISPLAY_ORDER,
  holidays: [], bookings: [], bookingCodes: [], admins: [{ username: 'admin', password: 'ckadmin123' }]
};



"use client";
import { useState, useEffect } from 'react';

export default function HomeModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem('seen_welcome_modal');
    if (!hasSeen) {
      const timer = setTimeout(() => setShow(true), 5000); // 5 segundos de delay
      return () => clearTimeout(timer);
    }
  }, []);

  const close = () => {
    localStorage.setItem('seen_welcome_modal', 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-white rounded-[3rem] p-10 max-w-md w-full relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-2 bg-[#ffdb00]" />
        <button onClick={close} className="absolute top-6 right-6 text-slate-400 hover:text-black font-black">✕</button>
        
        <div className="text-center space-y-6">
          <div className="text-5xl">🔔</div>
          <h3 className="text-3xl font-black uppercase italic leading-none tracking-tighter">
            Price Alert <br/> <span className="text-[#ffdb00]">Activated!</span>
          </h3>
          <p className="text-slate-500 text-sm font-medium italic">
            Don't miss a single drop. Get notified when your favorite tech hits the lowest price ever.
          </p>
          <div className="space-y-3">
            <input type="email" placeholder="ENTER YOUR EMAIL" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-[#ffdb00] outline-none font-bold text-xs uppercase" />
            <button className="w-full bg-black text-white p-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-slate-800 transition-colors">
              Start Tracking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
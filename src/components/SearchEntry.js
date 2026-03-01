//searchentry.js

"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function SearchEntry() {
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [loading, setLoading] = useState(false);
    
    const router = useRouter();
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);

    const formatProductName = (name) => {
        if (!name) return "";
        return name
            .replace(/\(.*\)/g, '') 
            .replace(/Unlocked|Sim-Free|International Version/gi, '') 
            .replace(/\s+/g, ' ') 
            .trim()
            .substring(0, 50);
    };

    const clearSearch = () => {
        setQuery("");
        setSuggestions([]);
        setShowSuggestions(false);
        inputRef.current?.focus();
    };

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (query.trim().length <= 1) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            if (document.activeElement !== inputRef.current) return;

            setLoading(true);
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}&limit=10&sortBy=relevance`);
                const data = await res.json();
                if (data.items && document.activeElement === inputRef.current) {
                    setSuggestions(data.items.slice(0, 5)); 
                    setShowSuggestions(true);
                }
            } catch (error) { 
                console.error(error); 
            } finally { 
                setLoading(false); 
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [query]);

    // --- CORREÇÃO AQUI ---
    const handleSelectSuggestion = (item) => {
        setQuery(item.name);
        setSuggestions([]);
        setShowSuggestions(false);
        
        // Remove o foco do input para o teclado sumir no celular
        inputRef.current?.blur();
        
        router.push(`/search?q=${encodeURIComponent(item.name)}`);
    };

    // --- CORREÇÃO AQUI ---
    const handleSearchSubmit = (e) => {
        e.preventDefault();
        if (!query.trim()) return;
        
        setSuggestions([]);
        setShowSuggestions(false);
        
        // Remove o foco do input para o teclado sumir no celular
        inputRef.current?.blur();
        
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    };

    return (
        <div ref={wrapperRef} className="flex-1 w-full max-w-2xl relative">
            <form onSubmit={handleSearchSubmit} className="relative">
                <input 
                    ref={inputRef}
                    type="text" 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => query.length > 1 && suggestions.length > 0 && setShowSuggestions(true)}
                    placeholder="Search for products..." 
                    className="w-full py-3 pl-5 pr-24 rounded-full border-none bg-white text-gray-900 shadow-lg text-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all" 
                    // Garante que o botão de "ir" do celular submeta o form corretamente
                    enterKeyHint="search"
                />
                
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
                    {query.length > 0 && (
                        <button 
                            type="button"
                            onClick={clearSearch}
                            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}

                    <button type="submit" aria-label="Search" className="bg-white text-gray-400 p-2 rounded-full hover:text-blue-600 transition-colors">
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin"></div>
                        ) : (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        )}
                    </button>
                </div>
            </form>

            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[100] overflow-hidden">
                    <div className="p-2 flex flex-col gap-1">
                        {suggestions.map((item) => (
                            <div 
                                key={item.id}
                                // Usamos onMouseDown em vez de onClick para evitar 
                                // conflitos de blur/focus em dispositivos móveis
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSelectSuggestion(item);
                                }}
                                className="flex items-start p-3 hover:bg-slate-50 rounded-xl cursor-pointer group transition-colors"
                            >
                                <div className="hidden sm:flex w-14 h-14 flex-none bg-white rounded-lg border border-gray-50 items-center justify-center p-1 overflow-hidden mr-4">
                                    <img src={item.image} alt="" className="max-w-full max-h-full object-contain mix-blend-multiply" />
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start gap-2">
                                        <h4 className="font-bold text-sm text-gray-800 truncate group-hover:text-blue-600 transition-colors leading-tight">
                                            {formatProductName(item.name)}
                                        </h4>
                                        <span className="flex-none text-base font-black text-gray-900 leading-tight">
                                            ${Number(item.salePrice).toFixed(2)}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mt-1">
                                        {item.brand}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
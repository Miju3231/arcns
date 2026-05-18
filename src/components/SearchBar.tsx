import { useState } from "react";
import { useLocation } from "wouter";
import { isValidDomainName } from "@/lib/ens-utils";
import { TLD } from "@/lib/contracts";

interface SearchBarProps {
  size?: "lg" | "sm";
  initialValue?: string;
}

export function SearchBar({ size = "lg", initialValue = "" }: SearchBarProps) {
  const [query, setQuery] = useState(initialValue);
  const [, navigate] = useLocation();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim().toLowerCase().replace(/\.arc$/, "");
    if (trimmed) {
      navigate(`/domain/${trimmed}`);
    }
  };

  const isValid = query.trim().length === 0 || isValidDomainName(query.trim());

  if (size === "sm") {
    return (
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search .${TLD} names`}
          className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
        />
        <button
          type="submit"
          className="flex-shrink-0 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          Search
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSearch} className="w-full max-w-2xl mx-auto px-2 sm:px-0">
      <div className="relative group">
        <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
        <div className="relative flex items-center bg-white/5 border border-white/10 group-focus-within:border-indigo-500/50 rounded-xl sm:rounded-2xl overflow-hidden transition-colors">
          <div className="pl-4 text-white/40 flex-shrink-0">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value.toLowerCase().replace(/\s/g, ""))}
            placeholder={`Search for a .${TLD} name`}
            className="flex-1 min-w-0 px-3 py-4 sm:py-5 bg-transparent text-white placeholder-white/30 text-base sm:text-lg focus:outline-none"
          />
          <button
            type="submit"
            className="flex-shrink-0 m-1.5 sm:m-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-sm sm:text-base font-medium transition-all shadow-lg shadow-indigo-500/20"
          >
            Search
          </button>
        </div>
        {query && !isValid && (
          <p className="mt-2 text-xs text-red-400 pl-4">
            Names must be 3+ characters, lowercase letters, numbers, or hyphens.
          </p>
        )}
      </div>
    </form>
  );
}

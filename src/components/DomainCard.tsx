import { Link } from "wouter";
import { TLD } from "@/lib/contracts";
import { formatAddress } from "@/lib/ens-utils";

interface DomainCardProps {
  name: string;
  owner?: string;
  expiry?: number;
  isOwned?: boolean;
}

export function DomainCard({ name, owner, expiry, isOwned }: DomainCardProps) {
  const label = name.replace(`.${TLD}`, "");
  const fullName = name.includes(`.${TLD}`) ? name : `${name}.${TLD}`;
  const isExpired = expiry ? expiry * 1000 < Date.now() : false;
  const daysLeft = expiry
    ? Math.max(0, Math.ceil((expiry * 1000 - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <Link href={`/domain/${label}`}>
      <div className="group relative p-4 rounded-xl bg-white/3 border border-white/8 hover:border-indigo-500/40 hover:bg-white/5 transition-all cursor-pointer overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/0 to-purple-500/0 group-hover:from-indigo-500/5 group-hover:to-purple-500/5 transition-all" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-indigo-300 font-bold text-sm uppercase">
                {label[0]}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-white truncate">
                {label}
                <span className="text-white/40">.{TLD}</span>
              </p>
              {owner && (
                <p className="text-xs text-white/40 truncate">
                  {formatAddress(owner)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isOwned && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                Owned
              </span>
            )}
            {isExpired && (
              <span className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
                Expired
              </span>
            )}
            {daysLeft !== null && !isExpired && daysLeft < 30 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                {daysLeft}d left
              </span>
            )}
            <svg
              className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  );
}

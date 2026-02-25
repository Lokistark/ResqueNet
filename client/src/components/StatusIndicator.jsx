import { Wifi, WifiOff } from 'lucide-react';

const StatusIndicator = ({ isOnline, socketConnected }) => {
    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-bold text-[10px] uppercase tracking-widest transition-colors ${!isOnline ? 'bg-orange-100 text-orange-700 border border-orange-200 animate-pulse' : (socketConnected ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-blue-100 text-blue-700 border border-blue-200 animate-pulse')}`}>
            {!isOnline ? (
                <>
                    <WifiOff size={14} /> Offline
                </>
            ) : socketConnected ? (
                <>
                    <Wifi size={14} /> Live: Sync Active
                </>
            ) : (
                <>
                    <Wifi size={14} className="animate-spin" /> Link Establishing...
                </>
            )}
        </div>
    );
};

export default StatusIndicator;

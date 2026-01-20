import { Wifi, WifiOff } from 'lucide-react';

const StatusIndicator = ({ isOnline }) => {
    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-bold text-xs uppercase tracking-widest ${isOnline ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-orange-100 text-orange-700 border border-orange-200 animate-pulse'}`}>
            {isOnline ? (
                <>
                    <Wifi size={14} /> Connected
                </>
            ) : (
                <>
                    <WifiOff size={14} /> Offline - Saving Locally
                </>
            )}
        </div>
    );
};

export default StatusIndicator;
